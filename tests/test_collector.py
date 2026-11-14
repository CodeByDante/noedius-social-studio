import importlib.util
import json
import subprocess
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1] / 'scripts/collect.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_rejects_cross_platform_private_and_credential_urls(self):
        for url in ['http://www.youtube.com/@Noedius', 'https://127.0.0.1/a', 'https://youtube.com.evil.test/@Noedius', 'https://secret@www.youtube.com/@Noedius', 'https://www.youtube.com:8888/@Noedius']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                collector.valid_url('youtube', url)

    def test_profile_is_never_accepted_as_video(self):
        with self.assertRaises(ValueError):
            collector.valid_url('instagram', 'https://www.instagram.com/noedius/', video=True)
        collector.valid_url('youtube', 'https://www.youtube.com/watch?v=abcdefghijk', video=True)
        collector.valid_url('instagram', 'https://www.instagram.com/reel/ABC_123/', video=True)

    def test_rss_chooses_newest_not_document_order(self):
        xml = b'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>abcdefghijk</yt:videoId><title>Old</title><published>2024-01-01T00:00:00Z</published></entry><entry><yt:videoId>12345678901</yt:videoId><title>New &amp; real</title><published>2024-02-01T00:00:00Z</published></entry></feed>'''
        with patch.object(collector, 'fetch', return_value=xml):
            result = collector.youtube_rss('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')
        self.assertEqual(result['title'], 'New & real')
        self.assertEqual(result['url'], 'https://www.youtube.com/watch?v=12345678901')

    def test_failed_refresh_preserves_only_same_profile_and_marks_stale(self):
        previous = {'profileUrl': collector.DEFAULTS['tiktok'], 'title': 'Previous', 'url': 'https://www.tiktok.com/@noediusx/video/123', 'source': 'test', 'publishedAt': '2024-01-01T00:00:00Z'}
        with patch.object(collector, 'ytdlp_metadata', side_effect=ValueError('blocked')):
            result = collector.collect_one('tiktok', collector.DEFAULTS['tiktok'], previous)
            changed = collector.collect_one('tiktok', 'https://www.tiktok.com/@another', previous)
        self.assertEqual(result['status'], 'unavailable')
        self.assertTrue(result['stale'])
        self.assertEqual(result['title'], 'Previous')
        self.assertIsNone(changed['url'])


    def test_date_keeps_timezone_instant(self):
        self.assertEqual(collector.date_value('2024-01-01T10:00:00+09:00'), collector.date_value('2024-01-01T01:00:00Z'))
        self.assertIsNone(collector.date_value('not a date'))

    def test_dated_new_video_beats_old_pinned_video(self):
        entries = {'entries': [
            {'title': 'Pinned old', 'url': 'https://www.tiktok.com/@noediusx/video/1', 'timestamp': 1700000000, 'is_pinned': True},
            {'title': 'Actual newest', 'url': 'https://www.tiktok.com/@noediusx/video/2', 'timestamp': 1710000000, 'is_pinned': False},
            {'title': 'Unknown date', 'url': 'https://www.tiktok.com/@noediusx/video/3'},
        ]}
        response = subprocess.CompletedProcess([], 0, json.dumps(entries), '')
        with patch.object(collector.subprocess, 'run', return_value=response):
            result = collector.ytdlp_metadata('tiktok', collector.DEFAULTS['tiktok'])
        self.assertEqual(result['title'], 'Actual newest')

    def test_tiktok_api_rejects_different_token_account(self):
        response = {'data': {'videos': [{'title': 'Other owner', 'share_url': 'https://www.tiktok.com/@someoneelse/video/1', 'create_time': 1700000000}]}, 'error': {'code': 'ok'}}
        with patch.object(collector, 'api_json', return_value=response), self.assertRaises(ValueError):
            collector.tiktok_api(collector.DEFAULTS['tiktok'], 'test-not-a-real-token')

    def test_instagram_api_filters_photos_and_sorts_video_dates(self):
        identity = {'id': '123', 'username': 'noedius'}
        data = {'data': [
            {'media_type': 'VIDEO', 'caption': 'Old', 'permalink': 'https://www.instagram.com/reel/old/', 'timestamp': '2024-01-01T00:00:00Z'},
            {'media_type': 'IMAGE', 'caption': 'Newest photo', 'permalink': 'https://www.instagram.com/p/photo/', 'timestamp': '2024-04-01T00:00:00Z'},
            {'media_type': 'VIDEO', 'caption': 'Newest video', 'permalink': 'https://www.instagram.com/reel/new/', 'timestamp': '2024-03-01T00:00:00Z'}
        ]}
        with patch.object(collector, 'api_json', side_effect=[identity, data]):
            result = collector.instagram_api(collector.DEFAULTS['instagram'], '123', 'test-not-a-real-token')
        self.assertEqual(result['title'], 'Newest video')

    def test_facebook_api_rejects_different_page(self):
        identity = {'id': '123', 'link': 'https://www.facebook.com/someoneelse'}
        with patch.object(collector, 'api_json', return_value=identity), self.assertRaises(ValueError):
            collector.facebook_api(collector.DEFAULTS['facebook'], '123', 'test-not-a-real-token')


if __name__ == '__main__':
    unittest.main()
