"""HTTP server (faqat Python standart kutubxonasi): REST API + veb interfeys.

Foydalanuvchi huquqlari har bir so'rovda server tomonida tekshiriladi.
"""
import base64
import json
import mimetypes
import re
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import actions, analytics, config, evaluation
from .agent import Agent
from .auth import ACTION_LABELS, audit, can, can_view_doc, can_view_teacher, login, now, user_by_token
from .db import open_db
from .importer import docx_bytes_to_doc, text_chunks
from .seed import add_document

STATE = {}
MAX_UPLOAD = 10 * 1024 * 1024


class Forbidden(Exception):
    pass


def require(user, perm):
    if not can(user, perm):
        raise Forbidden(perm)


ROUTES = []


def route(method, pattern, auth=True):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn, auth))
        return fn
    return deco


class FileResponse:
    def __init__(self, path, name):
        self.path, self.name = path, name


# ------------------------------------------------------------------ kirish
@route("POST", "/api/login", auth=False)
def api_login(db, user, body):
    tok = login(db, body.get("username", ""), body.get("password", ""))
    if not tok:
        return 401, {"error": "Login yoki parol noto'g'ri"}
    return 200, {"token": tok}


@route("GET", "/api/me")
def api_me(db, user, body):
    return 200, {**user, "today": str(config.today()), "llm": STATE["llm"]}


# ------------------------------------------------------------------ bugungi kafedra, kotib
@route("GET", "/api/brief")
def api_brief(db, user, body):
    b = analytics.daily_brief(db)
    if user["role"] == "oqituvchi":
        tid = user["teacher_id"]
        b["top_issue"] = next((r for r in analytics.early_warnings(db) if r["teacher_id"] == tid), None)
        b["pending_list"] = [p for p in b["pending_list"] if p["teacher_id"] == tid]
        b["secretary"] = []
    return 200, b


@route("GET", "/api/secretary")
def api_secretary(db, user, body):
    require(user, "view_all")
    return 200, {"items": analytics.secretary(db), "meeting": _meeting(db), "alerts": analytics.deadline_alerts(db)}


def _meeting(db):
    m = analytics.meeting_agenda(db)
    m["last"] = {k: m["last"][k] for k in ("id", "title", "date")} if m["last"] else None
    return m


@route("POST", "/api/ask")
def api_ask(db, user, body):
    q = (body.get("question") or "").strip()
    if not q:
        return 400, {"error": "Savol bo'sh"}
    if len(q) > 1000:
        return 400, {"error": "Savol juda uzun (1000 belgidan oshmasin)"}
    return 200, STATE["agent"].ask(user, q)


@route("GET", "/api/traces")
def api_traces(db, user, body):
    sql = "SELECT id, ts, username, question, intent, status, ms FROM ai_traces"
    if can(user, "view_audit"):
        rows = db.q(sql + " ORDER BY id DESC LIMIT 100")
    else:
        rows = db.q(sql + " WHERE username=? ORDER BY id DESC LIMIT 100", (user["username"],))
    return 200, rows


@route("GET", r"/api/traces/(\d+)")
def api_trace(db, user, body, tid):
    r = db.one("SELECT * FROM ai_traces WHERE id=?", (int(tid),))
    if not r or (r["username"] != user["username"] and not can(user, "view_audit")):
        return 404, {"error": "Topilmadi"}
    r["trace"] = json.loads(r["trace"])
    r["sources"] = json.loads(r["sources"])
    return 200, r


# ------------------------------------------------------------------ raqamli xotira
@route("GET", "/api/documents")
def api_docs(db, user, body):
    rows = db.q("SELECT id, title, type, date, access, owner, source, added_by, file, demo FROM documents ORDER BY id")
    review = {c["doc_id"] for c in analytics.claims_check(db) if not c["ok"]} | \
             {d["doc"] for d in analytics.duplicate_documents(db)}
    out = []
    for r in rows:
        if can_view_doc(user, r):
            r["review"] = r["id"] in review
            out.append(r)
    return 200, out


