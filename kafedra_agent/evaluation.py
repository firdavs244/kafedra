"""Sun'iy intellekt baholash markazi: sinov to'plamini ishga tushirish, ko'rsatkichlar va solishtirish.

Barcha raqamlar haqiqiy sinov natijasidan hisoblanadi — hech narsa qo'lda yozilmaydi.
"""
import json
import re
import statistics
import time
from datetime import datetime

from . import config
from .agent import Agent
from .auth import get_user
from .db import DB, open_db
from .text import normalize, tokenize

CONFIGS = [
    {"name": "A", "label": "Oddiy yondashuv: faqat kalit so'z bo'yicha qidiruv (bilimlar bazasi qatlami va sifat nazoratisiz)",
     "rerank": False, "gate": False, "k": 1, "structured": False},
    {"name": "B", "label": "KafedraAgent + bilimlar bazasi",
     "rerank": False, "gate": False, "k": 5, "structured": True},
    {"name": "C", "label": "KafedraAgent + bilimlar bazasi + manbani tekshirish + javob sifatini nazorat qilish",
     "rerank": True, "gate": True, "k": 5, "structured": True},
]

K = 5


def load_benchmark(path=None):
    path = path or config.EVAL_DIR / "baholash_toplami_v2.json"
    return json.loads(open(path, encoding="utf-8").read())


def _contains(ans, kw):
    return normalize(kw) in normalize(ans)


def _is_doc(d):
    return bool(re.fullmatch(r"[ADHSY]\d+", d))


def grade(item, res, db) -> dict:
    e = item["expect"]
    ans = res["answer"]
    st = res["status"]
    exp_st = e["status"]
    if exp_st == "ok_or_abstain":
        status_ok = st in ("ok", "abstain")
    else:
        status_ok = st == exp_st
    kw_ok = all(_contains(ans, k) for k in e["keywords"])
    leak = [f for f in e.get("forbidden", []) if _contains(ans, f)]
    task_ok = None
    if e.get("task"):
        t = res.get("task") or {}
        task_ok = bool(t) and t.get("assignee") == e["task"]["assignee"] \
            and t.get("deadline") == e["task"]["deadline"] and len(t.get("title", "")) > 3
    correct = status_ok and kw_ok and not leak and (task_ok is not False)
    # Retrieval / citation
    exp_docs = set(e.get("docs") or [])
    retrieved = res.get("retrieved_all") or res.get("retrieved") or []
    retrieved_docs = [d for d in retrieved if _is_doc(d)]
    recall = None
    if exp_docs:
        recall = 1.0 if exp_docs & set(retrieved_docs[:K]) else 0.0
    cited = [s["doc_id"] for s in res["sources"] if _is_doc(s["doc_id"])]
    citation = None
    if exp_docs and st == "ok":
        citation = (sum(1 for c in cited if c in exp_docs) / len(cited)) if cited else 0.0
    # Groundedness (RAG javoblari uchun): javob gaplari manba matnida mavjudmi
    grounded = None
    if res["intent"] == "rag" and st == "ok":
        src_text = " ".join(r["text"] for d in set(cited)
                            for r in db.q("SELECT text FROM chunks WHERE doc_id=?", (d,)))
        src_toks = set(tokenize(src_text))
        sents = [s for s in ans.replace("]", "].").split(".") if len(tokenize(s)) >= 2]
        sents = [s for s in sents if "[" not in s or len(tokenize(s.split("[")[0])) >= 2]
        ok = 0
        for s in sents:
            toks = tokenize(s.split("[")[0])
            if toks and sum(1 for t in toks if t in src_toks) / len(toks) >= 0.8:
                ok += 1
        grounded = ok / len(sents) if sents else 0.0
    return {"id": item["id"], "type": item["type"], "user": item["user"], "question": item["question"],
            "status": st, "expected_status": exp_st, "correct": correct, "status_ok": status_ok,
            "keywords_ok": kw_ok, "leak": leak, "task_ok": task_ok, "recall": recall,
            "citation": citation, "grounded": grounded, "ms": res["ms"],
            "answer": ans[:400], "cited": cited, "retrieved": retrieved_docs[:K]}


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(100 * sum(xs) / len(xs), 1) if xs else None


def metrics(rows) -> dict:
    perm = [r for r in rows if r["type"] == "permission"]
    tasks = [r for r in rows if r["task_ok"] is not None]
    noans = [r for r in rows if r["type"] == "no_answer"]
    answerable = [r for r in rows if r["expected_status"] == "ok"]
    ms = sorted(r["ms"] for r in rows)
    by_type = {}
    for r in rows:
        by_type.setdefault(r["type"], []).append(r["correct"])
    return {
        "total": len(rows),
        "correct": sum(r["correct"] for r in rows),
        "incorrect": sum(not r["correct"] for r in rows),
        "answer_accuracy": _mean([r["correct"] for r in rows]),
        "retrieval_recall_at_5": _mean([r["recall"] for r in rows]),
        "retrieval_misses": sum(1 for r in rows if r["recall"] == 0.0),
        "citation_correctness": _mean([r["citation"] for r in rows]),
        "citation_errors": sum(1 for r in rows if r["citation"] is not None and r["citation"] < 1),
        "groundedness_rag": _mean([r["grounded"] for r in rows]),
        "permission_compliance": f"{sum(r['correct'] for r in perm)}/{len(perm)}",
        "permission_violations": sum(1 for r in rows if r["leak"]) + sum(1 for r in perm if not r["status_ok"]),
        "task_extraction_accuracy": f"{sum(bool(r['task_ok']) for r in tasks)}/{len(tasks)}",
        "abstention_accuracy": f"{sum(r['correct'] for r in noans)}/{len(noans)}",
        "false_abstain": sum(1 for r in answerable if r["status"] == "abstain"),
        "avg_response_ms": round(statistics.mean(ms), 1) if ms else None,
        "p95_response_ms": ms[int(0.95 * (len(ms) - 1))] if ms else None,
        "accuracy_by_type": {k: _mean(v) for k, v in by_type.items()},
    }


def run(path=None, configs=CONFIGS, save=True) -> dict:
    bench = load_benchmark(path)
    out = {"dataset": f"Baholash to'plami {bench['version']}", "questions": len(bench["items"]),
           "tested_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
           "demo_today": str(config.today()), "llm": "lokal (manbadan iqtibos)", "configs": []}
    from . import llm
    if llm.available():
        out["llm"] = config.LLM_MODEL
    base = open_db(":memory:")
    for cfg in configs:
        rows = []
        for item in bench["items"]:
            db = DB(":memory:")               # har savol toza holatda (izolyatsiya)
            base.conn.backup(db.conn)
            agent = Agent(db)
            user = get_user(db, item["user"])
            res = agent.ask(user, item["question"], cfg=cfg, log=False)
            rows.append(grade(item, res, db))
        out["configs"].append({"name": cfg["name"], "label": cfg["label"], "metrics": metrics(rows),
                               "failures": [r for r in rows if not r["correct"]],
                               "rows": rows if cfg["name"] == "C" else None})
    if save:
        p = config.EVAL_DIR / "results" / "latest.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def latest():
    p = config.EVAL_DIR / "results" / "latest.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


if __name__ == "__main__":
    t = time.time()
    r = run()
    for c in r["configs"]:
        m = c["metrics"]
        print(f"\n[{c['name']}] {c['label']}")
        for k, v in m.items():
            print(f"  {k}: {v}")
    print(f"\n{time.time() - t:.1f}s")
