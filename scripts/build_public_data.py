#!/usr/bin/env python3
"""Regenerate the public portfolio JSON from the canonical researchmap JSONL."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from editor.researchmap_editor import DEFAULT_DATA_FILE, PUBLIC_DATA_FILE, load_documents, write_public_data


write_public_data(load_documents(DEFAULT_DATA_FILE))
print(f"wrote {PUBLIC_DATA_FILE}")
