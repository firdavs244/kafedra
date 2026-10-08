"""Harakat markazi (vazifalar), bir bosishda hisobot va dalillarni ko'rib chiqish."""
import json
from datetime import date, timedelta

from . import analytics, config
from .auth import audit, now
from .db import DB
from .text import fmt_date


def create_task(db: DB, user, title, assignee=None, responsible=None, deadline=None, control=None,
                source="Qo'lda kiritilgan", evidence_refs=None, description="", priority="o'rta"):
    t0 = config.today()
    deadline = deadline or str(t0 + timedelta(days=7))
    control = control or str(date.fromisoformat(deadline) + timedelta(days=1))
    if not responsible and assignee:
        t = analytics.teacher(db, assignee)
        responsible = t["short_name"] if t else assignee
    refs = evidence_refs if isinstance(evidence_refs, str) else ",".join(evidence_refs or [])
    tid = db.x("""INSERT INTO tasks(title, description, assignee, responsible, start_date, deadline, control_date,
                  status, progress, priority, source, evidence_refs, created_by, created_at)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
               (title, description, assignee, responsible or "Kafedra mudiri", str(t0), deadline, control,
                "yangi", 0, priority, source, refs, user["username"], now()))
    audit(db, user, "task_create", f"#{tid} {title} → {responsible} ({fmt_date(deadline)})", "Harakat markazi",
          None, f"yangi, muddat {fmt_date(deadline)}")
    return db.one("SELECT * FROM tasks WHERE id=?", (tid,))


def set_task_status(db: DB, user, task_id: int, status: str, progress=None):
    old = db.one("SELECT status, progress FROM tasks WHERE id=?", (task_id,))
    if progress is None:
        progress = 100 if status == "bajarildi" else old["progress"]
    db.x("UPDATE tasks SET status=?, progress=?, done_at=? WHERE id=?",
         (status, int(progress), now() if status == "bajarildi" else None, task_id))
    audit(db, user, "task_status", f"Vazifa #{task_id}", "Harakat markazi",
          f"{old['status']}, {old['progress']}%", f"{status}, {progress}%")
    return db.one("SELECT * FROM tasks WHERE id=?", (task_id,))


def list_tasks(db: DB, user):
    rows = db.q("SELECT * FROM tasks ORDER BY CASE WHEN status IN ('bajarildi','qisman') THEN 1 ELSE 0 END, deadline DESC")
    t0 = config.today()
    for r in rows:
        dl = date.fromisoformat(r["deadline"])
        r["overdue"] = r["status"] not in ("bajarildi", "qisman") and dl < t0
        r["archive"] = dl.year < t0.year and r["status"] in ("bajarildi", "qisman")
        left = (dl - t0).days
        r["alert"] = (f"Vazifa yakuniy muddatiga {left} kun qoldi. Vazifa hali bajarilmagan."
                      if r["status"] not in ("bajarildi", "qisman") and 0 <= left <= 2 else "")
    rows.sort(key=lambda r: (r["archive"], r["status"] in ("bajarildi", "qisman"), r["deadline"]))
    if user["role"] == "oqituvchi":
        rows = [r for r in rows if r["assignee"] == user["teacher_id"]]
    return rows


def weekly_report(db: DB, user) -> dict:
    b = analytics.daily_brief(db)
    ov = analytics.kpi_overview(db)
    rec = analytics.reconciliation(db)
    dh = b["data_health"]
    t0 = config.today()
    done = db.q("SELECT * FROM tasks WHERE status='bajarildi' AND deadline >= ?", (str(t0 - timedelta(days=30)),))
    avg = round(sum(o["percent"] for o in ov) / len(ov))
    claims = [c for c in analytics.claims_check(db) if not c["ok"]]
    lines = [
        f"# Kafedra haftalik hisoboti — {fmt_date(t0)}",
        "",
        "**Holat: LOYIHA — inson tekshiruvi va tasdig'i talab etiladi.**",
        "",
        "## 1. Asosiy ko'rsatkichlar",
        f"- Muhim masalalar: {b['critical']}",
        f"- Yaqin 14 kundagi muddatlar: {b['deadlines']}",
        f"- Tasdiqlanishi kerak: {b['to_approve']}",
        f"- E'tibor talab qiluvchi xodimlar: {b['attention_staff']}",
        f"- Kafedra o'rtacha faoliyat ko'rsatkichi: {avg}% (8 o'qituvchi, faqat tasdiqlangan dalillar)",
        "",
        "## 2. Muammolar va xavf belgilari",
    ]
    for r in analytics.early_warnings(db)[:5]:
        lines.append(f"- [{'QIZIL' if r['level'] == 'red' else 'SARIQ'}] {r['title']} — " + "; ".join(r["why"][:2]))
    lines += ["", "## 3. Ilmiy faoliyat: hisobot va dalillar solishtiruvi"]
    for r in rec["rows"]:
        lines.append(f"- {r['label']}: hisobotda {r['reported']}, tasdiqlangan dalil {r['evidence']} — {r['state']}")
    if claims:
        lines.append(f"- Hisobot hujjatlaridagi {len(claims)} ta raqam reyestrga mos emas ({', '.join(sorted({c['doc_id'] for c in claims}))}) — tekshirish talab qilinadi")
    lines += [f"- {rec['policy']}", "", "## 4. Bajarilgan ishlar (oxirgi 30 kun)"]
    lines += [f"- {d['title']} ({d['responsible']})" for d in done] or ["- Qayd etilmagan"]
    lines += ["", "## 5. Yaqin muddatlar va vazifalar"]
    lines += [f"- {t['title']} — {t['responsible']}, {fmt_date(t['deadline'])}" for t in b["deadline_list"]]
    lines += ["", "## 6. Loyihalar",
              "- Ta'limda adaptiv o'qitish platformasi — amalda; talabalar o'zlashtirishini bashoratlash modeli — amalda; "
              "raqamli pedagogika laboratoriyasi — ariza bosqichida (D11)",
              "", "## 7. Ma'lumot sifati",
              f"- To'liqlik {dh['completeness']['value']}%, qamrab olinganlik {dh['evidence_coverage']['value']}%, "
              f"yangilik {dh['freshness']['value']}%, nomuvofiqliklar {dh['conflicts']['value']}, takroriy {dh['duplicates']['value']}",
              "", "## 8. Keyingi rejalar"]
    lines += [f"- {s['text']}" for s in analytics.secretary(db)[:5]]
    lines += ["", "_Manbalar: D03, D05, D06, D11, D12, H01, H13, H15, H20, dalillar reyestri, Harakat markazi._",
              "_Tamoyil: sun'iy intellekt tayyorlaydi → inson tekshiradi → inson tasdiqlaydi._"]
    body = "\n".join(lines)
    rid = db.x("INSERT INTO reports(title, body, status, created_by, created_at, sources) VALUES(?,?,?,?,?,?)",
               (f"Haftalik hisobot {fmt_date(t0)}", body, "draft", user["username"], now(),
                json.dumps(["D03", "D05", "D06", "D11", "D12", "H01", "H13", "H15", "H20"])))
    audit(db, user, "report_draft", f"Hisobot #{rid}", "Hisobotlar", None, "loyiha")
    return db.one("SELECT * FROM reports WHERE id=?", (rid,))


def approve_report(db: DB, user, rid: int):
    db.x("UPDATE reports SET status='approved', approved_by=?, approved_at=? WHERE id=?", (user["username"], now(), rid))
    audit(db, user, "report_approve", f"Hisobot #{rid}", "Hisobotlar", "loyiha", "tasdiqlangan")
    return db.one("SELECT * FROM reports WHERE id=?", (rid,))


def review_evidence(db: DB, user, eid: int, status: str, note=""):
    old = db.one("SELECT status FROM evidence WHERE id=?", (eid,))
    db.x("UPDATE evidence SET status=?, approved_by=?, approved_at=?, note=? WHERE id=?",
         (status, user["full_name"] if status == "tasdiqlangan" else None,
          str(config.today()) if status == "tasdiqlangan" else None, note, eid))
    audit(db, user, "evidence_review", f"Dalil #{eid}" + (f": {note}" if note else ""), "Dalillar ombori", old["status"], status)
    return db.one("SELECT * FROM evidence WHERE id=?", (eid,))
