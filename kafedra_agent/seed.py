"""Boshlang'ich ma'lumotlarni yuklash.

Manbalar:
  data/manba/02_Kafedra_hujjatlari/*.docx  → kafedra hujjatlari (D01…)
  data/manba/04_Hisobotlar/*.docx          → hisobotlar (H01…)
  data/manba/03_KPI/*.xlsx                 → dalillar reyestri (41 ta yozuv)
  data/manba/01_Evidence_PDF/*.pdf         → dalil fayllari (yozuvlarga avtomatik bog'lanadi)
  data/qoshimcha/*.md                      → qo'shimcha namuna hujjatlar
O'qituvchilar, rejalar, yuklama va vazifalar quyida — hujjatlardagi (D01, D05, D07, D09, D11, D20)
ma'lumotlarga mos ravishda kiritilgan.

DIQQAT: barcha ma'lumotlar NAMUNA (demo). Real joriy etishda ular kafedraning ruxsat etilgan
ma'lumotlari bilan almashtiriladi.
"""
import hashlib
import re

from . import config
from .db import DB
from .importer import docx_to_doc, md_to_doc, norm_key, read_xlsx

MANBA = config.DATA_DIR / "manba"
QOSHIMCHA = config.DATA_DIR / "qoshimcha"

TEACHERS = [
    ("T1", "Aliyev Bobur Rustamovich", "Aliyev B.", "dotsent", "PhD", 1480, 1540),
    ("T2", "Karimova Dilnoza Akramovna", "Karimova D.", "katta o'qituvchi", "-", 1520, 1540),
    ("T3", "Rahimov Sardor Ilhomovich", "Rahimov S.", "dotsent", "PhD", 1610, 1540),
    ("T4", "Toshmatova Nilufar Baxtiyorovna", "Toshmatova N.", "katta o'qituvchi", "-", 1390, 1540),
    ("T5", "Yusupov Jasur Olimovich", "Yusupov J.", "assistent", "-", 1500, 1540),
    ("T6", "Ergasheva Malika Shuhratovna", "Ergasheva M.", "dotsent", "PhD", 1450, 1540),
    ("T7", "Qodirov Anvar Toirovich", "Qodirov A.", "professor", "DSc", 1580, 1540),
    ("T8", "Nazarova Shahlo Ravshanovna", "Nazarova Sh.", "assistent", "-", 1420, 1540),
]

USERS = [
    ("mudir", "mudir123", "Rasulov Akmal (kafedra mudiri)", "mudir", None),
    ("dekan", "dekan123", "Sobirov Ulug'bek (dekan)", "dekan", None),
    ("admin", "admin123", "Tizim administratori", "admin", None),
    ("aliyev", "aliyev123", "Aliyev Bobur", "oqituvchi", "T1"),
    ("karimova", "karimova123", "Karimova Dilnoza", "oqituvchi", "T2"),
]

# Faoliyat ko'rsatkichlari tuzilmasi (D04)
KPI_CATEGORIES = [
    ("maqola", "Ilmiy maqolalar", 15),
    ("konferensiya", "Konferensiya ma'ruzalari", 10),
    ("metodik", "O'quv-metodik ishlar", 10),
    ("grant", "Grant va loyihalar", 10),
    ("tarbiyaviy", "Ma'naviy-tarbiyaviy ishlar", 5),
]

# Ilmiy reja (D05) va bajarilish holati (D16): (o'qituvchi, reja, bajarilgan, muddat, oxirgi rivojlanish)
PLANS = [
    ("T1", 5, 1, "2026-10-20", "2026-08-20"),
    ("T2", 4, 3, "2026-12-15", "2026-09-28"),
    ("T3", 4, 3, "2026-12-20", "2026-10-01"),
    ("T4", 3, 2, "2026-11-30", "2026-09-30"),
    ("T5", 5, 1, "2026-10-18", "2026-08-25"),
    ("T6", 3, 2, "2026-12-01", "2026-09-15"),
    ("T7", 4, 2, "2026-11-15", "2026-09-02"),
    ("T8", 3, 1, "2026-10-30", "2026-09-20"),
]

