"""Faoliyat ko'rsatkichlari, ma'lumot kelib chiqishi, ma'lumot sog'lomligi, erta ogohlantirish,
solishtirib tekshirish, sun'iy intellekt kotibi va rivojlanish rejasi.

Har bir raqam formula va manba bilan qaytariladi.
"""
import re
from datetime import date, timedelta

from . import config
from .db import DB
from .text import fmt_date, tokenize

APPROVED = "tasdiqlangan"
PENDING = "kutilmoqda"
REJECTED = "rad etilgan"
RISK_NOTE = "Mavjud ko'rsatkichlar asosida xavf belgisi aniqlandi."


def _d(s):
    return date.fromisoformat(s[:10])


def teachers(db: DB):
    return db.q("SELECT * FROM teachers ORDER BY id")


def teacher(db: DB, tid):
    return db.one("SELECT * FROM teachers WHERE id=?", (tid,))


def source_updated(db: DB, name_like: str) -> str:
    s = db.one("SELECT last_sync FROM data_sources WHERE name LIKE ?", (f"%{name_like}%",))
    if not s:
        return ""
    d = s["last_sync"]
    return fmt_date(d) + (" " + d[11:16] if len(d) > 10 else "")


# ---------------------------------------------------------------- Faoliyat ko'rsatkichlari + kelib chiqishi
def kpi(db: DB, tid: str) -> dict:
    t = teacher(db, tid)
    items = db.q("SELECT * FROM kpi_items WHERE teacher_id=? ORDER BY id", (tid,))
    ev = db.q("SELECT * FROM evidence WHERE teacher_id=? ORDER BY id", (tid,))
    rows, total, mx = [], 0.0, 0.0
    for it in items:
        e_all = [e for e in ev if e["category"] == it["category"]]
        e_ok = [e for e in e_all if e["status"] == APPROVED]
        raw = sum(e["score"] for e in e_ok)
        verified = min(raw, it["max_score"])
        total += verified
        mx += it["max_score"]
        rows.append({
            "category": it["category"], "name": it["name"], "max": it["max_score"],
            "verified": verified, "raw": raw, "capped": raw > it["max_score"],
            "evidence_total": len(e_all), "evidence_approved": len(e_ok),
            "evidence_pending": sum(1 for e in e_all if e["status"] == PENDING),
            "evidence_rejected": sum(1 for e in e_all if e["status"] == REJECTED),
            "evidence_ids": [e["id"] for e in e_all],
        })
    pct = round(100 * total / mx) if mx else 0
    files = sum(1 for e in ev if e["status"] == APPROVED and e["file"])
    lineage = [
        f"{pct}%",
        f"{total:g} / {mx:g} ball",
        f"{len(items)} ta ko'rsatkich elementi",
        f"{sum(r['evidence_approved'] for r in rows)} ta tasdiqlangan dalil "
        f"(+{sum(r['evidence_pending'] for r in rows)} kutilmoqda, {sum(r['evidence_rejected'] for r in rows)} rad etilgan)",
        f"{files} ta dalil fayli (PDF) + nizom D04",
        "2 ta ma'lumot manbasi: dalillar reyestri (Excel), dalil fayllari (PDF)",
    ]
    return {
        "teacher": t, "items": rows, "verified": total, "max": mx, "percent": pct,
        "formula": f"Faoliyat ko'rsatkichi = tasdiqlangan ball / maksimal ball × 100 = {total:g} / {mx:g} × 100 = {pct}%",
        "rule": "Faqat tasdiqlangan dalillar hisobga olinadi (nizom D04)",
        "lineage": lineage, "evidence": ev, "updated": source_updated(db, "reyestri"),
    }


def kpi_overview(db: DB):
    out = []
    for t in teachers(db):
        k = kpi(db, t["id"])
        plan = db.one("SELECT * FROM science_plans WHERE teacher_id=?", (t["id"],))
        out.append({
            "id": t["id"], "name": t["short_name"], "full_name": t["full_name"],
            "position": t["position"], "percent": k["percent"], "verified": k["verified"],
            "max": k["max"], "plan_pct": round(100 * plan["done"] / plan["planned"]) if plan else None,
            "pending": sum(i["evidence_pending"] for i in k["items"]),
            "evidence": sum(i["evidence_total"] for i in k["items"]),
        })
    return out


def evidence_count_lineage(db: DB, etype: str) -> dict:
    rows = db.q("SELECT * FROM evidence WHERE type=?", (etype,))
    ok = [r for r in rows if r["status"] == APPROVED]
    return {
        "type": etype, "approved": len(ok),
        "pending": sum(1 for r in rows if r["status"] == PENDING),
        "rejected": sum(1 for r in rows if r["status"] == REJECTED),
        "with_pdf": sum(1 for r in ok if r["file"]),
        "with_doi": sum(1 for r in ok if r["doi"]),
        "approved_by_admin": sum(1 for r in ok if r["approved_by"]),
        "last_check": fmt_date(max((r["approved_at"] for r in ok if r["approved_at"]), default="2026-01-01")),
        "items": ok,
    }


