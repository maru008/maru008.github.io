#!/usr/bin/env python3
"""Local editor for a researchmap JSONL export.

The server uses only Python's standard library, binds to localhost, preserves
unknown researchmap fields, and writes the JSONL atomically after taking a
timestamped backup.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(__file__).resolve().parent / "static"
DEFAULT_DATA_FILE = ROOT / "data" / "researchmap_source" / "rm_researchers20260828.jsonl"
BACKUP_DIR = ROOT / "data" / "researchmap_source" / "backups"
PUBLIC_DATA_FILE = ROOT / "data" / "public" / "researchmap.json"
DATE_RE = re.compile(r"^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$")
DISPLAY_VALUES = {"disclosed", "closed", "researchers_only"}
NEW_TYPES = {"published_papers", "presentations"}
KNOWN_TYPES = {
    "researchers", "research_experience", "education", "research_areas",
    "research_interests", "association_memberships", "committee_memberships",
    "published_papers", "presentations", "awards", "works",
    "academic_contribution",
}


class EditorError(Exception):
    pass


class ConflictError(EditorError):
    pass


def load_documents(path: Path) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            document = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EditorError(f"JSONLの{line_number}行目が不正です: {exc.msg}") from exc
        validate_document(document, allow_new=True)
        documents.append(document)
    if not documents:
        raise EditorError("JSONLにレコードがありません。")
    return documents


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def localized(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for language in ("ja", "en", "ja-Kana"):
            text = value.get(language)
            if isinstance(text, str) and text.strip():
                return text.strip()
    return ""


def contributor_names(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    for language in ("ja", "en"):
        contributors = value.get(language)
        if isinstance(contributors, list):
            return ", ".join(
                str(item.get("name", "")).strip()
                for item in contributors
                if isinstance(item, dict) and item.get("name")
            )
    return ""


def summary(document: dict[str, Any], index: int) -> dict[str, Any]:
    insert = document["insert"]
    merge = document["merge"]
    record_type = insert["type"]
    title_fields = {
        "published_papers": "paper_title",
        "presentations": "presentation_title",
        "awards": "award_name",
        "works": "work_title",
        "academic_contribution": "academic_contribution_title",
        "research_interests": "keyword",
        "research_areas": "research_field",
        "committee_memberships": "committee_name",
        "association_memberships": "academic_society_name",
        "education": "affiliation",
        "research_experience": "affiliation",
        "researchers": "family_name",
    }
    title = localized(merge.get(title_fields.get(record_type, "")))
    if record_type == "researchers":
        title = " ".join(filter(None, [title, localized(merge.get("given_name"))]))
    contributor_field = "authors" if record_type == "published_papers" else "presenters"
    date = (
        merge.get("publication_date")
        or merge.get("award_date")
        or merge.get("from_date")
        or merge.get("from_event_date")
        or ""
    )
    return {
        "index": index,
        "id": insert.get("id"),
        "type": record_type,
        "title": title or "（タイトルなし）",
        "contributors": contributor_names(merge.get(contributor_field)),
        "date": date,
        "display": merge.get("display", "disclosed"),
    }


def _validate_localized(value: Any, name: str, required: bool = False) -> None:
    if value is None and not required:
        return
    if not isinstance(value, dict):
        raise EditorError(f"{name} は言語別オブジェクトで入力してください。")
    present = False
    for language, text in value.items():
        if language not in {"ja", "en", "ja-Kana"}:
            raise EditorError(f"{name} の言語 {language} は未対応です。")
        if not isinstance(text, str):
            raise EditorError(f"{name}.{language} は文字列で入力してください。")
        if text.strip():
            present = True
    if required and not present:
        raise EditorError(f"{name} は日本語または英語が必須です。")


def _validate_contributors(value: Any, name: str) -> None:
    if not isinstance(value, dict) or not value:
        raise EditorError(f"{name} は必須です。")
    found = False
    for language, items in value.items():
        if language not in {"ja", "en"} or not isinstance(items, list):
            raise EditorError(f"{name} の形式が不正です。")
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
                raise EditorError(f"{name} の氏名が不正です。")
            found = True
    if not found:
        raise EditorError(f"{name} は1名以上必要です。")


def validate_document(document: Any, allow_new: bool) -> None:
    if not isinstance(document, dict) or set(document) != {"insert", "merge"}:
        raise EditorError("レコードには insert と merge が必要です。")
    insert = document["insert"]
    merge = document["merge"]
    if not isinstance(insert, dict) or not isinstance(merge, dict):
        raise EditorError("insert と merge はオブジェクトで入力してください。")
    record_type = insert.get("type")
    if record_type not in KNOWN_TYPES:
        raise EditorError(f"未対応の業績種別です: {record_type}")
    if not allow_new and not insert.get("id"):
        raise EditorError("既存レコードのIDがありません。")
    display = merge.get("display", "disclosed")
    if display not in DISPLAY_VALUES:
        raise EditorError("公開設定が不正です。")
    for name in ("major_achievement", "referee", "invited", "is_international_collaboration"):
        if name in merge and merge[name] is not None and not isinstance(merge[name], bool):
            raise EditorError(f"{name} は true / false / 未設定のいずれかです。")
    for name in ("publication_date", "award_date", "from_date", "to_date", "from_event_date", "to_event_date"):
        value = merge.get(name)
        if value in (None, "", "9999"):
            continue
        if not isinstance(value, str) or not DATE_RE.fullmatch(value):
            raise EditorError(f"{name} は YYYY、YYYY-MM、YYYY-MM-DD の形式で入力してください。")
    if record_type == "published_papers":
        _validate_localized(merge.get("paper_title"), "paper_title", required=True)
        _validate_contributors(merge.get("authors"), "authors")
        _validate_localized(merge.get("publication_name"), "publication_name")
        if not merge.get("publication_date"):
            raise EditorError("publication_date は必須です。")
    elif record_type == "presentations":
        _validate_localized(merge.get("presentation_title"), "presentation_title", required=True)
        _validate_contributors(merge.get("presenters"), "presenters")
        _validate_localized(merge.get("event"), "event")
        if not merge.get("publication_date"):
            raise EditorError("publication_date は必須です。")


def write_documents(path: Path, documents: list[dict[str, Any]], expected_hash: str) -> str:
    if file_hash(path) != expected_hash:
        raise ConflictError("読み込み後にJSONLが変更されました。画面を再読み込みしてください。")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    shutil.copy2(path, BACKUP_DIR / f"researchmap-{timestamp}.jsonl")
    content = "".join(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n"
        for document in documents
    )
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.replace(temporary, path)
    if path.resolve() == DEFAULT_DATA_FILE.resolve():
        write_public_data(documents)
    return file_hash(path)


class EditorServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], handler: type[BaseHTTPRequestHandler], data_file: Path):
        super().__init__(address, handler)
        self.data_file = data_file
        self.write_token = secrets.token_urlsafe(24)
        self.write_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server: EditorServer

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def _json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, error: Exception) -> None:
        status = HTTPStatus.CONFLICT if isinstance(error, ConflictError) else HTTPStatus.BAD_REQUEST
        self._json({"error": str(error)}, status)

    def _body(self) -> Any:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise EditorError("Content-Lengthが不正です。") from exc
        if length <= 0 or length > 2_000_000:
            raise EditorError("リクエスト本文のサイズが不正です。")
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            raise EditorError("JSONリクエストが不正です。") from exc

    def _authorized(self) -> bool:
        return secrets.compare_digest(self.headers.get("X-Editor-Token", ""), self.server.write_token)

    def _static(self, name: str, content_type: str) -> None:
        path = STATIC_DIR / name
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/", "/index.html"}:
            self._static("index.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/styles.css":
            self._static("styles.css", "text/css; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self._static("app.js", "text/javascript; charset=utf-8")
            return
        try:
            documents = load_documents(self.server.data_file)
            if parsed.path == "/api/meta":
                counts: dict[str, int] = {}
                user_id = None
                for document in documents:
                    insert = document["insert"]
                    counts[insert["type"]] = counts.get(insert["type"], 0) + 1
                    user_id = user_id or insert.get("user_id") or (
                        insert.get("id") if insert.get("type") == "researchers" else None
                    )
                try:
                    data_label = str(self.server.data_file.relative_to(ROOT))
                except ValueError:
                    data_label = self.server.data_file.name
                self._json({
                    "counts": counts,
                    "total": len(documents),
                    "user_id": user_id,
                    "file_hash": file_hash(self.server.data_file),
                    "write_token": self.server.write_token,
                    "data_file": data_label,
                })
            elif parsed.path == "/api/records":
                query = parse_qs(parsed.query)
                wanted_type = query.get("type", [""])[0]
                needle = query.get("q", [""])[0].casefold().strip()
                records = [summary(document, index) for index, document in enumerate(documents)]
                if wanted_type:
                    records = [record for record in records if record["type"] == wanted_type]
                if needle:
                    records = [record for record in records if needle in f'{record["title"]} {record["contributors"]}'.casefold()]
                self._json({"records": records, "file_hash": file_hash(self.server.data_file)})
            elif parsed.path == "/api/record":
                query = parse_qs(parsed.query)
                index = int(query.get("index", ["-1"])[0])
                if index < 0 or index >= len(documents):
                    raise EditorError("指定したレコードが見つかりません。")
                self._json({"document": documents[index], "index": index, "file_hash": file_hash(self.server.data_file)})
            elif parsed.path == "/api/export":
                body = self.server.data_file.read_bytes()
                filename = f"researchmap-import-{dt.date.today().isoformat()}.jsonl"
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except (EditorError, ValueError) as error:
            self._error(error)

    def do_POST(self) -> None:
        if self.path != "/api/records":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._authorized():
            self._json({"error": "書き込みトークンが不正です。"}, HTTPStatus.FORBIDDEN)
            return
        try:
            payload = self._body()
            document = payload.get("document")
            if not isinstance(document, dict) or document.get("insert", {}).get("type") not in NEW_TYPES:
                raise EditorError("新規作成できるのは論文と講演・口頭発表です。")
            document["insert"].pop("id", None)
            validate_document(document, allow_new=True)
            with self.server.write_lock:
                documents = load_documents(self.server.data_file)
                documents.insert(0, document)
                new_hash = write_documents(self.server.data_file, documents, payload.get("source_hash", ""))
            self._json({"message": "新しい業績を追加しました。", "file_hash": new_hash}, HTTPStatus.CREATED)
        except (EditorError, AttributeError) as error:
            self._error(error)

    def do_PUT(self) -> None:
        if self.path != "/api/records":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._authorized():
            self._json({"error": "書き込みトークンが不正です。"}, HTTPStatus.FORBIDDEN)
            return
        try:
            payload = self._body()
            index = int(payload.get("index", -1))
            merge = payload.get("merge")
            if not isinstance(merge, dict):
                raise EditorError("mergeの形式が不正です。")
            with self.server.write_lock:
                documents = load_documents(self.server.data_file)
                if index < 0 or index >= len(documents):
                    raise EditorError("編集対象が見つかりません。")
                original = documents[index]
                updated = {"insert": original["insert"], "merge": merge}
                validate_document(updated, allow_new=True)
                documents[index] = updated
                new_hash = write_documents(self.server.data_file, documents, payload.get("source_hash", ""))
            self._json({"message": "業績を更新しました。", "file_hash": new_hash})
        except (EditorError, TypeError, ValueError) as error:
            self._error(error)


def main() -> None:
    parser = argparse.ArgumentParser(description="researchmap JSONLをブラウザから編集します。")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_FILE)
    args = parser.parse_args()
    data_file = args.data.resolve()
    if not data_file.is_file():
        parser.error(f"データファイルがありません: {data_file}")
    if data_file == DEFAULT_DATA_FILE.resolve():
        write_public_data(load_documents(data_file))
    server = EditorServer((args.host, args.port), Handler, data_file)
    print(f"researchmap editor: http://{args.host}:{args.port}/")
    print(f"data: {data_file}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