STATS = [
    ("students", "Talabalar soni", 420, "nafar", "D07"),
    ("subjects", "Fanlar soni", 24, "ta", "D07"),
    ("attendance", "O'rtacha davomat (sentabr)", 91, "%", "D10"),
    ("gpa", "O'rtacha GPA", 3.62, "", "D10"),
    ("low_att_groups", "Davomati 80% dan past guruhlar", 2, "ta", "D10"),
    ("debtors", "Akademik qarzdor talabalar", 14, "nafar", "D10"),
]

SOURCES = [
    ("HEMIS eksporti (Excel)*", "excel", "2026-10-01 09:15", 2, "Ruxsat etilgan eksport; real vaqtli integratsiya emas"),
    ("Kafedra hujjatlari (Word)", "word", "2026-10-02 16:40", 3, ""),
    ("Kafedra hujjatlari (Excel)", "excel", "2026-09-12 11:05", 2, ""),
    ("Faoliyat ko'rsatkichlari va dalillar reyestri (Excel)", "excel", "2026-10-06 18:42", 41, "03_KPI/KPI_va_Evidence_reyestri_DEMO.xlsx"),
    ("Dalil fayllari (PDF)", "pdf", "2026-10-06 18:42", 41, "01_Evidence_PDF"),
    ("Ilmiy bo'lim reyestri (Excel)", "excel", "2026-09-20 10:00", 1, ""),
    ("Universitet me'yoriy hujjatlari (PDF)", "pdf", "2026-06-15 09:00", 3, ""),
    ("Kadrlar bo'limi (maxfiy)", "ichki", "2026-06-30 12:00", 2, "Faqat ruxsat etilgan foydalanuvchilar"),
    ("Dekanat (PDF)", "pdf", "2026-09-25 14:30", 1, ""),
    ("Kafedra hisobotlari (Word)", "word", "2026-10-06 17:00", 21, "04_Hisobotlar"),
]

# Hujjatlarda sana bo'lmasa — hujjat qabul qilingan sana
DOC_DATES = {"D04": "2026-06-15", "D05": "2026-08-29", "D06": "2026-09-05", "D07": "2026-08-29",
             "D08": "2026-05-20", "D09": "2026-09-12", "D10": "2026-10-01", "D11": "2026-09-20",
             "D12": "2026-09-25", "D13": "2026-03-10", "D14": "2026-09-01", "D15": "2026-06-30",
             "D16": "2026-10-04", "D17": "2026-10-05", "D18": "2026-10-06", "D19": "2026-10-06",
             "D20": "2026-10-06"}

