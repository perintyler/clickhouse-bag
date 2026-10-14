#!/usr/bin/env bash
# Skills ship in this checkout. Refresh only when explicitly requested.
set -euo pipefail
BAG_DIR="$(cd "$(dirname "$0")" && pwd)"
case "${1:---status}" in
  --update) python3 "$BAG_DIR/scripts/update-skills.py" ;;
  --status) ;;
  *) printf 'Usage: ./setup.sh [--status|--update]\n' >&2; exit 2 ;;
esac
python3 - "$BAG_DIR" <<'PY_STATUS'
from pathlib import Path
import json, sys
base = Path(sys.argv[1])
for source in json.loads((base / "skills/upstream.json").read_text()):
    for name in source["skills"]:
        skill = base / "skills" / name / "SKILL.md"
        if not skill.is_file():
            raise SystemExit(f"Missing skill: {skill}")
        print(f"{name}: vendored ({source['revision'][:12]})")
PY_STATUS
