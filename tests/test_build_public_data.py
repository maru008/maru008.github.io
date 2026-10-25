import json
import tempfile
import unittest
from pathlib import Path

from scripts import build_public_data as build


class BuildPublicDataTests(unittest.TestCase):
    def test_current_export(self):
        documents = build.load_documents(build.find_source())
        self.assertEqual(1, sum(item['insert']['type'] == 'researchers' for item in documents))
        self.assertTrue(any(item['insert']['type'] == 'published_papers' for item in documents))

    def test_arbitrary_names_and_export_formats(self):
        records = [{'insert': {'type': 'published_papers'}, 'merge': {'paper_title': {'ja': '論文'}}},
                   {'insert': {'type': 'researchers'}, 'merge': {}}]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, content in [('任意の名前.JSON', json.dumps(records)),
                                  ('download.json', '\n'.join(map(json.dumps, records))),
                                  ('researchmap.jsonl', '\n'.join(map(json.dumps, records))),
                                  ('single.json', json.dumps(records[0]))]:
                path = root / name
                path.write_text('\ufeff' + content, encoding='utf-8')
                self.assertEqual(path, build.find_source(root))
                self.assertEqual(records if name != 'single.json' else records[:1], build.load_documents(path))
                path.unlink()

    def test_missing_or_multiple_files_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'README.md').touch()
            with self.assertRaises(ValueError):
                build.find_source(root)
            (root / 'one.json').touch()
            (root / 'two.jsonl').touch()
            with self.assertRaises(ValueError):
                build.find_source(root)

    def test_invalid_input_does_not_replace_public_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'invalid.json'
            for content in ['[]', '{}', 'null', '{broken', '[{"insert": {}, "merge": {}}]']:
                path.write_text(content)
                with self.assertRaises(ValueError):
                    build.load_documents(path)

    def test_public_projection(self):
        records = [
            {'insert': {'type': 'awards', 'id': 'internal'}, 'merge': {'display': display}}
            for display in ['disclosed', 'closed', 'researchers_only']
        ]
        records.append({'insert': {'type': 'researchers', 'id': 'internal'}, 'merge': {
            'permalink': 'example', 'contact_point': 'private',
            'affiliations': [{'display_affiliation': 'closed'}, {'affiliation': {'en': 'Public'}}],
            'degrees': [{'display_degree': 'researchers_only'}]}})
        result = build.public_documents(records)
        self.assertEqual(2, len(result))
        self.assertTrue(all(set(item) == {'type', 'merge'} for item in result))
        self.assertNotIn('contact_point', result[1]['merge'])
        self.assertEqual(1, len(result[1]['merge']['affiliations']))
        self.assertEqual([], result[1]['merge']['degrees'])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'public' / 'researchmap.json'
            build.write_public_data(records, output)
            self.assertEqual(result, json.loads(output.read_text()))