@route("GET", r"/api/documents/(\w+)")
def api_doc(db, user, body, did):
    d = db.one("SELECT * FROM documents WHERE id=?", (did,))
    if not d:
        return 404, {"error": "Hujjat topilmadi"}
    if not can_view_doc(user, d):
        audit(db, user, "permission_denied", f"Hujjat {did}", "Raqamli xotira")
        return 403, {"error": "Ruxsat mavjud emas"}
    audit(db, user, "document_view", f"{did} — {d['title']}", "Raqamli xotira")
    d["claims"] = [c for c in analytics.claims_check(db) if c["doc_id"] == did]
    d["duplicates"] = [x for x in analytics.duplicate_documents(db) if did in (x["doc"], x["similar_to"])]
    return 200, d


@route("GET", r"/api/documents/(\w+)/file")
def api_doc_file(db, user, body, did):
    d = db.one("SELECT * FROM documents WHERE id=?", (did,))
    if not d or not d["file"]:
        return 404, {"error": "Asl fayl mavjud emas"}
    if not can_view_doc(user, d):
        raise Forbidden("document")
    audit(db, user, "file_view", f"{did} asl fayli", "Raqamli xotira")
    return 200, FileResponse(config.DATA_DIR / d["file"], d["file"].split("/")[-1])


@route("POST", "/api/documents")
def api_doc_add(db, user, body):
    require(user, "upload_doc")
    n = 1
    while db.one("SELECT id FROM documents WHERE id=?", (f"Y{n:02d}",)):
        n += 1
    did = f"Y{n:02d}"
    date = body.get("date") or str(config.today())
    if body.get("file_b64"):
        raw = base64.b64decode(body["file_b64"])
        if len(raw) > MAX_UPLOAD:
            return 400, {"error": "Fayl hajmi 10 MB dan oshmasin"}
        name = body.get("filename", "hujjat.docx")
        if name.lower().endswith(".docx"):
            if not raw.startswith(b"PK"):
                return 400, {"error": "Fayl .docx formatida emas"}
            try:
                meta = docx_bytes_to_doc(raw, did, name, date)
            except Exception:
                return 400, {"error": "Word faylini o'qib bo'lmadi"}
        elif name.lower().endswith((".txt", ".md")):
            text = raw.decode("utf-8", errors="replace")
            meta = {"id": did, "title": name.rsplit(".", 1)[0], "body": text, "chunks": text_chunks(text)}
        else:
            return 400, {"error": "Faqat .docx, .txt yoki .md fayllar qabul qilinadi"}
        if body.get("title"):
            meta["title"] = body["title"]
    else:
        meta = {"id": did, "title": body["title"], "body": body["body"], "chunks": text_chunks(body["body"])}
    meta.update({"type": body.get("type") or meta.get("type", "hujjat"), "date": date,
                 "access": body.get("access", "public"), "source": body.get("source") or "Interfeys orqali yuklangan"})
    if meta["access"] not in ("public", "mudir"):
        meta["access"] = "public"
    meta["owner"] = None
    dup = db.one("SELECT id FROM documents WHERE checksum=?",
                 (__import__("hashlib").sha1(re.sub(r"\W+", "", meta["body"].lower()).encode()).hexdigest(),))
    add_document(db, meta, added_by=user["username"], added_at=now())
    STATE["agent"].reindex()
    audit(db, user, "document_add", f"{did} {meta['title']}", "Raqamli xotira", None, f"{len(meta['chunks'])} ta bo'lak")
    return 200, {"id": did, "chunks": len(meta["chunks"]), "duplicate_of": dup["id"] if dup else None}


# ------------------------------------------------------------------ o'qituvchilar, ko'rsatkichlar, dalillar
@route("GET", "/api/teachers")
def api_teachers(db, user, body):
    return 200, [r for r in analytics.kpi_overview(db) if can_view_teacher(user, r["id"])]