# (nomi, o'qituvchi, mas'ul, boshlanish, muddat, nazorat, holat, foiz, ustuvorlik, manba, bog'langan hujjatlar)
TASKS = [
    ("O'quv-metodik majmualarni yangilash", "T4", "Toshmatova N.", "2026-09-01", "2026-09-30", "2026-10-03", "jarayonda", 60, "yuqori", "Bayonnoma №1 (D01)", "D01,D08,H05"),
    ("Sillabuslarni LMS platformasiga joylash", "T6", "Ergasheva M.", "2026-09-01", "2026-09-28", "2026-10-01", "bajarildi", 100, "o'rta", "D08", "D08"),
    ("Haftalik hisobotni rahbariyatga yuborish", None, "Kafedra mudiri", "2026-10-05", "2026-10-09", "2026-10-09", "yangi", 0, "yuqori", "Dekan farmoyishi (D12)", "D12,H01"),
    ("Grant shartnomasi nusxasini dalillar omboriga yuklash", "T7", "Qodirov A.", "2026-09-20", "2026-10-08", "2026-10-09", "yangi", 0, "yuqori", "D11", "D11,H08"),
    ("Ochiq dars: \"Ma'lumotlar bazasi\"", "T2", "Karimova D.", "2026-09-12", "2026-10-14", "2026-10-15", "jarayonda", 50, "o'rta", "D09", "D09"),
    ("Maqolani antiplagiatda qayta tekshirish", "T5", "Yusupov J.", "2026-10-01", "2026-10-16", "2026-10-17", "yangi", 0, "o'rta", "D13", "D13,H07"),
    ("Faoliyat ko'rsatkichlari dalillarini yuklash (barcha o'qituvchilar)", None, "Kafedra mudiri", "2026-09-12", "2026-10-20", "2026-10-21", "jarayonda", 70, "yuqori", "Bayonnoma №2 (D02), D12", "D02,D12"),
    ("Yillik hisobotdagi farqlarni aniqlashtirish", None, "Kafedra mudiri", "2026-10-02", "2026-10-25", "2026-10-26", "yangi", 0, "o'rta", "Bayonnoma №3 (D03)", "D03,D06,H15"),
    ("Maqolani xalqaro jurnalga yuborish", "T1", "Aliyev B.", "2026-09-12", "2026-11-15", "2026-11-16", "jarayonda", 30, "o'rta", "Bayonnoma №2 (D02)", "D02"),
]

# 2025-yil arxiv vazifalari (A01 bayonnomasi) — "O'tgan yili qanday hal qilingan?" savoli uchun
ARCHIVE_TASKS = [
    ("Ilmiy rejasi ortda qolgan o'qituvchilar bilan individual suhbat", None, "Kafedra mudiri", "2025-10-14", "2025-10-24", "2025-10-25", "bajarildi", 100, "yuqori", "Bayonnoma №4/2025 (A01)", "A01"),
    ("Har bir o'qituvchi uchun individual bajarish rejasi", None, "Kafedra mudiri", "2025-10-14", "2025-10-31", "2025-11-01", "bajarildi", 100, "yuqori", "Bayonnoma №4/2025 (A01)", "A01"),
    ("Ilmiy seminarlarni har 2 haftada o'tkazish", None, "Rahimov S.", "2025-10-14", "2025-12-30", "2026-01-05", "bajarildi", 100, "o'rta", "Bayonnoma №4/2025 (A01)", "A01"),
    ("Maqola yozish bo'yicha mentorlik juftliklari", None, "Qodirov A.", "2025-10-14", "2025-11-30", "2025-12-01", "qisman", 40, "o'rta", "Bayonnoma №4/2025 (A01)", "A01"),
]

# Hisobot hujjatlaridagi raqamli da'volar (hujjat matnidan olingan) — asosiy ma'lumot bilan solishtiriladi.
# (hujjat, ko'rsatkich, qiymat, iqtibos, izoh)
DOC_CLAIMS = [
    ("D19", "maqola_tasdiqlangan", 10, "Scientific articles | 12 | 10 (+2 pending)", ""),
    ("D19", "maqola_kutilmoqda", 2, "Pending: 2", ""),
    ("H15", "maqola_tasdiqlangan", 10, "Scientific articles | 12 | 10 | +2 pending", ""),
    ("H18", "maqola_tasdiqlangan", 10, "Evidence bo'yicha maqolalar | 10", ""),
    ("H18", "maqola_kutilmoqda", 2, "Pending | 2", ""),
    ("H20", "maqola_tasdiqlangan", 10, "Scientific articles: report 12, evidence 10", ""),
    ("H06", "kpi_T1", 20, "Aliyev B.: KPI bo'yicha 20% natija", "20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin"),
    ("H06", "kpi_T5", 20, "Yusupov J.: KPI bo'yicha 20%", ""),
    ("H20", "kpi_T1", 20, "Aliyev B. KPI 20%", "20% — ilmiy reja bajarilishi (1/5) bilan mos keladi; faoliyat ko'rsatkichi bilan aralashtirilgan bo'lishi mumkin"),
    ("H20", "kpi_T5", 20, "Yusupov J. KPI 20%", ""),
    ("H07", "dalil_jami", 41, "Jami evidence | 41", ""),
    ("H07", "dalil_tasdiqlangan", 39, "Tasdiqlangan | 39", ""),
    ("H07", "dalil_kutilmoqda", 1, "Kutilmoqda | 1", ""),
    ("H07", "dalil_rad", 1, "Rad etilgan | 1", ""),
    ("H21", "dalil_kutilmoqda", 2, "Tasdiqlanmagan dalillar: 2", ""),
    ("H08", "grant_tasdiqlangan", 2, "Evidence bilan tasdiqlangan | 2", ""),
    ("H09", "konferensiya_tasdiqlangan", 7, "Evidence bilan mos | 7", ""),
    ("H10", "patent_tasdiqlangan", 1, "Patent/dasturiy mahsulot | 1 | 1", ""),
]