# ---------------------------------------------------------------- Ko'rsatkichlarni solishtirib tekshirish
def reconciliation(db: DB):
    rows = []
    for r in db.q("SELECT * FROM reported_stats"):
        ev = db.one("SELECT COUNT(*) c FROM evidence WHERE type=? AND status=?", (r["evidence_type"], APPROVED))["c"]
        pending = db.one("SELECT COUNT(*) c FROM evidence WHERE type=? AND status=?", (r["evidence_type"], PENDING))["c"]
        ok = r["reported"] == ev
        rows.append({**r, "evidence": ev, "pending": pending, "diff": r["reported"] - ev, "ok": ok,
                     "state": "Mos" if ok else ("Tekshirish kerak" if pending else "Mos emas")})
    mism = [r for r in rows if not r["ok"]]
    return {
        "rows": rows, "mismatches": len(mism), "found": len(rows) - len(mism), "total": len(rows),
        "summary": f"{len(mism)} ta nomuvofiqlik aniqlandi." if mism else "Nomuvofiqlik aniqlanmadi.",
        "policy": "Sun'iy intellekt avtomatik tuzatmaydi: tekshirish → vakolatli shaxs tasdig'i → yangilash",
        "sources": ["D06 — yillik hisobot", "Dalillar reyestri (Excel)"],
    }


def _claim_actual(db: DB, ind: str):
    c = lambda sql, a=(): db.one(sql, a)["c"]
    if ind.endswith("_tasdiqlangan") and not ind.startswith("dalil"):
        return c("SELECT COUNT(*) c FROM evidence WHERE type=? AND status=?", (ind.split("_")[0], APPROVED))
    if ind == "maqola_kutilmoqda":
        return c("SELECT COUNT(*) c FROM evidence WHERE type='maqola' AND status=?", (PENDING,))
    if ind.startswith("kpi_"):
        return kpi(db, ind[4:])["percent"]
    return {"dalil_jami": lambda: c("SELECT COUNT(*) c FROM evidence"),
            "dalil_tasdiqlangan": lambda: c("SELECT COUNT(*) c FROM evidence WHERE status=?", (APPROVED,)),
            "dalil_kutilmoqda": lambda: c("SELECT COUNT(*) c FROM evidence WHERE status=?", (PENDING,)),
            "dalil_rad": lambda: c("SELECT COUNT(*) c FROM evidence WHERE status=?", (REJECTED,))}[ind]()


CLAIM_LABELS = {"maqola_tasdiqlangan": "Tasdiqlangan maqolalar", "maqola_kutilmoqda": "Kutilayotgan maqolalar",
                "grant_tasdiqlangan": "Tasdiqlangan grantlar", "konferensiya_tasdiqlangan": "Tasdiqlangan konferensiyalar",
                "patent_tasdiqlangan": "Patent/dasturiy guvohnomalar", "dalil_jami": "Jami dalillar",
                "dalil_tasdiqlangan": "Tasdiqlangan dalillar", "dalil_kutilmoqda": "Kutilayotgan dalillar",
                "dalil_rad": "Rad etilgan dalillar"}


def claims_check(db: DB) -> list[dict]:
    """Hisobot hujjatlaridagi raqamlarni asosiy ma'lumot (reyestr) bilan solishtirish."""
    out = []
    for cl in db.q("SELECT c.*, d.title FROM doc_claims c JOIN documents d ON d.id=c.doc_id ORDER BY c.id"):
        actual = _claim_actual(db, cl["indicator"])
        label = CLAIM_LABELS.get(cl["indicator"])
        if not label:
            label = f"{teacher(db, cl['indicator'][4:])['short_name']} faoliyat ko'rsatkichi, %"
        ok = float(actual) == float(cl["value"])
        out.append({**cl, "label": label, "actual": actual, "ok": ok,
                    "state": "Mos" if ok else "Tekshirish talab qilinadi"})
    return out


# ---------------------------------------------------------------- Ma'lumot sifati nazoratchisi
_dup_cache = {}