@route("GET", r"/api/teachers/(T\d+)")
def api_teacher(db, user, body, tid):
    if not can_view_teacher(user, tid):
        audit(db, user, "permission_denied", f"O'qituvchi 360: {tid}", "O'qituvchi 360")
        return 403, {"error": "Ruxsat mavjud emas: o'qituvchi faqat o'z ma'lumotlarini ko'radi"}
    k = analytics.kpi(db, tid)
    plan = db.one("SELECT * FROM science_plans WHERE teacher_id=?", (tid,))
    tasks = db.q("SELECT * FROM tasks WHERE assignee=? ORDER BY deadline", (tid,))
    risks = [r for r in analytics.early_warnings(db) if r["teacher_id"] == tid]
    load = analytics.teacher(db, tid)
    projects = [c["text"] for c in db.q("SELECT text FROM chunks WHERE doc_id='D11'") if k["teacher"]["short_name"] in c["text"]]
    lessons = [c["text"] for c in db.q("SELECT text FROM chunks WHERE doc_id='D09'") if k["teacher"]["short_name"] in c["text"]]
    audit(db, user, "teacher360_view", k["teacher"]["short_name"], "O'qituvchi 360")
    return 200, {"kpi": k, "plan": plan, "tasks": tasks, "risks": risks, "load": load, "projects": projects,
                 "lessons": lessons, "graph": analytics.evidence_graph(db, tid),
                 "devplan": analytics.development_plan(db, tid)}


@route("GET", "/api/evidence")
def api_evidence(db, user, body):
    rows = db.q("SELECT e.*, t.short_name FROM evidence e JOIN teachers t ON t.id=e.teacher_id ORDER BY e.id")
    return 200, [r for r in rows if can_view_teacher(user, r["teacher_id"])]


@route("GET", r"/api/evidence/(\d+)/file")
def api_evidence_file(db, user, body, eid):
    e = db.one("SELECT * FROM evidence WHERE id=?", (int(eid),))
    if not e or not e["file"]:
        return 404, {"error": "Dalil fayli topilmadi"}
    if not can_view_teacher(user, e["teacher_id"]):
        raise Forbidden("evidence_file")
    audit(db, user, "file_view", f"Dalil #{eid}: {e['title']}", "Dalillar ombori")
    return 200, FileResponse(config.DATA_DIR / e["file"], e["file"].split("/")[-1])