A, P, R = "tasdiqlangan", "kutilmoqda", "rad etilgan"
SUBTYPE_MAP = {"scopus": "maqola", "oak": "maqola", "konferensiya": "konferensiya",
               "metodologiya": "metodik", "grant": "grant", "tarbiyaviy": "tarbiyaviy"}


def _pw(p: str) -> str:
    return hashlib.sha256(("ka-salt:" + p).encode()).hexdigest()


def add_document(db: DB, meta: dict, added_by="tizim", added_at=None):
    body = meta["body"]
    checksum = hashlib.sha1(re.sub(r"\W+", "", body.lower()).encode()).hexdigest()
    db.x("DELETE FROM chunks WHERE doc_id=?", (meta["id"],))
    db.x("""INSERT OR REPLACE INTO documents(id, title, type, date, access, owner, source, body, added_by,
            added_at, file, demo, checksum) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
         (meta["id"], meta["title"], meta.get("type", "hujjat"), meta.get("date", ""),
          meta.get("access", "public"), meta.get("owner"), meta.get("source", ""), body,
          added_by, added_at or meta.get("date", ""), meta.get("file"), int(bool(meta.get("demo"))), checksum))
    for i, ch in enumerate(meta["chunks"]):
        db.x("INSERT INTO chunks(doc_id, idx, text) VALUES(?,?,?)", (meta["id"], i, ch))


def _doc_id(prefix, stem, used):
    m = re.match(r"^(\d{2})_", stem)
    if m and f"{prefix}{m.group(1)}" not in used:
        return f"{prefix}{m.group(1)}"
    n = 21
    while f"{prefix}{n:02d}" in used:
        n += 1
    return f"{prefix}{n:02d}"


def load_documents(db: DB):
    used = set()
    for folder, prefix, kind in (("02_Kafedra_hujjatlari", "D", "hujjat"), ("04_Hisobotlar", "H", "hisobot")):
        files = sorted((MANBA / folder).glob("*.docx"), key=lambda f: (not re.match(r"\d{2}_", f.name), f.name))
        for f in files:
            did = _doc_id(prefix, f.stem, used)
            used.add(did)
            meta = docx_to_doc(f, did, date=DOC_DATES.get(did, "2026-10-06"), kind=kind)
            meta["file"] = str(f.relative_to(config.DATA_DIR))
            add_document(db, meta)
    for f in sorted(QOSHIMCHA.glob("*.md")):
        meta = md_to_doc(f)
        meta["file"] = None
        add_document(db, meta)


def load_evidence(db: DB):
    xlsx = next((MANBA / "03_KPI").glob("*.xlsx"))
    sheets = read_xlsx(xlsx)
    rows = next(v for k, v in sheets.items() if "reyestr" in k.lower())
    by_short = {t[2]: t[0] for t in TEACHERS}
    pdfs = {norm_key(p.stem): p for p in (MANBA / "01_Evidence_PDF").glob("*.pdf")}
    for r in rows[1:]:
        num, teacher, title, kind, score, doi, sana, status = (list(r) + [None] * 8)[:8]
        tid = by_short[teacher]
        cat = SUBTYPE_MAP[kind.lower()]
        tl = title.lower()
        if cat == "maqola":
            typ = "maqola"
        elif cat == "metodik":
            typ = "qo'llanma" if ("qo‘llanma" in tl or "qo'llanma" in tl or "ko‘rsatma" in tl) else "metodik"
        elif cat == "grant":
            typ = "patent" if ("guvohnoma" in tl or "patent" in tl) else "grant"
        else:
            typ = cat
        key = norm_key(teacher + title)
        pdf = pdfs.get(key) or next((p for k, p in pdfs.items() if k.startswith(key[:40])), None)
        d, m, y = sana.split(".")
        date = f"{y}-{m}-{d}"
        note = ""
        if status == R:
            note = "Antiplagiat: o'ziga xoslik 61% (talab 75%, D13)"
        if "dublikat" in tl:
            note = "Bir xil DOI bilan qayta yuklangan — dublikat bo'lishi mumkin"
        db.x("""INSERT INTO evidence(teacher_id, category, type, subtype, title, score, status, doi, has_pdf,
                file, doc_ref, source, approved_by, approved_at, created_at, note)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
             (tid, cat, typ, kind, title, float(score), status, doi or "", int(bool(pdf)),
              str(pdf.relative_to(config.DATA_DIR)) if pdf else None, "D04",
              "Dalillar reyestri (Excel)", "Rasulov A." if status == A else None,
              date if status == A else None, date, note))


