import sqlite3
import threading
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS teachers(
  id TEXT PRIMARY KEY, full_name TEXT, short_name TEXT, position TEXT, degree TEXT,
  load_hours INTEGER, max_load INTEGER);
CREATE TABLE IF NOT EXISTS users(
  username TEXT PRIMARY KEY, password TEXT, full_name TEXT, role TEXT, teacher_id TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS kpi_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT, category TEXT, name TEXT, max_score REAL);
CREATE TABLE IF NOT EXISTS evidence(
  id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT, category TEXT, type TEXT, title TEXT,
  subtype TEXT, score REAL, status TEXT, doi TEXT, has_pdf INTEGER, file TEXT, doc_ref TEXT,
  source TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, title TEXT, type TEXT, date TEXT, access TEXT, owner TEXT,
  source TEXT, body TEXT, added_by TEXT, added_at TEXT, file TEXT, demo INTEGER DEFAULT 0,
  checksum TEXT);
CREATE TABLE IF NOT EXISTS doc_claims(
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, indicator TEXT, value REAL, quote TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS chunks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, idx INTEGER, text TEXT);
CREATE TABLE IF NOT EXISTS science_plans(
  teacher_id TEXT PRIMARY KEY, planned INTEGER, done INTEGER, deadline TEXT, last_progress TEXT,
  doc_ref TEXT);
CREATE TABLE IF NOT EXISTS reported_stats(
  indicator TEXT PRIMARY KEY, label TEXT, reported INTEGER, evidence_type TEXT, doc_ref TEXT);
CREATE TABLE IF NOT EXISTS kafedra_stats(
  key TEXT PRIMARY KEY, label TEXT, value REAL, unit TEXT, doc_ref TEXT);
CREATE TABLE IF NOT EXISTS data_sources(
  name TEXT PRIMARY KEY, kind TEXT, last_sync TEXT, records INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, assignee TEXT,
  responsible TEXT, start_date TEXT, deadline TEXT, control_date TEXT, status TEXT,
  progress INTEGER DEFAULT 0, priority TEXT DEFAULT 'o''rta', source TEXT, evidence_refs TEXT,
  created_by TEXT, created_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, status TEXT, created_by TEXT,
  created_at TEXT, approved_by TEXT, approved_at TEXT, sources TEXT);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, username TEXT, role TEXT, action TEXT,
  details TEXT, section TEXT, old_value TEXT, new_value TEXT);
CREATE TABLE IF NOT EXISTS ai_traces(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, username TEXT, question TEXT, intent TEXT,
  status TEXT, answer TEXT, trace TEXT, sources TEXT, ms REAL);
CREATE TABLE IF NOT EXISTS time_trials(
  id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT, traditional_sec REAL, agent_sec REAL,
  tester TEXT, ts TEXT);
"""

_lock = threading.RLock()


class DB:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def q(self, sql, args=()):
        with _lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def x(self, sql, args=()):
        with _lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur.lastrowid

    def many(self, sql, rows):
        with _lock:
            self.conn.executemany(sql, rows)
            self.conn.commit()


def open_db(path=None, reset=False) -> DB:
    path = Path(path or config.DB_PATH)
    if reset and path.exists() and str(path) != ":memory:":
        path.unlink()
    fresh = str(path) == ":memory:" or not path.exists()
    db = DB(path)
    if fresh or db.one("SELECT COUNT(*) c FROM teachers")["c"] == 0:
        from .seed import seed
        seed(db)
    return db