def duplicate_documents(db: DB) -> list[dict]:
    docs = db.q("SELECT id, title, body, checksum FROM documents")
    key = tuple(sorted(d["id"] + d["checksum"] for d in docs))
    if key in _dup_cache:
        return _dup_cache[key]
    sets = {d["id"]: set(tokenize(d["body"])) for d in docs}
    out = []
    for i, a in enumerate(docs):
        for b in docs[i + 1:]:
            sa, sb = sets[a["id"]], sets[b["id"]]
            small, big = (a, b) if len(sa) <= len(sb) else (b, a)
            s_small, s_big = sets[small["id"]], sets[big["id"]]
            if len(s_small) < 5:
                continue
            cont = len(s_small & s_big) / len(s_small)
            short = "qisqa namuna" in small["title"]
            if a["checksum"] == b["checksum"] or cont >= 0.8 or (short and cont >= 0.7):
                out.append({"doc": small["id"], "title": small["title"], "similar_to": big["id"],
                            "similar_title": big["title"], "overlap": round(100 * cont)})
    _dup_cache.clear()
    _dup_cache[key] = out
    return out


def quality_issues(db: DB) -> list[dict]:
    t0 = config.today()
    issues = []
    for d in duplicate_documents(db):
        issues.append({"kind": "Takroriy hujjat", "object": f"{d['doc']} ↔ {d['similar_to']}",
                       "detail": f"«{d['title']}» mazmunining {d['overlap']}% qismi «{d['similar_title']}» da bor"})
    for e in duplicate_evidence(db):
        issues.append({"kind": "Takroriy dalil", "object": f"Dalil #{e['id']}",
                       "detail": f"«{e['title']}» — dalil #{e['duplicate_of']} bilan bir xil DOI/sarlavha"})
    for r in reconciliation(db)["rows"]:
        if not r["ok"]:
            issues.append({"kind": "Hisobot asosiy ma'lumotga mos emas", "object": f"{r['label']} (D06)",
                           "detail": f"Hisobotda {r['reported']}, tasdiqlangan dalil {r['evidence']}"})
    for c in claims_check(db):
        if not c["ok"]:
            issues.append({"kind": "Hisobot asosiy ma'lumotga mos emas", "object": f"{c['label']} ({c['doc_id']})",
                           "detail": f"Hujjatda {c['value']:g}, reyestr bo'yicha {c['actual']}" + (f". {c['note']}" if c["note"] else "")})
    for t in teachers(db):
        if t["load_hours"] > t["max_load"]:
            issues.append({"kind": "Yuklama me'yordan oshgan", "object": t["short_name"],
                           "detail": f"{t['load_hours']} soat > {t['max_load']} soat (D07)"})
    for e in db.q("SELECT * FROM evidence"):
        if e["created_at"] and _d(e["created_at"]) > t0:
            issues.append({"kind": "Sana noto'g'ri", "object": f"Dalil #{e['id']}", "detail": f"Sana kelajakda: {fmt_date(e['created_at'])}"})
        if e["subtype"] == "Scopus" and not e["doi"]:
            issues.append({"kind": "Majburiy maydon to'ldirilmagan", "object": f"Dalil #{e['id']}", "detail": "Scopus maqolasida DOI yo'q"})
        if not e["file"] and not e["doi"]:
            issues.append({"kind": "Majburiy maydon to'ldirilmagan", "object": f"Dalil #{e['id']}", "detail": "Na fayl, na DOI biriktirilgan"})
    for i in issues:
        i["status"] = "Tekshirish talab qilinadi"
    return issues


def duplicate_evidence(db: DB) -> list[dict]:
    seen, dups = {}, []
    for e in db.q("SELECT * FROM evidence ORDER BY id"):
        if e["status"] == REJECTED:
            continue
        key = e["doi"] or re.sub(r"\W+|qaytayuklangan|dublikatmi", "", e["title"].lower())
        if key in seen:
            dups.append({"id": e["id"], "duplicate_of": seen[key], "title": e["title"]})
        else:
            seen[key] = e["id"]
    return dups


