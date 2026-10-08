import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DOCS_DIR = DATA_DIR / "docs"
DB_PATH = Path(os.environ.get("KA_DB", DATA_DIR / "kafedra.db"))
WEB_DIR = ROOT / "web"
EVAL_DIR = ROOT / "eval"

HOST = os.environ.get("KA_HOST", "127.0.0.1")
PORT = int(os.environ.get("KA_PORT") or os.environ.get("PORT") or "8000")

# Demo reproducible bo'lishi uchun "bugungi sana" qotirilgan.
# Haqiqiy sanadan foydalanish uchun: KA_TODAY=real
_TODAY = os.environ.get("KA_TODAY", "2026-10-06")


def today() -> date:
    if _TODAY == "real":
        return date.today()
    return date.fromisoformat(_TODAY)


# LLM ixtiyoriy: kalit bo'lmasa tizim to'liq lokal (extractive) rejimda ishlaydi.
LLM_ENABLED = os.environ.get("KA_LLM", "0") == "1"
LLM_MODEL = os.environ.get("KA_LLM_MODEL", "claude-opus-5-5")

# Quality Gate parametrlari
GATE_MIN_SCORE = float(os.environ.get("KA_GATE_MIN_SCORE", "3.0"))
GATE_MIN_COVERAGE = float(os.environ.get("KA_GATE_MIN_COVERAGE", "0.5"))
TOP_K = 5
