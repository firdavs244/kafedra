#!/usr/bin/env python3
"""KafedraAgent MVP ni ishga tushirish.

  python run.py            # serverni ishga tushirish (http://127.0.0.1:8000)
  python run.py --reset    # namuna bazani qaytadan yaratish (data/manba dan qayta import)
  python run.py --eval     # faqat sun'iy intellekt baholash to'plamini ishga tushirish
"""
import argparse

from kafedra_agent import config

p = argparse.ArgumentParser(description="KafedraAgent MVP")
p.add_argument("--reset", action="store_true", help="bazani data/manba dan qayta yaratish")
p.add_argument("--eval", action="store_true", help="baholash to'plamini ishga tushirish va chiqish")
p.add_argument("--host", default=config.HOST)
p.add_argument("--port", type=int, default=config.PORT)
a = p.parse_args()

if a.eval:
    from kafedra_agent.evaluation import run
    r = run()
    print(r["dataset"], "·", r["questions"], "ta savol ·", r["tested_at"])
    for c in r["configs"]:
        m = c["metrics"]
        print(f"[{c['name']}] {c['label']}\n    aniqlik {m['answer_accuracy']}% · hujjat topildi {m['retrieval_recall_at_5']}% · "
              f"manba to'g'ri {m['citation_correctness']}% · ruxsat {m['permission_compliance']} · "
              f"vazifa {m['task_extraction_accuracy']} · rad etish {m['abstention_accuracy']}")
else:
    from kafedra_agent.server import serve
    serve(a.host, a.port, reset=a.reset)
