#!/usr/bin/env python3
"""Build public website data from the single researchmap export in researchmap-json."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "researchmap-json"
PUBLIC_DATA_FILE = ROOT / "data" / "public" / "researchmap.json"


def find_source(directory: Path = SOURCE_DIR) -> Path:
    files = sorted(path for path in directory.iterdir()
                   if path.is_file() and path.suffix.lower() in {".json", ".jsonl"})
    if len(files) != 1:
        raise ValueError(f"{directory}: JSON / JSONLファイルを1つ置いてください（現在{len(files)}個）。")
    return files[0]


def load_documents(path: Path) -> list[dict[str, Any]]:
    content = path.read_text(encoding="utf-8-sig")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        # researchmap exports can contain one JSON object per line.
        parsed = []
        for number, line in enumerate(content.splitlines(), 1):
            if not line.strip():
                continue
            try:
                parsed.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path.name}: {number}行目のJSONが不正です: {exc.msg}") from exc
    documents = parsed if isinstance(parsed, list) else [parsed]
    if not documents:
        raise ValueError(f"{path.name}: レコードがありません。")
    for number, document in enumerate(documents, 1):
        if (not isinstance(document, dict)
                or not isinstance(document.get("insert"), dict)
                or not isinstance(document.get("merge"), dict)
                or not isinstance(document["insert"].get("type"), str)):
            raise ValueError(f"{path.name}: レコード{number}には insert.type と merge が必要です。")
    return documents


def public_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for document in documents:
        insert = document["insert"]
        merge = document["merge"]
        record_type = insert["type"]
        if record_type == "researchers":
            allowed = {
                "permalink", "family_name", "given_name", "alternate_names",
                "affiliations", "degrees", "see_also", "identifiers",
            }
            public_merge = {key: value for key, value in merge.items() if key in allowed}
            public_merge["affiliations"] = [
                item for item in public_merge.get("affiliations", [])
                if item.get("display_affiliation", "disclosed") == "disclosed"
            ]
            public_merge["degrees"] = [
                item for item in public_merge.get("degrees", [])
                if item.get("display_degree", "disclosed") == "disclosed"
            ]
        elif merge.get("display", "disclosed") == "disclosed":
            public_merge = merge
        else:
            continue
        result.append({"type": record_type, "merge": public_merge})
    return result


def write_public_data(documents: list[dict[str, Any]], path: Path = PUBLIC_DATA_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(public_documents(documents), ensure_ascii=False, separators=(",", ":")) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.replace(temporary, path)



def main() -> None:
    source = find_source()
    write_public_data(load_documents(source))
    print(f"built {PUBLIC_DATA_FILE.relative_to(ROOT)} from {source.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