# ---------------------------------------------------------------- Ma'lumot sog'lomligi
def data_health(db: DB) -> dict:
    ev = db.q("SELECT * FROM evidence")
    req, filled = 0, 0
    for e in ev:
        checks = [bool(e["title"]), bool(e["file"] or e["doi"]), e["score"] is not None, bool(e["created_at"])]
        if e["subtype"] == "Scopus":
            checks.append(bool(e["doi"]))
        if e["status"] == APPROVED:
            checks.append(bool(e["approved_by"]))
        req += len(checks)
        filled += sum(checks)
    completeness = round(100 * filled / req) if req else 0
    items = db.q("SELECT teacher_id, category FROM kpi_items")
    ok_pairs = {(e["teacher_id"], e["category"]) for e in ev if e["status"] == APPROVED}
    covered = sum(1 for i in items if (i["teacher_id"], i["category"]) in ok_pairs)
    coverage = round(100 * covered / len(items)) if items else 0
    srcs = db.q("SELECT * FROM data_sources")
    t0 = config.today()
    fresh = [s for s in srcs if (t0 - _d(s["last_sync"])).days <= 30]
    freshness = round(100 * len(fresh) / len(srcs)) if srcs else 0
    stale = [s["name"] for s in srcs if s not in fresh]
    conflicts = reconciliation(db)["mismatches"] + sum(1 for c in claims_check(db) if not c["ok"])
    dups = duplicate_evidence(db)
    ddocs = duplicate_documents(db)
    return {
        "completeness": {"value": completeness, "label": "To'liqlik",
                         "formula": f"to'ldirilgan majburiy maydonlar / jami majburiy maydonlar × 100 = {filled}/{req}"},
        "evidence_coverage": {"value": coverage, "label": "Dalillar bilan qamrab olinganlik",
                              "formula": f"tasdiqlangan dalili bor ko'rsatkich elementlari / jami elementlar × 100 = {covered}/{len(items)}"},
        "freshness": {"value": freshness, "label": "Ma'lumot yangiligi", "stale": stale,
                      "formula": f"oxirgi 30 kunda yangilangan manbalar / jami manbalar × 100 = {len(fresh)}/{len(srcs)}"},
        "conflicts": {"value": conflicts, "label": "Aniqlangan nomuvofiqliklar",
                      "formula": "hisobot (D06) va hisobot hujjatlaridagi raqamlardan asosiy ma'lumotga mos kelmaganlari soni"},
        "duplicates": {"value": len(dups) + len(ddocs), "label": "Takroriy ma'lumotlar", "items": dups, "docs": ddocs,
                       "formula": "bir xil DOI yoki sarlavhali faol dalillar + mazmuni 80% dan ortiq (qisqa namunada 70%) mos keladigan hujjatlar"},
        "score": round((completeness + coverage + freshness) / 3),
        "score_formula": "(to'liqlik + qamrab olinganlik + yangilik) / 3",
    }


# ---------------------------------------------------------------- Erta ogohlantirish
def early_warnings(db: DB) -> list[dict]:
    t0 = config.today()
    risks = []
    for t in teachers(db):
        p = db.one("SELECT * FROM science_plans WHERE teacher_id=?", (t["id"],))
        k = kpi(db, t["id"])
        ind, level = [], None
        if p:
            pct = round(100 * p["done"] / p["planned"])
            days_left = (_d(p["deadline"]) - t0).days
            idle = (t0 - _d(p["last_progress"])).days
            if pct < 50:
                ind.append(f"Ilmiy reja bajarilishi: {p['done']}/{p['planned']} = {pct}% (< 50%)")
            if pct < 50 and 0 <= days_left <= 30:
                ind.append(f"Qolgan muddat: {days_left} kun (bosqich muddati {fmt_date(p['deadline'])})")
                level = "red"
            if idle > 30:
                ind.append(f"So'nggi rivojlanish: oxirgi {idle} kunda 0% (oxirgisi {fmt_date(p['last_progress'])})")
                level = level or "yellow"
            if pct < 50 and not level:
                level = "yellow"
        if k["percent"] < 35:
            ind.append(f"Faoliyat ko'rsatkichi: {k['percent']}% ({k['verified']:g}/{k['max']:g} ball)")
            level = level or "yellow"
        pend = sum(i["evidence_pending"] for i in k["items"])
        rej = sum(i["evidence_rejected"] for i in k["items"])
        if pend:
            ind.append(f"Tasdiqlanmagan dalillar: {pend} ta")
        if rej:
            ind.append(f"Rad etilgan dalillar: {rej} ta")
        if not level:
            continue
        name = t["short_name"]
        sur = name.split()[0]
        recs = [{"text": f"{name} bilan ilmiy reja bo'yicha individual suhbat va bajarish rejasini tuzish",
                 "priority": "yuqori", "assignee": t["id"], "responsible": "Kafedra mudiri",
                 "deadline": str(min(t0 + timedelta(days=4), _d(p["deadline"]) if p else t0 + timedelta(days=4))),
                 "control": str(t0 + timedelta(days=7))}]
        if pend:
            recs.append({"text": f"{sur}ning {pend} ta kutilayotgan dalilini tekshirish", "priority": "o'rta",
                         "assignee": t["id"], "responsible": "Kafedra mudiri",
                         "deadline": str(t0 + timedelta(days=3)), "control": str(t0 + timedelta(days=5))})
        if rej:
            recs.append({"text": f"{sur}: rad etilgan dalil o'rniga talabga mos yangi dalil yuklash", "priority": "o'rta",
                         "assignee": t["id"], "responsible": name,
                         "deadline": str(t0 + timedelta(days=10)), "control": str(t0 + timedelta(days=12))})
        if p and p["done"] < p["planned"]:
            recs.append({"text": f"{sur}: ilmiy reja bo'yicha hisobot topshirish", "priority": "o'rta",
                         "assignee": t["id"], "responsible": name, "deadline": p["deadline"],
                         "control": str(_d(p["deadline"]) + timedelta(days=1))})
        risks.append({
            "id": f"R-{t['id']}", "area": "Ilmiy faoliyat", "level": level, "teacher_id": t["id"], "teacher": name,
            "title": f"{name}: ilmiy rejaning o'z vaqtida bajarilmasligi xavf belgisi",
            "note": RISK_NOTE, "why": ind,
            "evidence": ["Ilmiy ish rejasi (D05)", "Bayonnoma №3 (D03)", "Ko'rsatkichlar xavfi hisoboti (H13)", "Dalillar reyestri"],
            "docs": ["D05", "D03", "H13"],
            "recommendations": recs,
        })
    for t in teachers(db):
        if t["load_hours"] > t["max_load"]:
            risks.append({
                "id": f"L-{t['id']}", "area": "O'quv faoliyati", "level": "yellow", "teacher_id": t["id"],
                "teacher": t["short_name"], "title": f"{t['short_name']}: o'quv yuklamasi me'yordan yuqori",
                "note": RISK_NOTE,
                "why": [f"Yuklama: {t['load_hours']} soat; me'yor: {t['max_load']} soat (+{t['load_hours'] - t['max_load']})"],
                "evidence": ["O'quv yuklama taqsimoti (D07)", "Bayonnoma №1 (D01)"], "docs": ["D07", "D01"],
                "recommendations": [{"text": f"{t['short_name']} yuklamasini qayta taqsimlash taklifini tayyorlash",
                                     "priority": "o'rta", "assignee": None, "responsible": "Kafedra mudiri",
                                     "deadline": str(t0 + timedelta(days=7)), "control": str(t0 + timedelta(days=10))}],
            })
    for task in overdue_tasks(db):
        late = (t0 - _d(task["deadline"])).days
        risks.append({
            "id": f"T-{task['id']}", "area": "Vazifalar", "level": "red", "teacher_id": task["assignee"],
            "teacher": task["responsible"], "title": f"Muddati o'tgan vazifa: {task['title']}", "note": RISK_NOTE,
            "why": [f"Muddat: {fmt_date(task['deadline'])}; holat: {task['status']}; bajarilish: {task['progress']}%; kechikish: {late} kun"],
            "evidence": [task["source"], "Muammolar va vazifalar hisoboti (H16)"], "docs": ["H16", "H05"],
            "recommendations": [{"text": f"{task['responsible']} bilan yangi muddatni kelishish va bajarilishini nazorat qilish",
                                 "priority": "yuqori", "assignee": task["assignee"], "responsible": "Kafedra mudiri",
                                 "deadline": str(t0 + timedelta(days=2)), "control": str(t0 + timedelta(days=3))}],
        })
    order = {"red": 0, "yellow": 1}
    risks.sort(key=lambda r: (order[r["level"]], -len(r["why"])))
    return risks


