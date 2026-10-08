"""Isolated, user-owned PostgreSQL cluster: unix socket only (no TCP listener), private directory."""
import os
import subprocess
from pathlib import Path

import psycopg
import psycopg.sql

PG_BIN = Path(os.getenv("PG_BIN", "/usr/lib/postgresql/16/bin"))
BACKEND = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = BACKEND / "private-data" / "postgres"
DEFAULT_PORT = 55439
DEFAULT_DB = "matching"


class Cluster:
    def __init__(self, root: Path = DEFAULT_ROOT, port: int = DEFAULT_PORT, dbname: str = DEFAULT_DB):
        self.root, self.port, self.dbname = Path(root), port, dbname
        self.data, self.sock = self.root / "data", self.root / "sock"

    def _run(self, *args: str, **kw):
        return subprocess.run([str(a) for a in args], check=True, capture_output=True, text=True, **kw)

    def dsn(self, dbname: str | None = None) -> str:
        return f"host={self.sock} port={self.port} dbname={dbname or self.dbname}"

    def init(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.sock.mkdir(exist_ok=True)
        os.chmod(self.root, 0o700)
        os.chmod(self.sock, 0o700)
        if not (self.data / "PG_VERSION").exists():
            self._run(PG_BIN / "initdb", "-D", self.data, "-E", "UTF8", "--locale=C.utf8",
                      "--auth-local=peer", "--no-instructions")

    def running(self) -> bool:
        r = subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(self.data), "status"], capture_output=True)
        return r.returncode == 0

    def start(self) -> None:
        self.init()
        if not self.running():
            opts = f"-c listen_addresses='' -c unix_socket_directories={self.sock} -p {self.port}"
            self._run(PG_BIN / "pg_ctl", "-D", self.data, "-o", opts, "-l", self.root / "server.log", "-w", "start")
        with psycopg.connect(self.dsn("postgres"), autocommit=True) as c:
            if not c.execute("SELECT 1 FROM pg_database WHERE datname=%s", (self.dbname,)).fetchone():
                c.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(self.dbname)))

    def stop(self) -> None:
        if (self.data / "PG_VERSION").exists() and self.running():
            self._run(PG_BIN / "pg_ctl", "-D", self.data, "-m", "fast", "-w", "stop")
