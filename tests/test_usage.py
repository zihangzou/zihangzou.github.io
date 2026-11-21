import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("update_usage", Path(__file__).resolve().parents[1] / "scripts/update_usage.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def response():
    return {"totals": [{"count": 42, "sum": {"visits": 12}}],
            "daily": [{"dimensions": {"date": "2026-11-20"}, "count": 42, "sum": {"visits": 12}}],
            "pages": [{"dimensions": {"requestPath": "/papers/neural-plagiarism/?private=drop"}, "count": 5}],
            "countries": [{"dimensions": {"countryName": "United States"}, "count": 42}],
            "referrers": [{"dimensions": {"refererHost": ""}, "count": 42}],
            "devices": [{"dimensions": {"deviceType": "desktop"}, "count": 42}],
            "neural": [{"count": 5, "sum": {"visits": 2}}]}


class UsageTests(unittest.TestCase):
    def test_query_is_scoped_to_academic_site_and_excludes_usage(self):
        q = m.query("a" * 32, "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z")
        self.assertEqual(q.count('requestHost: "zihangzou.github.io"'), 7)
        self.assertEqual(q.count('requestPath_neq: "/usage.html"'), 7)
        self.assertIn('totals: rumPageloadEventsAdaptiveGroups(limit: 1', q)
        self.assertNotIn('optixway', q)
        with self.assertRaises(ValueError): m.query('bad"id', '', '')

    def test_totals_are_not_the_top_pages_sum(self):
        w = m.window(response(), "2026-11-19T00:00:00Z", "2026-11-21T00:00:00Z")
        self.assertEqual(w['views'], 42)
        self.assertEqual(w['visits'], 12)
        self.assertEqual(w['neural_views'], 5)
        self.assertEqual([r['views'] for r in w['daily']], [0,42])
        self.assertEqual(w['pages'][0]['label'], '/papers/neural-plagiarism/')
        self.assertEqual(w['referrers'][0]['label'], 'Direct / unknown')

    def test_empty_api_result_means_zero_after_success(self):
        w = m.window({k: [] for k in response()}, '2026-11-20T00:00:00Z', '2026-11-20T12:00:00Z')
        self.assertEqual(w['views'], 0)
        self.assertEqual(len(w['daily']), 1)

    def test_malformed_or_missing_counts_are_not_zero(self):
        for invalid in [None, -1, float('nan'), True, '12']:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError): m.number(invalid)
        r = response(); del r['totals']
        with self.assertRaises(ValueError): m.window(r, '', '')

    def test_graphql_error_is_not_a_successful_empty_response(self):
        from io import BytesIO
        with patch.object(m, 'urlopen', return_value=BytesIO(json.dumps({'errors': [{'message':'private info'}]}).encode())):
            with self.assertRaises(RuntimeError) as exc: m.fetch('SECRET_TOKEN', 'query {}')
        self.assertNotIn('private info', str(exc.exception))
        self.assertNotIn('SECRET_TOKEN', str(exc.exception))

    def test_failed_query_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'scripts').mkdir(); target=root/'usage-data.json'
            target.write_text('previous successful snapshot')
            with patch.object(m, '__file__', str(root/'scripts/update_usage.py')), patch.dict(m.os.environ, {'CF_API_TOKEN':'fake', 'CF_ACCOUNT_ID':'a'*32}), patch.object(m,'fetch',side_effect=RuntimeError('offline')):
                with self.assertRaises(RuntimeError):m.main()
            self.assertEqual(target.read_text(), 'previous successful snapshot')

    def test_success_writes_only_aggregate_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir()
            with patch.object(m,'__file__',str(root/'scripts/update_usage.py')),patch.dict(m.os.environ,{'CF_API_TOKEN':'PRIVATE_TOKEN','CF_ACCOUNT_ID':'a'*32}),patch.object(m,'fetch',return_value=response()):m.main()
            text=(root/'usage-data.json').read_text();d=json.loads(text)
            self.assertEqual(d['status'],'ready');self.assertEqual(set(d['windows']),{'1','7','30'})
            self.assertNotIn('PRIVATE_TOKEN',text);self.assertNotIn('a'*32,text)
            self.assertNotIn('private=drop',text)


if __name__ == '__main__':unittest.main()