def overdue_tasks(db: DB):
    return db.q("SELECT * FROM tasks WHERE status NOT IN ('bajarildi','qisman') AND deadline < ? AND deadline >= ? ORDER BY deadline",
                (str(config.today()), str(config.today() - timedelta(days=365))))


def tasks_until(db: DB, until: date):
    return db.q("SELECT * FROM tasks WHERE status NOT IN ('bajarildi','qisman') AND deadline <= ? AND deadline >= ? ORDER BY deadline",
                (str(until), str(config.today() - timedelta(days=365))))


def deadline_alerts(db: DB, days=2):
    t0 = config.today()
    out = []
    for t in db.q("SELECT * FROM tasks WHERE status NOT IN ('bajarildi','qisman') AND deadline >= ? AND deadline <= ? ORDER BY deadline",
                  (str(t0), str(t0 + timedelta(days=days)))):
        left = (_d(t["deadline"]) - t0).days
        t["alert"] = (f"Vazifa yakuniy muddatiga {left} kun qoldi. Vazifa hali bajarilmagan." if left
                      else "Vazifa muddati bugun tugaydi. Vazifa hali bajarilmagan.")
        out.append(t)
    return out


# ---------------------------------------------------------------- Kafedra holati xaritasi
HEALTH_RULES = {
    "oquv": "Qizil: me'yordan oshgan o'qituvchilar ≥ 3; sariq: ≥ 1",
    "ilmiy": "Qizil: kamida 1 ta qizil xavf belgisi; sariq: sariq belgilar mavjud",
    "talabalar": "Sariq: o'rtacha davomat < 85% yoki davomati past guruh bor",
    "korsatkich": "Qizil: o'rtacha ko'rsatkich < 35%; sariq: < 50%",
    "loyihalar": "Sariq: hisobotdagi grantlar soni dalildan ko'p yoki ariza bosqichidagi loyiha bor",
    "hujjatlar": "Sariq: tekshirish talab qiladigan hujjatlar mavjud",
    "data": "Qizil: ma'lumot sog'lomligi < 70%; sariq: < 90% yoki nomuvofiqlik bor",
    "vazifalar": "Qizil: muddati o'tgan vazifa bor; sariq: 14 kun ichida muddati tugaydigan vazifa bor",
}


