import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen

from editor import researchmap_editor as editor


class ResearchmapEditorTests(unittest.TestCase):
    def test_current_export_is_valid(self):
        documents = editor.load_documents(editor.DEFAULT_DATA_FILE)
        self.assertGreater(len(documents), 0)
        self.assertEqual(1, sum(item["insert"]["type"] == "researchers" for item in documents))
        self.assertGreater(sum(item["insert"]["type"] == "published_papers" for item in documents), 0)
        self.assertGreater(sum(item["insert"]["type"] == "presentations" for item in documents), 0)

    def test_new_paper_accepts_researchmap_flags_without_id(self):
        document = {
            "insert": {"type": "published_papers", "user_id": "R000064079"},
            "merge": {
                "display": "disclosed",
                "major_achievement": False,
                "paper_title": {"ja": "テスト論文"},
                "authors": {"ja": [{"name": "吉丸 直希"}]},
                "publication_date": "2026-09",
                "languages": ["jpn"],
                "referee": True,
                "invited": False,
                "published_paper_type": "scientific_journal",
            },
        }
        editor.validate_document(document, allow_new=True)

    def test_invalid_date_is_rejected(self):
        document = {
            "insert": {"type": "presentations", "user_id": "R000064079"},
            "merge": {
                "display": "disclosed",
                "presentation_title": {"ja": "発表"},
                "presenters": {"ja": [{"name": "吉丸 直希"}]},
                "publication_date": "2026-13-40",
            },
        }
        with self.assertRaisesRegex(editor.EditorError, "publication_date"):
            editor.validate_document(document, allow_new=True)

    def test_public_projection_excludes_private_records_and_internal_ids(self):
        documents = editor.load_documents(editor.DEFAULT_DATA_FILE)
        documents.append({
            "insert": {"type": "awards", "id": "private-id", "user_id": "R000064079"},
            "merge": {"display": "closed", "award_name": {"ja": "非公開の賞"}},
        })
        projected = editor.public_documents(documents)
        expected_public = sum(
            item["insert"]["type"] == "researchers"
            or item["merge"].get("display", "disclosed") == "disclosed"
            for item in documents[:-1]
        )
        self.assertEqual(expected_public, len(projected))
        self.assertTrue(all(set(item) == {"type", "merge"} for item in projected))
        self.assertFalse(any("非公開の賞" in json.dumps(item, ensure_ascii=False) for item in projected))
        researcher = next(item for item in projected if item["type"] == "researchers")
        self.assertNotIn("display", researcher["merge"])
        self.assertNotIn("user_id", json.dumps(projected, ensure_ascii=False))

    def test_http_api_adds_record_without_researchmap_id(self):
        source = editor.DEFAULT_DATA_FILE.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_file = root / "data.jsonl"
            data_file.write_text(source, encoding="utf-8")
            initial_count = len(editor.load_documents(data_file))
            server = editor.EditorServer(("127.0.0.1", 0), editor.Handler, data_file)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            try:
                with urlopen(f"{base}/api/meta") as response:
                    meta = json.load(response)
                document = {
                    "insert": {"type": "published_papers", "user_id": meta["user_id"], "id": "must-be-removed"},
                    "merge": {
                        "display": "disclosed",
                        "paper_title": {"en": "Temporary test paper"},
                        "authors": {"en": [{"name": "Naoki Yoshimaru"}]},
                        "publication_date": "2026-09",
                        "referee": True,
                        "invited": False,
                    },
                }
                body = json.dumps({"source_hash": meta["file_hash"], "document": document}).encode()
                request = Request(
                    f"{base}/api/records",
                    data=body,
                    method="POST",
                    headers={"Content-Type": "application/json", "X-Editor-Token": meta["write_token"]},
                )
                with patch.object(editor, "BACKUP_DIR", root / "backups"):
                    with urlopen(request) as response:
                        self.assertEqual(201, response.status)
                written = editor.load_documents(data_file)
                self.assertEqual(initial_count + 1, len(written))
                self.assertNotIn("id", written[0]["insert"])
                self.assertEqual("Temporary test paper", written[0]["merge"]["paper_title"]["en"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_atomic_write_creates_backup_and_detects_conflict(self):
        source = editor.DEFAULT_DATA_FILE.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_file = root / "data.jsonl"
            backup_dir = root / "backups"
            data_file.write_text(source, encoding="utf-8")
            documents = editor.load_documents(data_file)
            initial_count = len(documents)
            documents[1]["merge"]["referee"] = True
            with patch.object(editor, "BACKUP_DIR", backup_dir):
                new_hash = editor.write_documents(data_file, documents, editor.file_hash(data_file))
                self.assertEqual(new_hash, editor.file_hash(data_file))
                self.assertEqual(1, len(list(backup_dir.glob("*.jsonl"))))
                with self.assertRaises(editor.ConflictError):
                    editor.write_documents(data_file, documents, "stale-hash")
            written = [json.loads(line) for line in data_file.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(initial_count, len(written))
            self.assertIs(written[1]["merge"]["referee"], True)


if __name__ == "__main__":
    unittest.main()
