"""Ma'lumot qidirish: BM25 + qayta saralash + ruxsat filtri + javob sifati nazorati."""
import math
import re
from collections import Counter
from dataclasses import dataclass, field

from . import config
from .auth import can_view_doc
from .db import DB
from .text import MONTHS, normalize, tokenize


@dataclass
class Hit:
    chunk_id: int
    doc_id: str
    doc_title: str
    doc_date: str
    text: str
    score: float
    coverage: float = 0.0


@dataclass
class RetrievalResult:
    hits: list
    query_terms: list
    filtered_out: int
    gate_passed: bool
    gate_reason: str
    config: dict = field(default_factory=dict)


class Index:
    """Hujjat bo'laklari ustida BM25 indeksi. Hujjat qo'shilganda qayta quriladi."""

    def __init__(self, db: DB):
        self.db = db
        self.build()

    def build(self):
        rows = self.db.q("""SELECT c.id, c.doc_id, c.text, d.title, d.date, d.access, d.owner
                            FROM chunks c JOIN documents d ON d.id=c.doc_id ORDER BY c.id""")
        self.rows = rows
        # Sarlavha ham indeksga qo'shiladi (kontekst uchun)
        self.toks = [tokenize(f"{r['title']} {_month_word(r['date'])} {(r['date'] or '')[:4]} {r['text']}") for r in rows]
        self.tf = [Counter(t) for t in self.toks]
        self.N = len(rows)
        self.avgdl = sum(len(t) for t in self.toks) / max(self.N, 1)
        df = Counter()
        for t in self.toks:
            df.update(set(t))
        self.idf = {w: math.log(1 + (self.N - n + 0.5) / (n + 0.5)) for w, n in df.items()}

    def bm25(self, i, q, k1=1.4, b=0.5):
        tf, dl, s = self.tf[i], len(self.toks[i]), 0.0
        for w in q:
            if w in tf:
                f = tf[w]
                s += self.idf[w] * f * (k1 + 1) / (f + k1 * (1 - b + b * dl / self.avgdl))
        return s

    def search(self, query: str, user, k=config.TOP_K, rerank=True, gate=True, doc_ids=None,
               ignore_terms=()) -> RetrievalResult:
        q0 = [t for t in dict.fromkeys(tokenize(query)) if t not in ignore_terms] or list(dict.fromkeys(tokenize(query)))
        q = _expand(q0)
        if re.search(r"\b(nechta|qancha)\b", normalize(query)):
            q.append("soni")
        groups = [_group(t) for t in q0]
        scored, filtered = [], 0
        for i, r in enumerate(self.rows):
            if doc_ids and r["doc_id"] not in doc_ids:
                continue
            s = self.bm25(i, q)
            if s <= 0:
                continue
            if not can_view_doc(user, r):
                filtered += 1          # ruxsat yo'q — retrieval bosqichida kesiladi
                continue
            ts = set(self.toks[i])
            cov = sum(1 for g in groups if g & ts) / max(len(groups), 1)
            scored.append(Hit(r["id"], r["doc_id"], r["title"], r["date"], r["text"], s, cov))
        if rerank:
            nq = normalize(query)
            months = {v for k, v in MONTHS.items() if k in nq}
            for h in scored:
                bonus = 1.0 + 1.5 * h.coverage ** 2
                # Sarlavhadagi so'zlar yoki aniq ibora mos kelishi — qo'shimcha ishonch
                title_t = set(tokenize(h.doc_title))
                bonus += 0.25 * len(title_t & set(q)) / max(len(q), 1)
                for phrase in _bigrams(nq):
                    if phrase in normalize(h.text):
                        bonus += 0.15
                # Savolda oy tilga olingan bo'lsa — shu oydagi hujjatlar ustun
                h.score *= bonus
                if months and h.doc_date:
                    h.score *= 2.0 if int(h.doc_date[5:7]) in months else 0.6
        scored.sort(key=lambda h: -h.score)
        hits = _dedupe_docs(scored, k) if rerank else scored[:k]
        passed, reason = True, "Javob sifati nazorati o'chirilgan"
        if gate:
            passed, reason = quality_gate(hits)
        return RetrievalResult(hits, q0, filtered, passed, reason,
                               {"rerank": rerank, "gate": gate, "k": k})


# Sinonimlar: o'zbekcha atama ↔ hujjatlardagi qisqartma/inglizcha atama
SYNONYMS = [({"kpi"}, {"faoliyat", "ko'rsatkich"}), ({"evidence"}, {"dalil"}), ({"pending"}, {"kutilmoqda"}),
            ({"health"}, {"sog'lom"}), ({"reconciliation"}, {"solishtir"})]


def _expand(q):
    qs = set(q)
    extra = []
    for a, b in SYNONYMS:
        if a & qs:
            extra += [w for w in b if w not in qs]
        if b <= qs:
            extra += [w for w in a if w not in qs]
    return q + extra


def _group(t):
    g = {t}
    for a, b in SYNONYMS:
        if t in a:
            g |= b
        if t in b:
            g |= a
    return g


def _month_word(d):
    if not d or len(d) < 7:
        return ""
    m = int(d[5:7])
    return next(k for k, v in MONTHS.items() if v == m)


def _bigrams(nq: str):
    w = [x for x in nq.replace("?", " ").replace(",", " ").split() if len(x) > 2]
    return [f"{a} {b}" for a, b in zip(w, w[1:])]


def _dedupe_docs(hits, k, per_doc=2):
    out, per = [], Counter()
    for h in hits:
        if per[h.doc_id] < per_doc:
            out.append(h)
            per[h.doc_id] += 1
        if len(out) >= k:
            break
    return out


def quality_gate(hits) -> tuple[bool, str]:
    if not hits:
        return False, "Hech qanday mos manba topilmadi"
    top = hits[0]
    if top.score < config.GATE_MIN_SCORE:
        return False, f"Eng yaxshi manba ishonch bali past ({top.score:.2f} < {config.GATE_MIN_SCORE})"
    if top.coverage < config.GATE_MIN_COVERAGE:
        return False, (f"Savoldagi kalit tushunchalarning faqat {top.coverage:.0%} qismi manbada bor "
                       f"(talab {config.GATE_MIN_COVERAGE:.0%})")
    return True, "Manba ishonchliligi va qamrovi yetarli"