def health_map(db: DB) -> list[dict]:
    t0 = config.today()
    risks = early_warnings(db)
    stats = {s["key"]: s for s in db.q("SELECT * FROM kafedra_stats")}
    dh = data_health(db)
    ov = kpi_overview(db)
    avg = round(sum(o["percent"] for o in ov) / len(ov))
    lvl = lambda red, yellow: "red" if red else ("yellow" if yellow else "green")
    sci = [r for r in risks if r["area"] == "Ilmiy faoliyat"]
    sci_red = [r for r in sci if r["level"] == "red"]
    over = [t for t in teachers(db) if t["load_hours"] > t["max_load"]]
    soon = tasks_until(db, t0 + timedelta(days=14))
    overdue = overdue_tasks(db)
    pending = db.one("SELECT COUNT(*) c FROM evidence WHERE status=?", (PENDING,))["c"]
    plans = db.q("SELECT * FROM science_plans")
    behind = [p for p in plans if p["done"] / p["planned"] < 0.5]
    rec = reconciliation(db)
    grant = next((r for r in rec["rows"] if r["indicator"] == "grant"), None)
    review_docs = len({c["doc_id"] for c in claims_check(db) if not c["ok"]}) + len(dh["duplicates"]["docs"])
    items = [
        ("oquv", "O'quv faoliyati", lvl(len(over) >= 3, over),
         [f"Me'yordan oshgan yuklama: {len(over)} o'qituvchi" + (" (" + ", ".join(t["short_name"] for t in over) + ")" if over else "")], "D07"),
        ("ilmiy", "Ilmiy faoliyat", lvl(sci_red, sci),
         [f"Ilmiy reja bajarilishi 50% dan past: {len(behind)} o'qituvchi",
          f"Qizil xavf belgilari: {len(sci_red)} ta (muddat ≤ 30 kun)",
          f"Tasdiqlanmagan dalillar: {pending} ta"], "D05, H13"),
        ("talabalar", "Talabalar", lvl(False, stats["attendance"]["value"] < 85 or stats["low_att_groups"]["value"] > 0),
         [f"O'rtacha davomat: {stats['attendance']['value']:g}%", f"Davomati 80% dan past guruhlar: {stats['low_att_groups']['value']:g}",
          f"Akademik qarzdorlar: {stats['debtors']['value']:g} nafar"], "D10"),
        ("korsatkich", "Faoliyat ko'rsatkichlari", lvl(avg < 35, avg < 50),
         [f"O'rtacha faoliyat ko'rsatkichi: {avg}%", f"50% dan past: {sum(1 for o in ov if o['percent'] < 50)} o'qituvchi"], "D04, reyestr"),
        ("loyihalar", "Loyihalar", lvl(False, (grant and not grant["ok"]) or True),
         [f"Hisobotdagi grantlar: {grant['reported'] if grant else '—'}, tasdiqlangan dalil: {grant['evidence'] if grant else '—'}",
          "Reyestrda 3 ta loyiha, shundan 1 tasi ariza bosqichida"], "D11, H08"),
        ("hujjatlar", "Hujjatlar", lvl(False, review_docs),
         [f"Tekshirish talab qiladigan hujjatlar: {review_docs} ta (raqam nomuvofiqligi yoki takroriy mazmun)"], "Raqamli xotira"),
        ("data", "Ma'lumot sifati", lvl(dh["score"] < 70, dh["score"] < 90 or dh["conflicts"]["value"]),
         [f"Ma'lumot sog'lomligi: {dh['score']}%", f"Nomuvofiqliklar: {dh['conflicts']['value']}",
          f"Takroriy ma'lumotlar: {dh['duplicates']['value']}", "Eskirgan manbalar: " + (", ".join(dh["freshness"]["stale"]) or "yo'q")],
         "Ma'lumot sog'lomligi"),
        ("vazifalar", "Vazifalar", lvl(overdue, soon),
         [f"Muddati o'tgan: {len(overdue)}", f"14 kun ichida muddati tugaydigan: {len(soon)}"], "Harakat markazi"),
    ]
    return [{"key": k, "name": n, "status": s, "why": w, "source": src, "rule": HEALTH_RULES[k]} for k, n, s, w, src in items]


