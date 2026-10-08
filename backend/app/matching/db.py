import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .pgcluster import Cluster

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


def dsn() -> str:
    configured = os.getenv("MATCHING_DATABASE_URL") or os.getenv("DATABASE_URL")
    if configured:
        return configured
    if os.getenv("RAILWAY_ENVIRONMENT_ID") or os.getenv("APP_REQUIRE_AUTH") == "true":
        raise RuntimeError("A managed database URL is required in deployment")
    return Cluster().dsn()


def connect(conninfo: str | None = None) -> psycopg.Connection:
    return psycopg.connect(conninfo or dsn(), row_factory=dict_row, autocommit=True)


def get_db():
    """FastAPI dependency (overridden in tests)."""
    try:
        conn = connect()
    except psycopg.OperationalError:
        from fastapi import HTTPException
        raise HTTPException(503, {"error": {"code": "database_unavailable",
                                            "message": "Local matching database is not running."}})
    try:
        yield conn
    finally:
        conn.close()


def migrate(conn: psycopg.Connection) -> list[str]:
    """Apply pending SQL files in order under an advisory lock. Returns applied names."""
    applied: list[str] = []
    conn.execute("SELECT pg_advisory_lock(55439001)")
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations "
                     "(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
        done = {r["name"] for r in conn.execute("SELECT name FROM schema_migrations")}
        for f in sorted(MIGRATIONS.glob("*.sql")):
            if f.name in done:
                continue
            with conn.transaction():
                conn.execute(f.read_text())
                conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (f.name,))
            applied.append(f.name)
    finally:
        conn.execute("SELECT pg_advisory_unlock(55439001)")
    return applied
