"""KafedraAgent: savol → shaxs va huquq → so'rov turi → ma'lumot qidirish → javob sifati nazorati
→ dalil bilan javob + javob izi → kerak bo'lsa boshqaruv vazifasi.

Zanjir: Ma'lumot → Dalil → Tahlil → Muammo → Tavsiya → Vazifa → Mas'ul → Muddat → Nazorat
"""
import json
import re
import time
from datetime import date, timedelta

from . import actions, analytics, config, llm
from .auth import audit, can, can_view_doc, can_view_teacher, now
from .db import DB
from .retrieval import Index
from .text import fmt_date, normalize, parse_date, tokenize

FULL = {"rerank": True, "gate": True, "k": config.TOP_K, "structured": True, "name": "C"}

INTENT_LABELS = {
    "rag": "Hujjatlardan qidirish", "kpi": "Faoliyat ko'rsatkichi", "kpi_evidence": "Ko'rsatkich dalillari",
    "count": "Ko'rsatkich soni va kelib chiqishi", "reconciliation": "Solishtirib tekshirish",
    "tasks": "Muddatlar va vazifalar", "load": "O'quv yuklamasi", "risk": "Erta ogohlantirish",
    "recommend": "Tavsiya", "health": "Ma'lumot sog'lomligi", "report": "Hisobot tayyorlash",
    "create_task": "Vazifa yaratish", "permission": "Ruxsatni tekshirish", "secretary": "Sun'iy intellekt kotibi",
    "meeting": "Yig'ilishga tayyorgarlik", "history": "Kafedra raqamli xotirasi", "doc_gaps": "Hujjat tahlili",
    "my_gaps": "Bajarilmagan bandlar", "my_plan": "Ilmiy reja holati", "my_month": "Oylik ishlar",
    "my_pending": "Tasdiqlanmagan hujjatlar", "devplan": "Rivojlanish rejasi",
}

CONFIDENTIAL_WORDS = ("maosh", "ustama", "attestatsiya", "individual ish rejasi", "shaxsiy", "maxfiy")
SURNAMES = {"aliyev": "T1", "karimova": "T2", "rahimov": "T3", "toshmatova": "T4",
            "yusupov": "T5", "ergasheva": "T6", "qodirov": "T7", "nazarova": "T8"}
KPI_WORDS = ("kpi", "faoliyat ko'rsatkich", "reyting")
INJECTION = re.compile(r"(e'tiborsiz qoldir|ko'rsatmalarni (bekor|unut)|maxfiy ma'lumotlarni (chiqar|ko'rsat)|"
                       r"ignore (all|previous)|system prompt|tizim ko'rsatma)", re.I)


def _has(nq, *words):
    return any(w in nq for w in words)


def find_teacher(nq: str):
    for tok in re.findall(r"[a-z']+", nq):
        for sur, tid in SURNAMES.items():
            if tok.startswith(sur):
                return tid
    return None