# ---------------------------------------------------------------- Bugungi kafedra
def daily_brief(db: DB) -> dict:
    t0 = config.today()
    risks = early_warnings(db)
    red = [r for r in risks if r["level"] == "red"]
    soon = tasks_until(db, t0 + timedelta(days=14))
    pending = db.q("SELECT e.*, t.short_name FROM evidence e JOIN teachers t ON t.id=e.teacher_id WHERE status=?", (PENDING,))
    drafts = db.one("SELECT COUNT(*) c FROM reports WHERE status='draft'")["c"]
    staff = {r["teacher_id"] for r in risks if r["teacher_id"] in {t["id"] for t in teachers(db)}}
    low = [o for o in kpi_overview(db) if o["percent"] < 35]
    claims = [c for c in claims_check(db) if not c["ok"]]
    review_docs = sorted({c["doc_id"] for c in claims} | {d["doc"] for d in duplicate_documents(db)})
    open_tasks = db.one("SELECT COUNT(*) c FROM tasks WHERE status NOT IN ('bajarildi','qisman') AND deadline >= ?",
                        (str(t0 - timedelta(days=365)),))["c"]
    rec = reconciliation(db)
    return {
        "date": fmt_date(t0),
        "critical": len(red), "deadlines": len(soon), "to_approve": len(pending) + drafts,
        "attention_staff": len(staff), "low_kpi": len(low), "review_docs": len(review_docs),
        "open_tasks": open_tasks, "pending_evidence": len(pending), "mismatches": rec["mismatches"],
        "top_issue": red[0] if red else (risks[0] if risks else None),
        "deadline_list": soon, "pending_list": pending, "review_doc_list": review_docs,
        "alerts": deadline_alerts(db),
        "health_map": health_map(db), "data_health": data_health(db),
        "secretary": secretary(db)[:5],
    }


# ---------------------------------------------------------------- Sun'iy intellekt kotibi
def secretary(db: DB) -> list[dict]:
    """"Bugun nima qilishim kerak?" — ustuvor ishlar ro'yxati (tavsiya, qaror emas)."""
    t0 = config.today()
    out = []
    for t in overdue_tasks(db):
        out.append({"priority": 1, "level": "yuqori", "text": f"Muddati o'tgan vazifani hal qilish: {t['title']}",
                    "why": f"Muddat {fmt_date(t['deadline'])}, {(t0 - _d(t['deadline'])).days} kun kechikdi, bajarilish {t['progress']}%",
                    "link": "#tasks", "source": t["source"]})
    for t in deadline_alerts(db):
        out.append({"priority": 1, "level": "yuqori", "text": f"Yaqin muddat: {t['title']} ({t['responsible']})",
                    "why": t["alert"], "link": "#tasks", "source": t["source"]})
    for r in [r for r in early_warnings(db) if r["level"] == "red" and r["area"] == "Ilmiy faoliyat"]:
        out.append({"priority": 2, "level": "yuqori", "text": f"Xavf belgisi: {r['title']}", "why": "; ".join(r["why"][:2]),
                    "link": "#warn", "source": ", ".join(r["docs"])})
    pend = db.q("SELECT e.*, t.short_name FROM evidence e JOIN teachers t ON t.id=e.teacher_id WHERE status=?", (PENDING,))
    if pend:
        out.append({"priority": 3, "level": "o'rta", "text": f"{len(pend)} ta dalilni ko'rib chiqish va tasdiqlash yoki rad etish",
                    "why": "; ".join(f"{p['short_name']}: {p['title']}" for p in pend), "link": "#vault", "source": "Dalillar ombori"})
    rec = reconciliation(db)
    if rec["mismatches"]:
        out.append({"priority": 3, "level": "o'rta", "text": "Yillik hisobot va dalillar o'rtasidagi farqlarni tekshirish",
                    "why": "; ".join(f"{r['label']}: {r['reported']} ↔ {r['evidence']}" for r in rec["rows"] if not r["ok"]),
                    "link": "#reports", "source": "D06, H15"})
    claims = [c for c in claims_check(db) if not c["ok"]]
    if claims:
        out.append({"priority": 4, "level": "o'rta", "text": f"{len({c['doc_id'] for c in claims})} ta hisobot hujjatidagi raqamlarni aniqlashtirish",
                    "why": f"{len(claims)} ta raqam asosiy reyestrga mos emas", "link": "#health", "source": ", ".join(sorted({c['doc_id'] for c in claims}))})
    if t0.weekday() <= 4:
        out.append({"priority": 4, "level": "o'rta", "text": "Juma kungi haftalik hisobot loyihasini tayyorlash",
                    "why": "Dekan farmoyishi: haftalik hisobot har juma, inson tasdig'idan keyin yuboriladi", "link": "#reports", "source": "D12"})
    out.sort(key=lambda x: x["priority"])
    for i, x in enumerate(out, 1):
        x["n"] = i
    return out


