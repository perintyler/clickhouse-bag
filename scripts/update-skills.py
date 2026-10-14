#!/usr/bin/env python3
"""Refresh vendored skills at the revisions in skills/upstream.json."""
from pathlib import Path
import json, shutil, subprocess, tempfile
base = Path(__file__).resolve().parents[1]
for source in json.loads((base / "skills/upstream.json").read_text()):
    with tempfile.TemporaryDirectory(prefix="barry-upstream-skills-") as tmp:
        checkout = Path(tmp) / "checkout"
        subprocess.run(["git", "clone", "--no-checkout", source["repository"], str(checkout)], check=True)
        subprocess.run(["git", "-C", str(checkout), "checkout", "--detach", source["revision"]], check=True)
        for name, relative in source["skills"].items():
            original = checkout / relative
            if not (original / "SKILL.md").is_file():
                raise RuntimeError(f"Missing SKILL.md: {original}")
            staged = Path(tmp) / name
            shutil.copytree(original, staged, ignore=shutil.ignore_patterns(".git", ".github", "node_modules"))
            for license in ["LICENSE", "LICENSE.md", "NOTICE"]:
                if (checkout / license).is_file() and not (staged / license).exists():
                    shutil.copy2(checkout / license, staged / license)
            destination = base / "skills" / name
            if destination.exists():
                shutil.rmtree(destination)
            shutil.move(str(staged), destination)