def load_reported(db: DB):
    """Yillik hisobot (D06) jadvalidan hisobotdagi qiymatlar avtomatik olinadi."""
    body = db.one("SELECT body FROM documents WHERE id='D06'")["body"]
    labels = [("maqola", "maqola", "Ilmiy maqolalar"), ("konferensiya", "konferensiya", "Konferensiya ma'ruzalari"),
              ("grant", "grant", "Grant loyihalari"), ("patent", "patent", "Patent va dasturiy guvohnomalar")]
    for key, etype, label in labels:
        m = re.search(rf"^[^|\n]*{key}[^|\n]*\|\s*(\d+)", body, re.I | re.M)
        if m:
            db.x("INSERT INTO reported_stats VALUES(?,?,?,?,?)", (key, label, int(m.group(1)), etype, "D06"))


def seed(db: DB):
    db.many("INSERT INTO teachers VALUES(?,?,?,?,?,?,?)", TEACHERS)
    db.many("INSERT INTO users VALUES(?,?,?,?,?)", [(u, _pw(p), n, r, t) for u, p, n, r, t in USERS])
    for t in TEACHERS:
        for cat, name, mx in KPI_CATEGORIES:
            db.x("INSERT INTO kpi_items(teacher_id, category, name, max_score) VALUES(?,?,?,?)", (t[0], cat, name, mx))
    load_documents(db)
    load_evidence(db)
    load_reported(db)
    db.many("INSERT INTO science_plans VALUES(?,?,?,?,?,?)", [p + ("D05",) for p in PLANS])
    db.many("INSERT INTO kafedra_stats VALUES(?,?,?,?,?)", STATS)
    db.many("INSERT INTO data_sources VALUES(?,?,?,?,?)", SOURCES)
    for (title, assignee, resp, start, dl, ctrl, status, prog, prio, src, docs) in TASKS + ARCHIVE_TASKS:
        db.x("""INSERT INTO tasks(title, description, assignee, responsible, start_date, deadline,
                control_date, status, progress, priority, source, evidence_refs, created_by, created_at, done_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
             (title, "", assignee, resp, start, dl, ctrl, status, prog, prio, src, docs, "tizim", start,
              dl if status == "bajarildi" else None))
    db.many("INSERT INTO doc_claims(doc_id, indicator, value, quote, note) VALUES(?,?,?,?,?)", DOC_CLAIMS)