class Agent:
    def __init__(self, db: DB):
        self.db = db
        self.index = Index(db)

    def reindex(self):
        self.index.build()

    # ------------------------------------------------------------------ asosiy kirish
    def ask(self, user, question: str, cfg=None, log=True) -> dict:
        cfg = {**FULL, **(cfg or {})}
        t0 = time.perf_counter()
        res = self._route(user, question.strip(), cfg)
        res["ms"] = round((time.perf_counter() - t0) * 1000, 1)
        res["question"] = question
        res["config"] = cfg["name"]
        res["intent_label"] = INTENT_LABELS.get(res["intent"], res["intent"])
        res["trace"].insert(0, {"step": "Savol", "detail": question})
        res["trace"].insert(1, {"step": "Shaxs va huquq", "detail": f"{user['full_name']} — {user['role_label']}"})
        if not any(t["step"] == "Javob sifati nazorati" for t in res["trace"]):
            res["trace"].append({"step": "Javob sifati nazorati",
                                 "detail": "Manba ✓ (tuzilmali ma'lumot) · Ruxsat ✓ · Dalil ✓"})
        res["trace"].append({"step": "Xulosa", "detail": {
            "ok": "Javob manbalar bilan berildi", "abstain": "Javob berilmadi — dalil yetarli emas",
            "denied": "Ruxsat yo'q — ma'lumot berilmadi", "action": "Boshqaruv harakati bajarildi"}[res["status"]]})
        res["checks"] = self._checks(res)
        if log:
            tid = self.db.x("""INSERT INTO ai_traces(ts, username, question, intent, status, answer, trace,
                               sources, ms) VALUES(?,?,?,?,?,?,?,?,?)""",
                            (now(), user["username"], question, res["intent"], res["status"], res["answer"],
                             json.dumps(res["trace"], ensure_ascii=False),
                             json.dumps(res["sources"], ensure_ascii=False), res["ms"]))
            res["trace_id"] = tid
            audit(self.db, user, "ai_query", f"[{res['status']}] {question}", "Savol-javob")
        return res

    # ------------------------------------------------------------------ so'rov turini aniqlash
    def _route(self, user, q: str, cfg) -> dict:
        nq = normalize(q)
        if not cfg["structured"]:
            return self._rag(user, q, cfg)
        tid = find_teacher(nq)
        own = user.get("teacher_id")
        named = self._named_doc(nq, user)
        if named:
            return self._rag_in_doc(user, q, named, cfg)
        mine = bool(own) and _has(nq, "mening", "menga", "men ", "rejam", "qildim", "bajarmadim", "qoldim",
                                  "hujjatlarim", "dalillarim", "ko'rsatkichlarim", "ko'rsatkichim", "bajarishim")

        if _has(nq, "yarat", "topshir", "tuzib qo'y", "belgila") and _has(nq, "topshiri", "vazifa", "task", "topshir") \
                and (tid or parse_date(q, config.today())) and not _has(nq, "qanday vazifa", "vazifalarni ko'rsat"):
            return self._create_task(user, q, nq, tid)
        if _has(nq, "hisobot") and _has(nq, "tayyorla", "yarat", "tuzib") and not _has(nq, "farq", "solishtir", "dalil"):
            return self._report(user)
        if _has(nq, *CONFIDENTIAL_WORDS) and tid and not (can(user, "view_confidential") or own == tid):
            return self._denied(user, q, "Boshqa xodimning maxfiy (shaxsiy/kadrlar) ma'lumoti")
        if tid and _has(nq, *KPI_WORDS, "ball", "dalil", "tasdiqla", "rivojlanish") and not can_view_teacher(user, tid):
            return self._denied(user, q, "O'qituvchi faqat o'ziga tegishli ma'lumotlarni ko'ra oladi")
        if _has(nq, "bugun nima qil", "nima qilishim kerak", "ustuvor", "bugungi ishlar") and not mine:
            return self._secretary(user)
        if _has(nq, "yig'ilish") and _has(nq, "kun tartib", "tayyorgarlik", "tayyorla"):
            return self._meeting(user)
        if _has(nq, "o'tgan yil", "avval qanday", "ilgari qanday", "qanday hal qilingan"):
            return self._history(user, q)
        if _has(nq, "dalil yetishma", "dalili yetishma", "dalil yo'q", "qaysi ko'rsatkichlar uchun dalil"):
            return self._doc_gaps()
        if mine or (own and not tid and _has(nq, *KPI_WORDS)):
            r = self._personal(user, nq)
            if r:
                return r
        if _has(nq, "rivojlanish rejasi", "rivojlanish yo'nalish") and (tid or own):
            return self._devplan(user, tid or own)
        if _has(nq, *KPI_WORDS) and _has(nq, "qaysi hujjat", "qaysi dalil", "tasdiqlan", "nimaga asoslan", "asoslangan"):
            return self._kpi_evidence(user, tid or own)
        if _has(nq, *KPI_WORDS, "ball to'pla") and (tid or own) \
                and not _has(nq, "nizom", "tuzilma", "element", "qanday hisob", "formula", "maksimal"):
            return self._kpi(user, tid or own)
        if _has(nq, "hisobot") and _has(nq, "farq", "solishtir", "nomuvofiq", "mos ", "mos kel", "dalil"):
            return self._reconcile()
        etype = next((e for e in ("maqola", "konferensiya", "grant", "patent") if e in nq), None)
        if re.search(r"(nechta|soni|qancha)", nq) and etype and _has(nq, "tasdiqlangan", "dalil", "kafedra"):
            return self._count(etype)
        if _has(nq, "dublikat", "takroriy dalil", "ikki marta yuklangan"):
            return self._duplicates()
        if _has(nq, "muddati o'tgan", "kechikkan", "bajarilmagan vazifa"):
            return self._overdue()
        d = parse_date(q, config.today())
        if d and _has(nq, "vazifa", "topshiriq", "bajarilishi", "muddat", "task"):
            return self._tasks_until(d)
        if _has(nq, "yaqin muddat", "yaqinlashayotgan muddat"):
            return self._tasks_until(config.today() + timedelta(days=14))
        if _has(nq, "yuklama") and _has(nq, "ortiqcha", "me'yor", "oshgan", "yuqori", "ko'p"):
            return self._overload()
        if _has(nq, "nima qilish kerak", "nima qilishni", "tavsiya qil", "tavsiyalar", "harakat rejasi"):
            return self._recommend(tid)
        if _has(nq, "muammo", "xavf", "ortda", "orqada", "ogohlantir", "kechik"):
            return self._risks(tid, top_only=_has(nq, "eng muhim", "asosiy", "bugungi"))
        if _has(nq, "ma'lumot sog'lom", "ma'lumotlar sifati", "ma'lumot sifati"):
            return self._health()
        return self._rag(user, q, cfg)

    # ------------------------------------------------------------------ yordamchilar
    def _src(self, doc_id, snippet="", user=None):
        if doc_id.startswith("DB:"):
            return {"doc_id": doc_id, "title": doc_id[3:], "snippet": snippet, "kind": "data"}
        if doc_id.startswith("EV:"):
            e = self.db.one("SELECT id, title FROM evidence WHERE id=?", (int(doc_id[3:]),))
            return {"doc_id": doc_id, "title": f"Dalil fayli: {e['title']}", "snippet": snippet, "kind": "file",
                    "evidence_id": e["id"]}
        d = self.db.one("SELECT id, title, date, access, owner FROM documents WHERE id=?", (doc_id,))
        if not d or (user and not can_view_doc(user, d)):
            return None
        return {"doc_id": doc_id, "title": d["title"], "date": fmt_date(d["date"]) if d["date"] else "",
                "snippet": snippet, "kind": "document"}

    def _srcs(self, ids, user=None, snippets=None):
        out = []
        for i in ids:
            s = self._src(i, (snippets or {}).get(i, ""), user)
            if s and s["doc_id"] not in {x["doc_id"] for x in out}:
                out.append(s)
        return out

    def _out(self, intent, status, answer, sources, trace, calculation=None, recs=None, extra=None):
        r = {"intent": intent, "status": status, "answer": answer, "sources": sources,
             "retrieved": [s["doc_id"] for s in sources], "trace": trace,
             "calculation": calculation, "recommendations": recs or [], "updated": "", "warnings": []}
        r.update(extra or {})
        return r

    def _checks(self, r):
        if r["status"] == "denied":
            return [{"label": "Ruxsat tekshiruvi: rad etildi", "ok": False}]
        if r["status"] == "abstain":
            return [{"label": "Manba topildi", "ok": False}, {"label": "Qo'shimcha tekshiruv kerak", "ok": False}]
        has_doc = any(s["kind"] in ("document", "file") for s in r["sources"])
        return [
            {"label": "Manba topildi", "ok": bool(r["sources"])},
            {"label": "Manba mos (sifat nazoratidan o'tdi)", "ok": True},
            {"label": "Dalil mavjud", "ok": has_doc},
            {"label": "Ma'lumot yangilangan" + (f" ({r['updated']})" if r.get("updated") else ""), "ok": True},
            {"label": "Faqat tasdiqlangan ma'lumot ishlatildi", "ok": True},
            {"label": "Qo'shimcha tekshiruv kerak" if r.get("warnings") else "Qo'shimcha tekshiruv talab qilinmaydi",
             "ok": not r.get("warnings")},
        ]

    def _claim_warnings(self, indicators):
        out = []
        for c in analytics.claims_check(self.db):
            if not c["ok"] and c["indicator"] in indicators:
                out.append(f"{c['doc_id']} hujjatida «{c['label']}» = {c['value']:g}, asosiy reyestr bo'yicha {c['actual']} — "
                           f"tekshirish talab qilinadi" + (f" ({c['note']})" if c["note"] else ""))
        return out

    def _denied(self, user, q, reason):
        audit(self.db, user, "permission_denied", f"{reason}: {q}", "Savol-javob")
        return self._out("permission", "denied",
                         f"Kechirasiz, bu ma'lumotni ko'rishga ruxsatingiz yo'q. Sabab: {reason}. "
                         "So'rov harakatlar tarixiga yozildi.", [],
                         [{"step": "Huquqni tekshirish", "detail": f"Rol: {user['role_label']} — {reason}"},
                          {"step": "Javob sifati nazorati", "detail": "Ruxsat tekshiruvi: RAD ETILDI. Ma'lumot sun'iy intellektga uzatilmadi"}])

    # ------------------------------------------------------------------ faoliyat ko'rsatkichlari
    def _kpi(self, user, tid):
        k = analytics.kpi(self.db, tid)
        name = k["teacher"]["short_name"]
        parts = [f"{i['name']}: {i['verified']:g}/{i['max']:g}" for i in k["items"]]
        ans = (f"{name} faoliyat ko'rsatkichi: {k['percent']}% ({k['verified']:g} tasdiqlangan ball / "
               f"{k['max']:g} maksimal ball). Elementlar: " + "; ".join(parts) + ". [D04]")
        pend = sum(i["evidence_pending"] for i in k["items"])
        if pend:
            ans += f" Yana {pend} ta dalil tasdiqlanmagan va hisobga kirmagan."
        warns = self._claim_warnings({f"kpi_{tid}"})
        src = self._srcs(["D04", "D16", "H03"], user, {"D04": "KPI bajarilishi = tasdiqlangan ball / maksimal ball × 100"}) \
            + [self._src("DB:Dalillar reyestri (Excel)", ", ".join(parts))]
        trace = [
            {"step": "So'rov turi", "detail": "Faoliyat ko'rsatkichi (tuzilmali ma'lumot)"},
            {"step": "Qidirilgan ma'lumot", "detail": f"Ko'rsatkich elementlari + dalillar reyestri, o'qituvchi: {name}"},
            {"step": "Topilgan hujjat", "detail": "Nizom (D04), ko'rsatkichlar jadvali (D16), analitik hisobot (H03)"},
            {"step": "Hisoblash", "detail": k["formula"]},
            {"step": "Ma'lumot kelib chiqishi", "detail": " → ".join(k["lineage"])},
            {"step": "Javob sifati nazorati", "detail": "Manba ✓ · Ruxsat ✓ · Dalil ✓ (faqat tasdiqlangan dalillar)"
             + (" · Hujjatlar bilan farq aniqlandi — tekshirish talab qilinadi" if warns else "")},
        ]
        recs = []
        if k["percent"] < 50:
            recs.append({"text": f"{name} bilan faoliyat ko'rsatkichi bo'yicha individual suhbat (D04, 50% qoidasi)",
                         "priority": "o'rta", "assignee": tid, "responsible": "Kafedra mudiri",
                         "deadline": str(config.today() + timedelta(days=5)), "control": str(config.today() + timedelta(days=8))})
        return self._out("kpi", "ok", ans, src, trace, k["formula"], recs,
                         {"lineage": k["lineage"], "teacher_id": tid, "updated": k["updated"], "warnings": warns})

    def _kpi_evidence(self, user, tid):
        if not tid:
            return self._rag(user, "faoliyat ko'rsatkichi dalil talablari", FULL)
        k = analytics.kpi(self.db, tid)
        ok = [e for e in k["evidence"] if e["status"] == "tasdiqlangan"]
        lines = [f"{e['title']} — {e['score']:g} ball, " + ("PDF" if e["file"] else "fayl yo'q")
                 + (f", DOI {e['doi']}" if e["doi"] else "") + f", tasdiqlagan: {e['approved_by']} ({fmt_date(e['approved_at'])})"
                 for e in ok]
        ans = (f"{k['teacher']['short_name']} faoliyat ko'rsatkichi ({k['percent']}%) quyidagi {len(ok)} ta tasdiqlangan dalilga asoslangan: "
               + "; ".join(lines) + ". Dalil talablari nizomda [D04].")
        src = self._srcs(["D04", "D17"], user) + [self._src(f"EV:{e['id']}") for e in ok if e["file"]]
        trace = [{"step": "So'rov turi", "detail": "Ko'rsatkich → dalil (dalillar bog'lanish xaritasi)"},
                 {"step": "Qidirilgan ma'lumot", "detail": "Dalillar reyestri: holati «tasdiqlangan»"},
                 {"step": "Ishlatilgan dalil", "detail": lines},
                 {"step": "Hisoblash", "detail": k["formula"]},
                 {"step": "Javob sifati nazorati", "detail": "Har bir dalilda tasdiqlovchi va fayl mavjudligi tekshirildi"}]
        return self._out("kpi_evidence", "ok", ans, src, trace, k["formula"],
                         extra={"teacher_id": tid, "updated": k["updated"]})

    def _count(self, etype):
        c = analytics.evidence_count_lineage(self.db, etype)
        labels = {"maqola": "maqola", "konferensiya": "konferensiya ma'ruzasi", "grant": "grant", "patent": "patent/dasturiy guvohnoma"}
        ans = (f"Kafedrada {c['approved']} ta tasdiqlangan {labels[etype]} bor. "
               f"Shundan {c['with_pdf']} tasida PDF, {c['with_doi']} tasida DOI mavjud; "
               f"{c['approved_by_admin']} tasi mas'ul tomonidan tasdiqlangan. Oxirgi tekshiruv: {c['last_check']}. "
               f"Kutilmoqda: {c['pending']}, rad etilgan: {c['rejected']}.")
        warns = self._claim_warnings({f"{etype}_tasdiqlangan", f"{etype}_kutilmoqda"})
        lineage = [f"{c['approved']} ta tasdiqlangan", f"{c['with_pdf']} ta PDF mavjud", f"{c['with_doi']} ta DOI mavjud",
                   f"{c['approved_by_admin']} tasi mas'ul tomonidan tasdiqlangan", f"Oxirgi tekshiruv: {c['last_check']}"]
        docs = {"maqola": ["D17", "H18", "H04"], "konferensiya": ["D17", "H09"], "grant": ["D11", "H08"], "patent": ["D17", "H10"]}[etype]
        src = self._srcs(docs) + [self._src("DB:Dalillar reyestri (Excel)", "; ".join(i["title"] for i in c["items"]))]
        trace = [{"step": "So'rov turi", "detail": "Ko'rsatkich soni + ma'lumot kelib chiqishi"},
                 {"step": "Qidirilgan ma'lumot", "detail": f"Dalillar reyestri, turi: {etype}"},
                 {"step": "Hisoblash", "detail": f"Holati «tasdiqlangan» bo'lgan yozuvlar soni = {c['approved']}"},
                 {"step": "Ma'lumot kelib chiqishi", "detail": " → ".join(lineage)}]
        if warns:
            trace.append({"step": "Javob sifati nazorati", "detail": "Manba ✓ · Ruxsat ✓ · Dalil ✓ · Hisobot hujjatlari bilan farq: " + "; ".join(warns)})
        return self._out("count", "ok", ans, src, trace, f"Soni = {c['approved']}",
                         extra={"lineage": lineage, "warnings": warns, "updated": analytics.source_updated(self.db, "reyestri")})

    def _reconcile(self):
        r = analytics.reconciliation(self.db)
        parts = [f"{x['label']}: hisobotda {x['reported']}, tasdiqlangan dalil {x['evidence']} — {x['state']}" for x in r["rows"]]
        warns = self._claim_warnings({"maqola_tasdiqlangan", "maqola_kutilmoqda", "grant_tasdiqlangan"})
        ans = f"{r['summary']} " + "; ".join(parts) + f". {r['policy']}. [D06]"
        src = self._srcs(["D06", "D19", "H15", "H18", "H08"]) + [self._src("DB:Dalillar reyestri (Excel)", "tasdiqlangan dalillar soni")]
        trace = [{"step": "So'rov turi", "detail": "Ko'rsatkichlarni solishtirib tekshirish"},
                 {"step": "Qidirilgan ma'lumot", "detail": "Yillik hisobot (D06) jadvali ↔ dalillar reyestri (holati «tasdiqlangan»)"},
                 {"step": "Hisoblash", "detail": parts},
                 {"step": "Javob sifati nazorati", "detail": "Avtomatik tuzatish yo'q — vakolatli shaxs tasdig'i talab etiladi"}]
        if warns:
            trace.insert(3, {"step": "Hisobot hujjatlari bilan solishtirish", "detail": warns})
        recs = [{"text": "Yillik hisobotdagi farqlarni o'qituvchilar bilan tekshirish va hisobotni aniqlashtirish",
                 "priority": "o'rta", "assignee": None, "responsible": "Kafedra mudiri", "deadline": "2026-10-25", "control": "2026-10-26"}]
        return self._out("reconciliation", "ok", ans, src, trace, recs=recs,
                         extra={"table": r["rows"], "warnings": warns, "updated": analytics.source_updated(self.db, "reyestri")})

    def _doc_gaps(self):
        r = analytics.reconciliation(self.db)
        missing = [x for x in r["rows"] if not x["ok"]]
        ans = (f"Yillik hisobot (D06) tahlili: topildi {r['found']}/{r['total']}. Dalil yetishmaydi: "
               + "; ".join(f"{i + 1}) {x['label'].lower()} — hisobotda {x['reported']}, dalil {x['evidence']} "
                           f"({x['diff']} ta dalil yetishmaydi)" for i, x in enumerate(missing)) + ". [D06]")
        return self._out("doc_gaps", "ok", ans, self._srcs(["D06", "H15", "H08", "H18"]),
                         [{"step": "So'rov turi", "detail": "Hujjatni aqlli tahlil qilish"},
                          {"step": "Qidirilgan ma'lumot", "detail": "D06 jadvalidagi har bir ko'rsatkich uchun tasdiqlangan dalil"},
                          {"step": "Hisoblash", "detail": f"Dalili to'liq: {r['found']}, yetishmaydi: {len(missing)}"}],
                         extra={"table": r["rows"]})

    # ------------------------------------------------------------------ vazifalar va muddatlar
    def _tasks_until(self, d):
        rows = analytics.tasks_until(self.db, d)
        t0 = str(config.today())
        items = [f"{r['title']} — {r['responsible']}, muddat {fmt_date(r['deadline'])}, {r['progress']}%"
                 + (" (MUDDATI O'TGAN)" if r["deadline"] < t0 else "") for r in rows]
        ans = (f"{fmt_date(d)} gacha bajarilishi kerak bo'lgan {len(rows)} ta vazifa: " + "; ".join(items) + "."
               if rows else f"{fmt_date(d)} gacha ochiq vazifa yo'q.")
        docs = ["D20", "H16"] + sorted({x for r in rows for x in (r["evidence_refs"] or "").split(",") if x})
        src = [self._src("DB:Harakat markazi", "; ".join(items))] + self._srcs(docs)
        alerts = [a["alert"] + f" — {a['title']}" for a in analytics.deadline_alerts(self.db)]
        trace = [{"step": "So'rov turi", "detail": "Muddat bo'yicha vazifalar"},
                 {"step": "Qidirilgan ma'lumot", "detail": f"Vazifalar: holati ≠ bajarildi va muddat ≤ {fmt_date(d)}"},
                 {"step": "Ishlatilgan dalil", "detail": items}]
        if alerts:
            trace.append({"step": "Muddat ogohlantirishi", "detail": alerts})
        return self._out("tasks", "ok", ans, src, trace, extra={"tasks": rows, "alerts": alerts})

    def _overdue(self):
        rows = analytics.overdue_tasks(self.db)
        items = [f"{r['title']} — {r['responsible']}, muddat {fmt_date(r['deadline'])}, bajarilish {r['progress']}%" for r in rows]
        ans = (f"Muddati o'tgan {len(rows)} ta vazifa: " + "; ".join(items) + "." if rows else "Muddati o'tgan vazifa yo'q.")
        return self._out("tasks", "ok", ans, [self._src("DB:Harakat markazi", "; ".join(items))] + self._srcs(["H16", "H05", "D01"]),
                         [{"step": "So'rov turi", "detail": "Muddati o'tgan vazifalar"},
                          {"step": "Qidirilgan ma'lumot", "detail": f"muddat < {fmt_date(config.today())} va holati ≠ bajarildi"}])

    def _overload(self):
        ts = [t for t in analytics.teachers(self.db) if t["load_hours"] > t["max_load"]]
        items = [f"{t['short_name']} — {t['load_hours']} soat (me'yor {t['max_load']})" for t in ts]
        ans = f"O'quv yuklamasi me'yordan yuqori {len(ts)} o'qituvchi: " + "; ".join(items) + ". [D07]"
        return self._out("load", "ok", ans, self._srcs(["D07", "D01"], snippets={"D07": "Rahimov S. 1610; Qodirov A. 1580 — me'yoridan yuqori"}),
                         [{"step": "So'rov turi", "detail": "O'quv yuklama tahlili"},
                          {"step": "Hisoblash", "detail": "yuklama > 1540 soat (bayonnoma №1, D01)"}],
                         extra={"updated": analytics.source_updated(self.db, "HEMIS")})

    # ------------------------------------------------------------------ xavf, tavsiya, kotib
    def _risks(self, tid, top_only=False):
        risks = analytics.early_warnings(self.db)
        if tid:
            risks = [r for r in risks if r["teacher_id"] == tid]
        sci = [r for r in risks if r["area"] == "Ilmiy faoliyat"] if not tid else risks
        pick = (sci or risks)[:1] if top_only else (sci or risks)
        if not pick:
            return self._out("risk", "ok", "Mavjud ko'rsatkichlar asosida xavf belgisi aniqlanmadi.", self._srcs(["D05"]), [])
        if top_only:
            r = pick[0]
            reds = len([x for x in risks if x["level"] == "red"])
            ans = (f"{analytics.RISK_NOTE} Eng muhim masala: {r['title']}. Kafedrada jami {reds} ta qizil darajadagi belgi bor. "
                   "Nega? " + "; ".join(r["why"]) + ". [D05] [D03] [H13]")
        elif tid:
            ans = (f"{analytics.RISK_NOTE} {pick[0]['teacher']} bo'yicha {len(pick)} ta xavf belgisi: "
                   + "; ".join(f"{r['area']} — {', '.join(r['why'][:3])}" for r in pick) + ". "
                   + " ".join(f"[{d}]" for d in dict.fromkeys(d for r in pick for d in r["docs"])))
        else:
            ans = (f"{analytics.RISK_NOTE} Ilmiy rejasi ortda qolayotgan {len(pick)} holat: "
                   + "; ".join(f"{r['teacher']} ({', '.join(r['why'][:2])})" for r in pick) + ". [D05] [D03] [H13]")
        docs = list(dict.fromkeys(d for r in pick for d in r["docs"])) if tid else ["D05", "D03", "H13", "H20"]
        src = self._srcs(docs, snippets={
            "D03": "Aliyev B. va Yusupov J. ilmiy rejasining bajarilishi 50 foizdan past",
            "H13": "Aliyev B. 20% < 50% (20.10.2026); Yusupov J. 20% < 50% (18.10.2026); Nazarova Sh. 33% < 50% (30.10.2026)"})
        trace = [{"step": "So'rov turi", "detail": "Erta ogohlantirish (xavfni aniqlash)"},
                 {"step": "Qidirilgan ma'lumot", "detail": "Ilmiy rejalar, faoliyat ko'rsatkichlari, dalillar, vazifalar"},
                 {"step": "Hisoblash", "detail": "Qizil: reja < 50% va muddat ≤ 30 kun; sariq: reja < 50%, 30+ kun rivojlanish yo'q yoki ko'rsatkich < 35%"},
                 {"step": "Ishlatilgan dalil", "detail": [f"{r['title']}: " + "; ".join(r["why"]) for r in pick]}]
        return self._out("risk", "ok", ans, src, trace, recs=pick[0]["recommendations"], extra={"risks": pick})

    def _recommend(self, tid):
        risks = analytics.early_warnings(self.db)
        if tid:
            risks = [r for r in risks if r["teacher_id"] == tid] or risks
        recs = [x for r in risks[:3] for x in r["recommendations"]][:5]
        ans = "Tavsiya etilgan harakatlar (yakuniy qaror — rahbarda): " + "; ".join(
            f"{i + 1}) {x['text']} — ustuvorlik: {x['priority']}, mas'ul: {x['responsible']}, muddat {fmt_date(x['deadline'])}, "
            f"nazorat {fmt_date(x['control'])}" for i, x in enumerate(recs)) + ". [D04] [H20]"
        src = self._srcs(["D04", "H20", "H13"], snippets={"D04": "50 foizdan past KPI bo'lgan o'qituvchi bilan kafedra mudiri individual suhbat o'tkazadi"})
        trace = [{"step": "So'rov turi", "detail": "Tavsiya (qaror qabul qilishga yordam)"},
                 {"step": "Qidirilgan ma'lumot", "detail": "Erta ogohlantirish natijalari"},
                 {"step": "Xulosa", "detail": [x["text"] for x in recs]}]
        return self._out("recommend", "ok", ans, src, trace, recs=recs)

    def _secretary(self, user):
        items = analytics.secretary(self.db)
        ans = "Bugungi ustuvor ishlar (tavsiya, qaror sizda): " + "; ".join(f"{x['n']}) {x['text']}" for x in items[:7]) + "."
        return self._out("secretary", "ok", ans, self._srcs(["H20", "H16", "D12"]) + [self._src("DB:Harakat markazi")],
                         [{"step": "So'rov turi", "detail": "Sun'iy intellekt kotibi — kunlik ustuvorliklar"},
                          {"step": "Qidirilgan ma'lumot", "detail": "Muddati o'tgan va yaqin vazifalar, qizil xavf belgilari, kutilayotgan dalillar, solishtiruv farqlari"},
                          {"step": "Hisoblash", "detail": "Ustuvorlik: 1 — muddat; 2 — qizil xavf; 3 — tasdiqlash va farqlar; 4 — hisobotlar"},
                          {"step": "Ishlatilgan dalil", "detail": [f"{x['n']}. {x['text']} — {x['why']}" for x in items]}],
                         extra={"secretary": items})

    def _meeting(self, user):
        m = analytics.meeting_agenda(self.db)
        ans = (f"Keyingi yig'ilish uchun tavsiya etilgan kun tartibi: " + "; ".join(f"{i + 1}) {a}" for i, a in enumerate(m["agenda"]))
               + f". Avvalgi yig'ilish: {m['last']['title']} ({fmt_date(m['last']['date'])}). Bajarilmagan topshiriqlar: {len(m['open_tasks'])} ta.")
        return self._out("meeting", "ok", ans, self._srcs([m["last"]["id"], "H16", "H13"]),
                         [{"step": "So'rov turi", "detail": "Yig'ilishga tayyorgarlik"},
                          {"step": "Avvalgi qarorlar", "detail": m["decisions"]},
                          {"step": "Bajarilmagan topshiriqlar", "detail": [f"{t['title']} — {fmt_date(t['deadline'])}" for t in m["open_tasks"]]}],
                         extra={"meeting": {"agenda": m["agenda"], "decisions": m["decisions"]}})

    def _history(self, user, q):
        r = self.index.search(q + " bayonnoma muammo qaror", user, k=5, rerank=True, gate=False)
        old = [h for h in r.hits if h.doc_date and h.doc_date < str(config.today() - timedelta(days=180))]
        if not old:
            return self._out("history", "abstain", "Yetarli tasdiqlangan ma'lumot topilmadi. Arxivda o'xshash holat qayd etilmagan.", [], [])
        doc = old[0].doc_id
        tasks = self.db.q("SELECT * FROM tasks WHERE evidence_refs LIKE ?", (f"%{doc}%",))
        done = [t for t in tasks if t["status"] == "bajarildi"]
        chunks = [c["text"] for c in self.db.q("SELECT text FROM chunks WHERE doc_id=? ORDER BY idx", (doc,))]
        dec = next((c for c in chunks if "qaror" in c.lower()), chunks[0])
        res = next((c for c in chunks if c.lower().startswith("natija")), "")
        ans = (f"Topildi: {old[0].doc_title} ({fmt_date(old[0].doc_date)}). {dec} {res} "
               f"Shu yig'ilish asosida {len(tasks)} ta vazifa yaratilgan, {len(done)} tasi bajarilgan. [{doc}]")
        return self._out("history", "ok", ans, self._srcs([doc], user, {doc: dec}) + [self._src("DB:Harakat markazi (arxiv)")],
                         [{"step": "So'rov turi", "detail": "Kafedra raqamli xotirasi — tarixiy holat"},
                          {"step": "Topilgan hujjat", "detail": f"[{doc}] {old[0].doc_title}"},
                          {"step": "Hisoblash", "detail": f"Bog'langan vazifalar: {len(tasks)}, bajarilgan: {len(done)}"}])

    def _health(self):
        h = analytics.data_health(self.db)
        ans = (f"Ma'lumot sog'lomligi: {h['score']}%. To'liqlik {h['completeness']['value']}%, dalillar bilan qamrab olinganlik "
               f"{h['evidence_coverage']['value']}%, ma'lumot yangiligi {h['freshness']['value']}%, nomuvofiqliklar "
               f"{h['conflicts']['value']}, takroriy ma'lumotlar {h['duplicates']['value']}.")
        return self._out("health", "ok", ans, self._srcs(["D18", "H14", "H12"]) + [self._src("DB:Ma'lumot sifati nazoratchisi")],
                         [{"step": "Hisoblash", "detail": [f"{v['label']}: {v['formula']}" for k, v in h.items() if isinstance(v, dict)]}])

    def _report(self, user):
        if not can(user, "approve_report"):
            return self._denied(user, "hisobot", "Hisobot loyihasini faqat kafedra mudiri tayyorlaydi")
        rep = actions.weekly_report(self.db, user)
        return self._out("report", "action",
                         f"Haftalik hisobot loyihasi yaratildi (#{rep['id']}). Holat: loyiha — inson tekshiruvi va tasdig'i talab etiladi. "
                         "Rasmiy hisobot inson tasdig'isiz yuborilmaydi.",
                         self._srcs(["H01", "H20", "D12", "D06"]) + [self._src("DB:Dalillar reyestri (Excel)")],
                         [{"step": "So'rov turi", "detail": "Bir bosishda hisobot tayyorlash"},
                          {"step": "Harakat", "detail": f"Hisobot #{rep['id']} (loyiha)"}],
                         extra={"report": rep})

    def _create_task(self, user, q, nq, tid):
        if not can(user, "create_task"):
            return self._denied(user, q, "Vazifa yaratish faqat kafedra mudiri uchun")
        d = parse_date(q, config.today()) or (config.today() + timedelta(days=7))
        m = re.search(r"gacha\s+(.*?)\s+(topshirig|vazifa|topshir)", nq)
        title = (m.group(1) if m else q).strip(" .")
        title = re.sub(r"(sh)ni$", r"\1", title)
        title = title[0].upper() + title[1:] if title else "Topshiriq"
        docs = []
        if _has(nq, "reja", "ilmiy"):
            docs.append("D05")
        if _has(nq, "maqola", "dalil", "evidence"):
            docs += ["D17", "H18"]
        if _has(nq, "grant"):
            docs.append("D11")
        task = actions.create_task(self.db, user, title, assignee=tid, deadline=str(d),
                                   source="Sun'iy intellekt (dalildan harakatga)", evidence_refs=docs or ["D05"],
                                   description=f"Kafedra mudiri buyrug'i asosida: «{q.strip()}»", priority="yuqori")
        who = task["responsible"].rstrip(".")
        ans = (f"Vazifa yaratildi (#{task['id']}): «{task['title']}». Mas'ul: {who}. Boshlanish: {fmt_date(task['start_date'])}. "
               f"Yakuniy muddat: {fmt_date(task['deadline'])}. Nazorat: {fmt_date(task['control_date'])}. Holat: yangi, bajarilish 0%.")
        return self._out("create_task", "action", ans, [self._src("DB:Harakat markazi", task["title"])] + self._srcs(docs),
                         [{"step": "So'rov turi", "detail": "Aqlli vazifalar boshqaruvi — tabiiy tildan vazifa"},
                          {"step": "Ajratilgan maydonlar", "detail": [f"Mas'ul: {who}", f"Vazifa nomi: {task['title']}",
                                                                      f"Tavsif: {task['description']}", f"Boshlanish: {fmt_date(task['start_date'])}",
                                                                      f"Muddat: {fmt_date(task['deadline'])}", f"Nazorat: {fmt_date(task['control_date'])}",
                                                                      "Holat: yangi", "Bajarilish: 0%", f"Bog'langan hujjatlar: {', '.join(docs) or '—'}"]},
                          {"step": "Huquqni tekshirish", "detail": f"{user['role_label']}: vazifa yaratish ✓"},
                          {"step": "Harakat", "detail": f"Vazifa #{task['id']} yaratildi va harakatlar tarixiga yozildi"}],
                         extra={"task": task})

    # ------------------------------------------------------------------ o'qituvchining shaxsiy yordamchisi
    def _personal(self, user, nq):
        tid = user["teacher_id"]
        k = analytics.kpi(self.db, tid)
        p = self.db.one("SELECT * FROM science_plans WHERE teacher_id=?", (tid,))
        t0 = config.today()
        if _has(nq, "tasdiqlanmagan", "hujjatlarim", "dalillarim", "rad etilgan"):
            ev = [e for e in k["evidence"] if e["status"] != "tasdiqlangan"]
            ans = (f"Sizda tasdiqlanmagan {len(ev)} ta dalil bor: " + "; ".join(f"{e['title']} — {e['status']}" + (f" ({e['note']})" if e["note"] else "") for e in ev) + "."
                   if ev else "Barcha dalillaringiz tasdiqlangan.")
            return self._out("my_pending", "ok", ans, self._srcs(["D17"], user) + [self._src("DB:Dalillar reyestri (Excel)")],
                             [{"step": "Qidirilgan ma'lumot", "detail": "Faqat sizga tegishli dalillar (holati ≠ tasdiqlangan)"}])
        if _has(nq, "bajarmadim", "qaysi band", "bajarilmagan band"):
            gaps = [i for i in k["items"] if i["verified"] < i["max"]]
            ans = (f"Hali to'liq bajarilmagan bandlar ({len(gaps)} ta): " + "; ".join(f"{i['name']} — {i['verified']:g}/{i['max']:g} ball" for i in gaps)
                   + (f". Ilmiy reja: {p['done']}/{p['planned']} band bajarilgan." if p else "") + " [D04] [D05]")
            return self._out("my_gaps", "ok", ans, self._srcs(["D04", "D05"], user),
                             [{"step": "Hisoblash", "detail": k["formula"]}], extra={"updated": k["updated"]})
        if _has(nq, "ortda", "qancha qoldi", "rejam"):
            pct = round(100 * p["done"] / p["planned"])
            days = (date.fromisoformat(p["deadline"]) - t0).days
            idle = (t0 - date.fromisoformat(p["last_progress"])).days
            ans = (f"Ilmiy rejangiz: {p['done']}/{p['planned']} band bajarilgan ({pct}%). Ortda qolgan: {p['planned'] - p['done']} ta band. "
                   f"Bosqich muddatigacha {days} kun qoldi ({fmt_date(p['deadline'])}). Oxirgi rivojlanish: {fmt_date(p['last_progress'])} ({idle} kun oldin). [D05]")
            return self._out("my_plan", "ok", ans, self._srcs(["D05", "D16"], user),
                             [{"step": "Hisoblash", "detail": f"{p['done']} / {p['planned']} × 100 = {pct}%"}])
        if _has(nq, "bu oy", "oy davomida", "nimalarni bajarishim", "bajarishim kerak"):
            end = date(t0.year + (t0.month == 12), t0.month % 12 + 1, 1) - timedelta(days=1)
            tasks = self.db.q("SELECT * FROM tasks WHERE assignee=? AND status NOT IN ('bajarildi','qisman') AND deadline <= ? ORDER BY deadline", (tid, str(end)))
            lines = [f"{t['title']} — {fmt_date(t['deadline'])}" for t in tasks]
            if p and p["deadline"] <= str(end):
                lines.append(f"Ilmiy reja bosqich hisoboti — {fmt_date(p['deadline'])}")
            lines.append("Faoliyat ko'rsatkichlari dalillarini yuklash — 20.10.2026 (D02, D12)")
            ans = "Shu oy bajarishingiz kerak bo'lgan ishlar: " + "; ".join(lines) + "."
            return self._out("my_month", "ok", ans, self._srcs(["D02", "D12", "D05"], user) + [self._src("DB:Harakat markazi")],
                             [{"step": "Qidirilgan ma'lumot", "detail": f"Sizga biriktirilgan vazifalar, muddat ≤ {fmt_date(end)}"}])
        if _has(nq, *KPI_WORDS, "ko'rsatkichlarim", "ko'rsatkichim"):
            return self._kpi(user, tid)
        return None

    def _devplan(self, user, tid):
        dp = analytics.development_plan(self.db, tid)
        name = analytics.teacher(self.db, tid)["short_name"]
        ans = f"{dp['title']} — {name}: " + "; ".join(dp["items"]) + f". {dp['note']}"
        return self._out("devplan", "ok", ans, self._srcs(["D04", "D05"], user),
                         [{"step": "Asos", "detail": dp["basis"]}], extra={"devplan": dp})

    # ------------------------------------------------------------------ nomi aytilgan hujjat ichida qidirish
    GENERIC = {"hisobot", "kafedra", "2026", "2025", "yil", "o'quv", "namuna", "qisqa", "oktabr", "sentabr", "va", "bo'yicha"}

    def _named_doc(self, nq, user):
        if not re.search(r"(hisobot|bayonnoma|nizom|reyestr|so'rovnoma|jadval)\w*da\b", nq):
            return None
        qt = set(tokenize(nq))
        best, score = None, 0
        for d in self.db.q("SELECT id, title, access, owner FROM documents"):
            if not can_view_doc(user, d) or "qisqa namuna" in d["title"]:
                continue
            tt = set(tokenize(re.sub(r"\(.*?\)", "", d["title"]))) - self.GENERIC
            if not tt:
                continue
            hit = len(tt & qt) / len(tt)
            if hit > score or (hit == score and best and d["id"].startswith("H") and not best["id"].startswith("H")):
                best, score = d, hit
        return best if score >= 0.99 or (best and score >= 0.66 and len(tokenize(best["title"])) >= 3) else None

    def _rag_in_doc(self, user, q, doc, cfg):
        title_terms = set(tokenize(re.sub(r"\(.*?\)", "", doc["title"])))
        r = self.index.search(q, user, k=cfg["k"], rerank=cfg["rerank"], gate=False, doc_ids={doc["id"]},
                              ignore_terms=title_terms | {"hisobot", "hujjat"})
        trace = [{"step": "So'rov turi", "detail": f"Nomi aytilgan hujjat ichida qidirish: [{doc['id']}] {doc['title']}"},
                 {"step": "Qidirilgan ma'lumot", "detail": f"Kalit tushunchalar: {', '.join(r.query_terms)}"},
                 {"step": "Topilgan hujjat", "detail": [f"[{h.doc_id}] bo'lak: {h.text[:80]}… (qamrov {h.coverage:.0%})" for h in r.hits]}]
        good = [h for h in r.hits if h.coverage >= 0.34]
        if not good:
            trace.append({"step": "Javob sifati nazorati", "detail": "O'TMADI: hujjatda savolga mos bo'lak topilmadi"})
            return self._out("rag", "abstain", f"Yetarli tasdiqlangan ma'lumot topilmadi. «{doc['title']}» hujjatida bu savolga mos qism yo'q.",
                             [], trace, extra={"retrieved_all": [doc["id"]]})
        sents = _best_sentences(q, good, r.query_terms)
        text = llm.answer(q, good[:3]) or " ".join(f"{s} [{d}]" for s, d in sents)
        trace += [{"step": "Ishlatilgan dalil", "detail": [f"[{d}] {s}" for s, d in sents]},
                  {"step": "Javob sifati nazorati", "detail": "O'TDI: manba aniq ko'rsatilgan hujjat; ruxsat ✓"}]
        src = self._src(doc["id"], sents[0][0] if sents else "", user)
        return self._out("rag", "ok", text, [src], trace, extra={"retrieved_all": [doc["id"]], "updated": src.get("date", "")})

    def _duplicates(self):
        dups = analytics.duplicate_evidence(self.db)
        rows = []
        for d in dups:
            e = self.db.one("SELECT e.*, t.short_name FROM evidence e JOIN teachers t ON t.id=e.teacher_id WHERE e.id=?", (d["id"],))
            o = self.db.one("SELECT title FROM evidence WHERE id=?", (d["duplicate_of"],))
            rows.append(f"{e['short_name']}: dalil #{e['id']} «{e['title']}» (DOI {e['doi'] or '—'}, holati: {e['status']}) "
                        f"dalil #{d['duplicate_of']} «{o['title']}» bilan bir xil")
        ddocs = analytics.duplicate_documents(self.db)
        ans = (f"Takroriy dalillar: {len(dups)} ta. " + "; ".join(rows) + ". "
               + (f"Mazmuni takrorlanuvchi hujjatlar: " + "; ".join(f"{x['doc']} ↔ {x['similar_to']} ({x['overlap']}%)" for x in ddocs) + ". " if ddocs else "")
               + "Holat: tekshirish talab qilinadi — tizim avtomatik o'chirmaydi.")
        return self._out("count", "ok", ans, self._srcs(["D17", "H07"]) + [self._src("DB:Dalillar reyestri (Excel)")],
                         [{"step": "So'rov turi", "detail": "Ma'lumot sifati nazoratchisi — takroriy ma'lumotlar"},
                          {"step": "Hisoblash", "detail": "Bir xil DOI yoki sarlavha; hujjatlar uchun mazmun mosligi ≥ 80%"}])

    # ------------------------------------------------------------------ hujjatlardan qidirish
    def _rag(self, user, q, cfg, intent="rag"):
        r = self.index.search(q, user, k=cfg["k"], rerank=cfg["rerank"], gate=cfg["gate"])
        trace = [{"step": "So'rov turi", "detail": "Hujjatlardan qidirish (bilimlar bazasi)"},
                 {"step": "Qidirilgan ma'lumot", "detail": f"Kalit tushunchalar: {', '.join(r.query_terms)}; "
                                                            f"ruxsat filtri: {r.filtered_out} ta bo'lak sun'iy intellektga uzatilmadi"},
                 {"step": "Topilgan hujjat", "detail": [f"[{h.doc_id}] {h.doc_title} (ball {h.score:.2f}, qamrov {h.coverage:.0%})" for h in r.hits]}]
        if not r.gate_passed or not r.hits:
            trace.append({"step": "Javob sifati nazorati", "detail": f"O'TMADI: {r.gate_reason if r.hits else 'Mos manba topilmadi'}"})
            ans = ("Yetarli tasdiqlangan ma'lumot topilmadi. "
                   f"Topilgan manbalar: {len(r.hits)}; talab qilinadigan: kamida 1 ta mos manba. "
                   f"Sabab: {r.gate_reason if r.hits else 'mos manba topilmadi'}. Tavsiya: ma'lumotni tekshirish yoki hujjatni raqamli xotiraga yuklash.")
            return self._out(intent, "abstain", ans, [], trace, extra={"retrieved_all": [h.doc_id for h in r.hits]})
        hits = r.hits
        injected = [h for h in hits if INJECTION.search(normalize(h.text))]
        clean = [h for h in hits if h not in injected]
        sents = _best_sentences(q, clean, r.query_terms)
        text = llm.answer(q, clean[:3])
        mode = "Claude (faqat berilgan manbalar asosida)" if text else "Lokal: manbadagi gap aynan keltiriladi"
        if not text:
            text = " ".join(f"{s} [{d}]" for s, d in sents) if sents else ""
        if not text:
            trace.append({"step": "Javob sifati nazorati", "detail": "O'TMADI: mos gap topilmadi"})
            return self._out(intent, "abstain", "Yetarli tasdiqlangan ma'lumot topilmadi.", [], trace)
        used = list(dict.fromkeys(d for _, d in sents)) or [clean[0].doc_id]
        trace += [{"step": "Ishlatilgan dalil", "detail": [f"[{d}] {s}" for s, d in sents]},
                  {"step": "Javob yaratish", "detail": mode}]
        if injected:
            trace.append({"step": "Ko'rsatmaga qarshi himoya", "detail": f"{', '.join(h.doc_id for h in injected)} hujjatidagi "
                          "buyruqqa o'xshash matn oddiy ma'lumot sifatida qabul qilindi va bajarilmadi"})
        trace.append({"step": "Javob sifati nazorati", "detail": f"O'TDI: {r.gate_reason}; ruxsat ✓; manba keltirildi ✓"})
        sources = [s for s in (self._src(d, next((x for x, dd in sents if dd == d), ""), user) for d in used) if s]
        dates = [s.get("date") for s in sources if s.get("date")]
        return self._out(intent, "ok", text, sources, trace,
                         extra={"retrieved_all": [h.doc_id for h in hits], "updated": dates[0] if dates else "",
                                "injection_blocked": [h.doc_id for h in injected]})


def _units(text):
    if len(text.split()) <= 45:
        return [text]
    return [u.strip() for u in re.split(r"(?<=[a-z0-9)][.;])\s+(?=[A-Z0-9\"])", text) if u.strip()]


def _best_sentences(q, hits, qterms, n=2):
    qs = set(qterms)
    cands = []
    for rank, h in enumerate(hits[:3]):
        for s in _units(h.text):
            ov = len(qs & set(tokenize(s)))
            if ov:
                cands.append((ov / max(len(qs), 1) + 0.3 * (1 / (rank + 1)), s.strip(), h.doc_id))
    cands.sort(key=lambda c: -c[0])
    out, seen = [], set()
    for sc, s, d in cands:
        if s not in seen and (not out or sc >= 0.75 * cands[0][0]):
            out.append((s, d))
            seen.add(s)
        if len(out) >= n:
            break
    return out
