"""Ruxsat asosida kirish va harakatlar tarixi."""
import secrets
from datetime import datetime

from .db import DB
from .seed import _pw

ROLE_LABELS = {"mudir": "Kafedra mudiri", "dekan": "Dekan", "admin": "Tizim administratori",
               "oqituvchi": "O'qituvchi"}

# Rol → ruxsatlar
PERMISSIONS = {
    "mudir": {"view_all", "approve_evidence", "create_task", "approve_report", "view_audit",
              "view_confidential", "upload_doc", "run_eval"},
    "dekan": {"view_all", "view_audit"},
    "admin": {"view_all", "view_audit", "upload_doc", "run_eval"},
    "oqituvchi": {"upload_evidence"},
}


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def login(db: DB, username: str, password: str):
    u = db.one("SELECT * FROM users WHERE username=?", (username,))
    if not u or u["password"] != _pw(password):
        audit(db, {"username": username or "?", "role": "-"}, "login_failed", "")
        return None
    token = secrets.token_hex(16)
    db.x("INSERT INTO sessions VALUES(?,?,?)", (token, username, now()))
    audit(db, u, "login", "")
    return token


def user_by_token(db: DB, token: str):
    if not token:
        return None
    s = db.one("SELECT username FROM sessions WHERE token=?", (token,))
    return get_user(db, s["username"]) if s else None


def get_user(db: DB, username: str):
    u = db.one("SELECT username, full_name, role, teacher_id FROM users WHERE username=?",
               (username,))
    if u:
        u["role_label"] = ROLE_LABELS.get(u["role"], u["role"])
        u["permissions"] = sorted(PERMISSIONS.get(u["role"], set()))
    return u


def can(user, perm: str) -> bool:
    return perm in PERMISSIONS.get(user["role"], set())


def can_view_teacher(user, teacher_id: str) -> bool:
    return can(user, "view_all") or user.get("teacher_id") == teacher_id


def can_view_doc(user, doc: dict) -> bool:
    if doc["access"] == "public":
        return True
    if doc["access"] == "owner":
        return user.get("teacher_id") == doc.get("owner") or can(user, "view_confidential")
    if doc["access"] == "mudir":
        return can(user, "view_confidential")
    return False


ACTION_LABELS = {
    "login": "Tizimga kirdi", "login_failed": "Kirish rad etildi", "ai_query": "Sun'iy intellektga savol berdi",
    "permission_denied": "Ruxsat rad etildi", "task_create": "Vazifa yaratdi", "task_status": "Vazifa holatini o'zgartirdi",
    "report_draft": "Hisobot loyihasini yaratdi", "report_approve": "Hisobotni tasdiqladi", "evidence_review": "Dalilni ko'rib chiqdi",
    "evidence_upload": "Dalil yukladi", "document_add": "Hujjat yukladi", "document_view": "Hujjatni ko'rdi",
    "file_view": "Dalil faylini ochdi", "teacher360_view": "O'qituvchi profilini ko'rdi", "eval_run": "Baholashni ishga tushirdi",
    "time_trial_add": "Vaqt o'lchovini kiritdi", "page_view": "Bo'limga kirdi",
}


def audit(db: DB, user, action: str, details: str, section="", old=None, new=None):
    db.x("""INSERT INTO audit_log(ts, username, role, action, details, section, old_value, new_value)
            VALUES(?,?,?,?,?,?,?,?)""",
         (now(), user.get("username"), user.get("role"), action, details[:500], section,
          None if old is None else str(old)[:200], None if new is None else str(new)[:200]))
