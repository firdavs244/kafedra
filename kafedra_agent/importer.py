"""Hujjat va reyestrlarni import qilish (faqat standart kutubxona).

- .docx — paragraflar va jadvallar (jadval qatorlari "Ustun: qiymat" ko'rinishida)
- .xlsx — varaqlar qatorlari
- .md/.txt — frontmatter bilan yoki oddiy matn

Hujjat ichidagi matn har doim MA'LUMOT sifatida saqlanadi, hech qachon tizim buyrug'i sifatida emas.
"""
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

BOILERPLATE = re.compile(
    r"^(KAFEDRAAGENT MVP\b.*|Izoh: Ushbu hujjat KafedraAgent.*|DEMO / NAMUNA.*|"
    r"Mazkur hisobot tegishli manbalar.*|Ushbu hujjat faqat KafedraAgent MVP.*)$", re.I)


# ------------------------------------------------------------------ DOCX
def _ptext(p):
    return "".join(t.text or "" for t in p.iter(W + "t")).strip()


def read_docx(path) -> list[dict]:
    """Bloklar ro'yxati: {"kind": "p", "text"} yoki {"kind": "table", "rows": [[...]]}."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    blocks = []
    for el in body:
        if el.tag == W + "p":
            t = _ptext(el)
            if t:
                ppr = el.find(W + "pPr")
                style = ppr.find(W + "pStyle") if ppr is not None else None
                is_list = ppr is not None and (ppr.find(W + "numPr") is not None or
                                               (style is not None and "list" in (style.get(W + "val") or "").lower()))
                blocks.append({"kind": "p", "text": t, "list": is_list})
        elif el.tag == W + "tbl":
            rows = []
            for tr in el.iter(W + "tr"):
                cells = [" ".join(_ptext(p) for p in tc.iter(W + "p")).strip() for tc in tr.findall(W + "tc")]
                if any(cells):
                    rows.append(cells)
            if rows:
                blocks.append({"kind": "table", "rows": rows})
    return blocks


# ------------------------------------------------------------------ XLSX
def read_xlsx(path) -> dict[str, list[list]]:
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(S + "si"):
                shared.append("".join(t.text or "" for t in si.iter(S + "t")))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels}
        out = {}
        for sh in wb.find(S + "sheets"):
            t = target[sh.get(R + "id")].lstrip("/")
            t = t if t.startswith("xl/") else "xl/" + t
            rows = []
            for row in ET.fromstring(z.read(t)).iter(S + "row"):
                vals = []
                for c in row.findall(S + "c"):
                    col = re.match(r"[A-Z]+", c.get("r")).group()
                    idx = sum((ord(ch) - 64) * 26 ** i for i, ch in enumerate(reversed(col))) - 1
                    while len(vals) < idx:
                        vals.append(None)
                    v = c.find(S + "v")
                    if c.get("t") == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif c.get("t") == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(S + "t"))
                    else:
                        val = v.text if v is not None else None
                        if val is not None and re.fullmatch(r"-?\d+(\.\d+)?", val):
                            val = float(val) if "." in val else int(val)
                    vals.append(val)
                if any(x is not None for x in vals):
                    rows.append(vals)
            out[sh.get("name")] = rows
    return out


# ------------------------------------------------------------------ hujjat -> meta + bo'laklar
def _is_heading(t: str) -> bool:
    return len(t.split()) <= 6 and not t.endswith((".", ";", ":")) and not re.search(r"\d{2}\.\d{2}\.\d{4}", t)


MONTH_END = {"sentabr": "09-30", "oktabr": "10-06", "avgust": "08-31", "noyabr": "11-30"}


def _period_date(period: str):
    p = period.lower()
    m = re.search(r"(\d{2})\.(\d{2})\.(20\d{2})", p)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.search(r"(\d{1,2})\s*[–-]\s*\d{1,2}\s+(sentabr|oktabr)\s+(20\d{2})", p)
    if m:
        return f"{m.group(3)}-{'09' if m.group(2) == 'sentabr' else '10'}-{int(m.group(1)):02d}"
    for k, v in MONTH_END.items():
        if k in p:
            y = re.search(r"20\d{2}", p)
            return f"{y.group() if y else '2026'}-{v}"
    if re.search(r"2025\s*[–-]\s*2026", p):
        return "2026-09-05"
    return None


def _sentence(t: str) -> str:
    if not t.isupper():
        return t
    t = t[:1].upper() + t[1:].lower()
    return re.sub(r"\b(kpi|ai)\b", lambda m: m.group().upper(), t, flags=re.I)


def docx_to_doc(path, doc_id, date=None, kind="hujjat") -> dict:
    """kind="hisobot" — birinchi paragraf sarlavha, ikkinchisi davr (sana) deb olinadi."""
    blocks = read_docx(path)
    meta = {"id": doc_id, "access": "public", "owner": None, "source": "", "demo": False}
    if any(b["kind"] == "p" and BOILERPLATE.match(b["text"]) for b in blocks):
        meta["demo"] = True
    blocks = [b for b in blocks if b["kind"] == "table" or not BOILERPLATE.match(b["text"])]
    title = None
    if blocks and blocks[0]["kind"] == "p" and not blocks[0]["text"].endswith("."):
        title = blocks.pop(0)["text"]
        if title.startswith("NAMUNA / DEMO"):
            meta["demo"] = True
            title = title.split("—", 1)[-1].strip() + " (qisqa namuna)"
    period = None
    if kind == "hisobot" and blocks and blocks[0]["kind"] == "p" and (
            _period_date(blocks[0]["text"]) or (len(blocks[0]["text"].split()) <= 5 and re.search(r"20\d{2}", blocks[0]["text"]))):
        period = blocks.pop(0)["text"]
    meta["title"] = _sentence(title) if title else _title_from_name(Path(str(path)).stem)
    if period:
        meta["title"] += f" ({_sentence(period).lower()})"
    lines, chunks, cur, head = [], [], [], ""
    for b in blocks:
        if b["kind"] == "p":
            t = b["text"]
            m = re.match(r"^Manba:\s*(.*)$", t)
            if m:
                src = m.group(1)
                om = re.search(r"owner=(T\d+)", src)
                if om:
                    meta["access"], meta["owner"] = "owner", om.group(1)
                src = re.sub(r",?\s*owner=T\d+", "", src)
                meta["source"] = src.split("—", 1)[1].strip() if "—" in src else src
                continue
            lines.append(t)
            if not b.get("list") and _is_heading(t) and t != meta["title"]:
                if cur:
                    chunks.append(" ".join(cur))
                cur, head = [], t
                continue
            if not cur and head:
                cur.append(head + ":")
            cur.append(t if t.endswith((".", ":", ";", "?")) else t + ".")
            if sum(len(x.split()) for x in cur) > 60:
                chunks.append(" ".join(cur))
                cur = []
        else:
            if cur:
                chunks.append(" ".join(cur))
                cur = []
            hdr, *rows = b["rows"]
            lines.append(" | ".join(hdr))
            for r in rows:
                lines.append(" | ".join(r))
                pairs = [f"{h}: {v}" for h, v in zip(hdr, r) if v]
                chunks.append((head + " — " if head else "") + "; ".join(pairs) + ".")
    if cur:
        chunks.append(" ".join(cur))
    text = "\n".join(lines)
    dm = re.search(r"(\d{2})[._](\d{2})[._](20\d{2})", Path(str(path)).stem)
    meta["date"] = (f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}" if dm else None) \
        or (_period_date(period) if period else None) or date or ""
    meta["type"] = "shaxsiy" if meta["access"] == "owner" else ("hisobot" if kind == "hisobot" else _guess_type(meta["title"]))
    if kind == "hisobot" and not meta["source"]:
        meta["source"] = "Kafedra hisobotlari (Word)"
    meta["body"] = text
    meta["chunks"] = [c for c in chunks if len(c.split()) >= 3]
    return meta


def md_to_doc(path) -> dict:
    raw = Path(path).read_text(encoding="utf-8")
    meta, body = {}, raw
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = m.group(2).strip()
    meta.setdefault("id", Path(path).stem[:12])
    meta.setdefault("title", _title_from_name(Path(path).stem))
    meta.setdefault("access", "public")
    meta.setdefault("type", _guess_type(meta["title"]))
    meta["owner"] = meta.get("owner")
    meta["body"] = body
    meta["chunks"] = text_chunks(body)
    meta["demo"] = False
    return meta


def text_chunks(body: str) -> list[str]:
    out = []
    for p in re.split(r"\n\s*\n", body):
        ls = [x.strip() for x in p.splitlines() if x.strip()]
        if len(ls) > 3:
            out.extend(ls)
        elif ls:
            out.append(" ".join(ls))
    return out


def _title_from_name(stem: str) -> str:
    s = re.sub(r"^\d+_", "", stem).replace("_", " ").strip()
    return s[:1].upper() + s[1:]


TYPES = [("bayonnoma", "bayonnoma"), ("farmoyish", "farmoyish"), ("davomat", "statistika"),
         ("nizom", "nizom"), ("reja", "reja"), ("hisobot", "hisobot"), ("yuklama", "jadval"),
         ("jadval", "jadval"), ("reyestr", "reyestr"), ("tartib", "nizom"), ("talab", "nizom"),
         ("data health", "hisobot")]


def _guess_type(title: str) -> str:
    t = title.lower()
    return next((v for k, v in TYPES if k in t), "hujjat")


def norm_key(s: str) -> str:
    s = s.lower().replace("demo", "")
    return re.sub(r"[^a-z0-9]", "", s)


def docx_bytes_to_doc(data: bytes, doc_id: str, filename: str, date: str) -> dict:
    import io
    d = docx_to_doc(io.BytesIO(data), doc_id, date=date)
    if not d["title"] or d["title"].lower().startswith("bytesio"):
        d["title"] = _title_from_name(Path(filename).stem)
    return d
