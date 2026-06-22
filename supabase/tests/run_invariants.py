#!/usr/bin/env python3
"""Run the rollback-safe DB invariant suites against the project DB and grade them.

Each suite .sql file is split into independent test blocks on a marker line containing
"@@TEST <name>"; each block ends by RAISE-ing 'SUITE_PASS <name> ...' or
'SUITE_FAIL <name> ...' and therefore ALWAYS rolls back (no data is mutated). We POST
each block to the Supabase Management API query endpoint and assert the response carries
SUITE_PASS. Any SUITE_FAIL or unexpected error fails the run (exit 1).

Usage:  SUPABASE_ACCESS_TOKEN=... python run_invariants.py file1.sql [file2.sql ...]
Env:    SUPABASE_ACCESS_TOKEN (required), SUPABASE_PROJECT_REF (default rvlkimzqzwizcivkxtnd)
"""
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT = os.environ.get("SUPABASE_PROJECT_REF", "rvlkimzqzwizcivkxtnd")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
MARKER = "@@TEST"


def run_block(sql: str) -> str:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        URL, data=body, method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            # The Management API sits behind Cloudflare, which 1010-bans urllib's default
            # UA. Use a curl-like UA (curl is allowed) so local + CI runs both work.
            "User-Agent": "curl/8.4.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.read().decode("utf-8")
    except Exception as e:  # network etc. -> treat as failure
        return f"RUNNER_ERROR {e}"


def main() -> int:
    # Suite output can contain Georgian (RPC error text); don't let a Windows cp1252
    # console crash the runner.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if not TOKEN:
        print("ERROR: SUPABASE_ACCESS_TOKEN not set")
        return 2
    files = sys.argv[1:]
    if not files:
        print("usage: run_invariants.py <suite.sql> ...")
        return 2

    total = fails = 0
    for path in files:
        src = open(path, encoding="utf-8").read()
        # Everything before the first marker is the file header — skip it.
        chunks = src.split(MARKER)[1:]
        if not chunks:
            print(f"  (no {MARKER} blocks in {path})")
            continue
        print(f"\n{path}")
        for chunk in chunks:
            name = chunk.splitlines()[0].strip() or "<unnamed>"
            sql = "-- " + MARKER + chunk  # re-attach the marker as a comment (Postgres ignores)
            total += 1
            resp = run_block(sql)
            if "SUITE_PASS" in resp:
                print(f"  PASS  {name}")
            else:
                fails += 1
                reason = resp.replace("\\n", " ")[:400]
                print(f"  FAIL  {name}\n        {reason}")

    print(f"\n{total - fails}/{total} invariants passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
