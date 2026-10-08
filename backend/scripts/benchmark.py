#!/usr/bin/env python3
"""Prepare and run the brute-force vs indexed matching comparison on the isolated local PostgreSQL.

  scripts/benchmark.py prepare            start isolated cluster (unix socket only), migrate, load synthetic fixture
  scripts/benchmark.py dry-run --max-api-calls N     planned comparisons + retrieval recall. NO provider call.
  scripts/benchmark.py run --live-decisions --max-api-calls N [--rate-per-m 0.10] [--api-key-env OPENAI_API_KEY]
  scripts/benchmark.py stop
Live mode is paid and only runs with --live-decisions AND planned calls <= --max-api-calls.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

from app.matching import benchmark, db, decisions  # noqa: E402
from app.matching.pgcluster import Cluster  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["prepare", "dry-run", "run", "stop"])
    ap.add_argument("--max-api-calls", type=int)
    ap.add_argument("--live-decisions", action="store_true")
    ap.add_argument("--rate-per-m", type=float, default=decisions.DEFAULT_RATE_PER_M_INPUT)
    ap.add_argument("--api-key-env", default="OPENAI_API_KEY")
    ap.add_argument("--dotenv", help="optional env file to load the key from (never printed)")
    ap.add_argument("--corpus", default=benchmark.FIXTURE_CORPUS)
    a = ap.parse_args(argv)
    cl = Cluster()
    if a.cmd == "stop":
        cl.stop()
        print("stopped")
        return 0
    if a.dotenv:
        load_dotenv(a.dotenv)
    cl.start()
    with db.connect(cl.dsn()) as conn:
        applied = db.migrate(conn)
        if a.cmd == "prepare":
            print(json.dumps({"migrations_applied": applied, "fixture": benchmark.load_fixture(conn),
                              "socket_dir": str(cl.sock), "port": cl.port, "tcp_listener": False}, indent=2, default=str))
            return 0
        if a.max_api_calls is None:
            print("--max-api-calls is required", file=sys.stderr)
            return 2
        now = benchmark.default_now()
        try:
            if a.cmd == "dry-run":
                out = benchmark.dry_run(conn, a.corpus, now, a.max_api_calls)
            else:
                if not a.live_decisions:
                    print("refusing: 'run' makes paid calls and needs --live-decisions", file=sys.stderr)
                    return 2
                out = benchmark.live_run(conn, a.corpus, now, a.max_api_calls, a.rate_per_m,
                                         api_key_env=a.api_key_env, confirm_live=True)
        except benchmark.BenchmarkError as e:
            print(json.dumps({"error": e.code, "message": e.message}), file=sys.stderr)
            return 3
        print(json.dumps(out, indent=2, default=str, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