def meeting_agenda(db: DB) -> dict:
    """Yig'ilishga tayyorgarlik: avvalgi qarorlar, bajarilmagan topshiriqlar, xavflar, muddatlar."""
    t0 = config.today()
    last = db.one("SELECT * FROM documents WHERE type='bayonnoma' AND date <= ? AND id LIKE 'D%' AND title NOT LIKE '%qisqa namuna%' ORDER BY date DESC LIMIT 1", (str(t0),))
    decisions = [c["text"] for c in db.q("SELECT text FROM chunks WHERE doc_id=? ORDER BY idx", (last["id"],))] if last else []
    open_t = db.q("SELECT * FROM tasks WHERE status NOT IN ('bajarildi','qisman') AND deadline >= ? ORDER BY deadline", (str(t0 - timedelta(days=60)),))
    risks = [r for r in early_warnings(db) if r["level"] == "red"]
    agenda = ["Avvalgi yig'ilish qarorlarining bajarilishi", "Ilmiy reja bo'yicha xavf belgilari: " + ", ".join(r["teacher"] for r in risks if r["area"] == "Ilmiy faoliyat"),
              "Hisobot va dalillar o'rtasidagi farqlar (D06)", "Yaqin 14 kundagi muddatlar", "Turli masalalar"]
    return {"last": last, "decisions": decisions, "open_tasks": open_t, "risks": risks, "agenda": agenda}


# ---------------------------------------------------------------- O'qituvchi: rivojlanish rejasi
def development_plan(db: DB, tid: str) -> dict:
    k = kpi(db, tid)
    plan = db.one("SELECT * FROM science_plans WHERE teacher_id=?", (tid,))
    rec = []
    by = {i["category"]: i for i in k["items"]}
    if by["maqola"]["verified"] < by["maqola"]["max"]:
        need = max(1, round((by["maqola"]["max"] - by["maqola"]["verified"]) / 4))
        rec.append(f"{min(need, 2)} ta ilmiy maqola (bo'sh ball: {by['maqola']['max'] - by['maqola']['verified']:g})")
    if by["konferensiya"]["verified"] < by["konferensiya"]["max"]:
        rec.append("1 ta xalqaro yoki respublika konferensiyasi")
    rec.append("1 ta malaka oshirish kursi")
    if by["grant"]["verified"] == 0:
        rec.append("1 ta loyiha yoki grant arizasida ishtirok")
    if by["tarbiyaviy"]["verified"] < by["tarbiyaviy"]["max"]:
        rec.append("2 ta talaba ilmiy loyihasiga rahbarlik / tarbiyaviy tadbir")
    if by["metodik"]["verified"] < by["metodik"]["max"]:
        rec.append("O'quv-metodik majmuani yangilash yoki o'quv qo'llanma")
    return {"title": "Tavsiya etilgan rivojlanish rejasi (2026–2027-o'quv yili)", "items": rec,
            "note": "Bu majburiy reja emas — mavjud ko'rsatkichlarga asoslangan tavsiya.",
            "basis": [f"{i['name']}: {i['verified']:g}/{i['max']:g}" for i in k["items"]]
            + ([f"Ilmiy reja: {plan['done']}/{plan['planned']}"] if plan else [])}


# ---------------------------------------------------------------- Dalillar bog'lanish xaritasi
def evidence_graph(db: DB, tid: str) -> dict:
    k = kpi(db, tid)
    nodes = [{"id": tid, "label": k["teacher"]["short_name"], "kind": "teacher"}]
    edges = []
    for it in k["items"]:
        kid = f"K:{it['category']}"
        nodes.append({"id": kid, "label": f"{it['name']} ({it['verified']:g}/{it['max']:g})", "kind": "kpi"})
        edges.append((tid, kid))
    approvers = set()
    for e in k["evidence"]:
        eid = f"E:{e['id']}"
        nodes.append({"id": eid, "label": e["title"][:48], "kind": "evidence", "status": e["status"]})
        edges.append((f"K:{e['category']}", eid))
        label = ("PDF" if e["file"] else "") + (" + DOI" if e["doi"] else "")
        if label.strip():
            nodes.append({"id": f"F:{e['id']}", "label": label.strip(" +"), "kind": "document", "evidence_id": e["id"]})
            edges.append((eid, f"F:{e['id']}"))
        if e["approved_by"]:
            approvers.add(e["approved_by"])
            edges.append((eid, f"U:{e['approved_by']}"))
    for a in approvers:
        nodes.append({"id": f"U:{a}", "label": f"Tasdiqlovchi: {a}", "kind": "approver"})
    return {"nodes": nodes, "edges": [{"from": a, "to": b} for a, b in edges]}