@route("POST", "/api/evidence")
def api_evidence_add(db, user, body):
    tid = user.get("teacher_id") or body.get("teacher_id")
    if not tid or not can_view_teacher(user, tid):
        raise Forbidden("upload_evidence")
    eid = db.x("""INSERT INTO evidence(teacher_id, category, type, subtype, title, score, status, doi, has_pdf, file,
                  doc_ref, source, created_at, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
               (tid, body["category"], body.get("type", body["category"]), body.get("subtype", ""), body["title"],
                float(body.get("score", 0)), "kutilmoqda", body.get("doi", ""), int(bool(body.get("has_pdf"))), None,
                "D04", "Interfeys orqali yuklangan", str(config.today()), ""))
    audit(db, user, "evidence_upload", f"Dalil #{eid}: {body['title']}", "Dalillar ombori", None, "kutilmoqda")
    return 200, {"id": eid}


@route("POST", r"/api/evidence/(\d+)/review")
def api_evidence_review(db, user, body, eid):
    require(user, "approve_evidence")
    if body.get("status") not in ("tasdiqlangan", "rad etilgan"):
        return 400, {"error": "Holat noto'g'ri"}
    return 200, actions.review_evidence(db, user, int(eid), body["status"], body.get("note", ""))


# ------------------------------------------------------------------ ogohlantirish, vazifalar
@route("GET", "/api/warnings")
def api_warnings(db, user, body):
    rows = analytics.early_warnings(db)
    if user["role"] == "oqituvchi":
        rows = [r for r in rows if r["teacher_id"] == user["teacher_id"]]
    return 200, rows


@route("POST", "/api/warnings/plan")
def api_plan(db, user, body):
    require(user, "create_task")
    risk = next((r for r in analytics.early_warnings(db) if r["id"] == body["risk_id"]), None)
    if not risk:
        return 404, {"error": "Xavf belgisi topilmadi"}
    picked = body.get("indexes")
    if picked is None:
        picked = list(range(len(risk["recommendations"])))
    made = [actions.create_task(db, user, rec["text"], assignee=rec["assignee"], responsible=rec["responsible"],
                                deadline=rec["deadline"], control=rec["control"], priority=rec.get("priority", "o'rta"),
                                source=f"Erta ogohlantirish {risk['id']}", evidence_refs=risk.get("docs", []),
                                description="Nega? " + "; ".join(risk["why"]))
            for i, rec in enumerate(risk["recommendations"]) if i in picked]
    return 200, made


@route("GET", "/api/health")
def api_health(db, user, body):
    return 200, {"data_health": analytics.data_health(db), "health_map": analytics.health_map(db),
                 "sources": db.q("SELECT * FROM data_sources ORDER BY last_sync DESC"),
                 "issues": analytics.quality_issues(db) if can(user, "view_all") else [],
                 "claims": analytics.claims_check(db) if can(user, "view_all") else []}


@route("GET", "/api/reconciliation")
def api_rec(db, user, body):
    require(user, "view_all")
    return 200, analytics.reconciliation(db)


@route("GET", r"/api/lineage/(\w+)")
def api_lineage(db, user, body, etype):
    require(user, "view_all")
    return 200, analytics.evidence_count_lineage(db, etype)


@route("GET", "/api/tasks")
def api_tasks(db, user, body):
    return 200, actions.list_tasks(db, user)


@route("POST", "/api/tasks")
def api_task_add(db, user, body):
    require(user, "create_task")
    return 200, actions.create_task(db, user, body["title"], assignee=body.get("assignee") or None,
                                    responsible=body.get("responsible"), deadline=body.get("deadline") or None,
                                    control=body.get("control") or None, description=body.get("description", ""),
                                    priority=body.get("priority") or "o'rta", evidence_refs=body.get("docs") or [],
                                    source=body.get("source") or "Qo'lda kiritilgan")


@route("POST", r"/api/tasks/(\d+)/status")
def api_task_status(db, user, body, tid):
    t = db.one("SELECT * FROM tasks WHERE id=?", (int(tid),))
    if not t:
        return 404, {"error": "Vazifa topilmadi"}
    if not (can(user, "create_task") or t["assignee"] == user.get("teacher_id")):
        raise Forbidden("task_status")
    if body.get("status") not in ("yangi", "jarayonda", "bajarildi"):
        return 400, {"error": "Holat noto'g'ri"}
    return 200, actions.set_task_status(db, user, int(tid), body["status"], body.get("progress"))


# ------------------------------------------------------------------ hisobotlar
@route("GET", "/api/reports")
def api_reports(db, user, body):
    require(user, "view_all")
    return 200, db.q("SELECT * FROM reports ORDER BY id DESC")


@route("POST", "/api/reports")
def api_report_new(db, user, body):
    require(user, "approve_report")
    return 200, actions.weekly_report(db, user)


@route("POST", r"/api/reports/(\d+)/approve")
def api_report_approve(db, user, body, rid):
    require(user, "approve_report")
    return 200, actions.approve_report(db, user, int(rid))


# ------------------------------------------------------------------ harakatlar tarixi, baholash
@route("GET", "/api/audit")
def api_audit(db, user, body):
    require(user, "view_audit")
    rows = db.q("SELECT * FROM audit_log ORDER BY id DESC LIMIT 300")
    for r in rows:
        r["action_label"] = ACTION_LABELS.get(r["action"], r["action"])
    return 200, rows


@route("POST", "/api/audit/view")
def api_audit_view(db, user, body):
    audit(db, user, "page_view", body.get("page", ""), body.get("page", ""))
    return 200, {"ok": True}


@route("GET", "/api/eval")
def api_eval(db, user, body):
    return 200, evaluation.latest() or {}


@route("POST", "/api/eval/run")
def api_eval_run(db, user, body):
    require(user, "run_eval")
    audit(db, user, "eval_run", "Baholash to'plami", "Baholash markazi")
    return 200, evaluation.run()


@route("GET", "/api/time-trials")
def api_tt(db, user, body):
    rows = db.q("SELECT * FROM time_trials ORDER BY id")
    tr = sum(r["traditional_sec"] for r in rows)
    ag = sum(r["agent_sec"] for r in rows)
    return 200, {"rows": rows, "traditional_total": tr, "agent_total": ag,
                 "saving_pct": round(100 * (tr - ag) / tr, 1) if tr else None}


@route("POST", "/api/time-trials")
def api_tt_add(db, user, body):
    tr, ag = float(body["traditional_sec"]), float(body["agent_sec"])
    if tr <= 0 or ag <= 0:
        return 400, {"error": "Vaqt musbat son bo'lishi kerak"}
    db.x("INSERT INTO time_trials(task, traditional_sec, agent_sec, tester, ts) VALUES(?,?,?,?,?)",
         (body["task"], tr, ag, user["username"], now()))
    audit(db, user, "time_trial_add", body["task"], "Baholash markazi")
    return 200, {"ok": True}


# ------------------------------------------------------------------ handler
class Handler(BaseHTTPRequestHandler):
    server_version = "KafedraAgent/2.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, payload, ctype="application/json; charset=utf-8", extra=None):
        data = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _file(self, fr: FileResponse):
        p = fr.path.resolve()
        if not str(p).startswith(str(config.DATA_DIR.resolve())) or not p.is_file():
            return self._send(404, {"error": "Fayl topilmadi"})
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if p.suffix == ".docx":
            ctype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disp = "inline" if p.suffix == ".pdf" else "attachment"
        from urllib.parse import quote
        self._send(200, p.read_bytes(), ctype, {"Content-Disposition": f"{disp}; filename*=UTF-8''{quote(fr.name)}"})

    def _static(self, path):
        path = "index.html" if path in ("/", "") else path.lstrip("/")
        f = (config.WEB_DIR / path).resolve()
        if not str(f).startswith(str(config.WEB_DIR.resolve())) or not f.is_file():
            return self._send(404, {"error": "Sahifa topilmadi"})
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, f.read_bytes(), ctype)

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self._static(path)
        db = STATE["db"]
        body = {}
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_UPLOAD * 1.4:
                return self._send(413, {"error": "So'rov hajmi juda katta"})
            if n:
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except json.JSONDecodeError:
                    return self._send(400, {"error": "So'rov formati noto'g'ri"})
        for m, rx, fn, need_auth in ROUTES:
            mt = rx.match(path)
            if m == method and mt:
                user = None
                if need_auth:
                    tok = (self.headers.get("Authorization") or "").replace("Bearer ", "")
                    user = user_by_token(db, tok)
                    if not user:
                        return self._send(401, {"error": "Avval tizimga kiring"})
                try:
                    code, payload = fn(db, user, body, *mt.groups())
                except Forbidden as e:
                    audit(db, user, "permission_denied", f"{path} ({e})", "API")
                    code, payload = 403, {"error": "Ruxsat mavjud emas"}
                except (KeyError, ValueError) as e:
                    code, payload = 400, {"error": f"Ma'lumot to'liq emas yoki noto'g'ri: {e}"}
                except Exception:
                    traceback.print_exc()
                    code, payload = 500, {"error": "Xatolik yuz berdi. Tafsilotlar server jurnalida."}
                if isinstance(payload, FileResponse):
                    return self._file(payload)
                return self._send(code, payload)
        self._send(404, {"error": "So'rov manzili topilmadi"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


def serve(host=config.HOST, port=config.PORT, reset=False):
    from . import llm
    STATE["db"] = open_db(reset=reset)
    STATE["agent"] = Agent(STATE["db"])
    STATE["llm"] = config.LLM_MODEL if llm.available() else "lokal (manbadan iqtibos)"
    if not evaluation.latest():
        print("Birinchi ishga tushirish: sun'iy intellekt baholash to'plami bajarilmoqda...")
        evaluation.run()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"KafedraAgent ishga tushdi: http://{host}:{port}")
    print("Kirish: mudir/mudir123 · dekan/dekan123 · aliyev/aliyev123 · karimova/karimova123 · admin/admin123")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nTo'xtatildi.")
