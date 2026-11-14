import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const { validVideoUrl, newest, parseYoutubeRss, parsePublicHtml, collectLatest, handleRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const NOW = Date.parse('2026-11-14T22:00:00Z');
const CHANNEL_ID = 'UC1Zq6NrbGOI2NMQQqRgIphQ';
const rss = `<feed><yt:channelId>${CHANNEL_ID}</yt:channelId><entry><yt:videoId>abcdefghijk</yt:videoId><title>A &amp; B</title><published>2026-11-14T21:00:00Z</published></entry><entry><yt:videoId>abcdefghij2</yt:videoId><title>Old pinned</title><published>2026-11-12T21:00:00Z</published></entry></feed>`;

test('RSS selects newest dated upload and decodes XML without trusting other channels', () => {
  assert.equal(parseYoutubeRss(rss, NOW).title, 'A & B');
  assert.equal(parseYoutubeRss(rss, NOW).url, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(parseYoutubeRss(rss.replace(CHANNEL_ID, 'UCaaaaaaaaaaaaaaaaaaaaaa'), NOW), null);
});

test('newest rejects undated/future entries and profiles masquerading as videos', () => {
  const entries = [
    { title: 'Future', url: 'https://www.youtube.com/watch?v=abcdefghijk', publishedAt: '2030-01-01' },
    { title: 'No date', url: 'https://www.youtube.com/watch?v=abcdefghij2' },
    { title: 'Profile', url: 'https://www.youtube.com/@Noedius', publishedAt: '2026-11-14' },
  ];
  assert.equal(newest('youtube', entries, NOW), null);
  assert.equal(validVideoUrl('youtube', 'https://youtube.com.evil.example/watch?v=abcdefghijk'), null);
  assert.equal(validVideoUrl('youtube', 'https://user:pass@www.youtube.com/watch?v=abcdefghijk'), null);
});

test('TikTok public structured data validates author and sorts timestamps, ignoring pinned order', () => {
  const html = `<script id="SIGI_STATE" type="application/json">${JSON.stringify({ ItemModule: {
    one: { id: '1234', desc: 'Old pinned', createTime: NOW / 1000 - 10000, author: 'noediusx' },
    two: { id: '5678', desc: 'Fresh', createTime: NOW / 1000 - 5, author: { uniqueId: 'noediusx' } },
    recommended: { id: '9000', desc: 'Other account', createTime: NOW / 1000 - 1, author: { uniqueId: 'other' } },
  } })}</script>`;
  assert.equal(parsePublicHtml('tiktok', html, NOW).title, 'Fresh');
  assert.equal(parsePublicHtml('tiktok', html, NOW).url, 'https://www.tiktok.com/@noediusx/video/5678');
  assert.equal(parsePublicHtml('tiktok', '<html>Please log in</html>', NOW), null);
});

test('Instagram public structures exclude photos and videos by other accounts', () => {
  const html = `<script type="application/json">${JSON.stringify({ items: [
    { code: 'Photo', caption: { text: 'Photo' }, media_type: 1, taken_at: NOW / 1000 - 1, user: { username: 'noedius' } },
    { code: 'Video', caption: { text: 'Real video' }, media_type: 2, taken_at: NOW / 1000 - 100, user: { username: 'noedius' } },
    { code: 'Other', caption: { text: 'Other user' }, media_type: 2, taken_at: NOW / 1000 - 2, user: { username: 'other' } },
  ] })}</script>`;
  assert.equal(parsePublicHtml('instagram', html, NOW).title, 'Real video');
});

test('VideoObject needs a verified author URL as well as date, title and direct video URL', () => {
  const object = { '@type': 'VideoObject', name: 'Facebook clip', url: 'https://www.facebook.com/reel/123/', uploadDate: '2026-11-14T20:00:00Z', author: { url: 'https://www.facebook.com/Noedius' } };
  const html = value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  assert.equal(parsePublicHtml('facebook', html(object), NOW).title, 'Facebook clip');
  assert.equal(parsePublicHtml('facebook', html({ ...object, author: { name: 'Noedius' } }), NOW), null);
  assert.equal(parsePublicHtml('facebook', html({ ...object, author: { url: 'https://www.facebook.com/other' } }), NOW), null);
});

test('live collection returns fresh successes and marks backup data stale after a failed direct query', async () => {
  const backup = { schemaVersion: 1, platforms: { tiktok: { profileUrl: 'https://www.tiktok.com/@noediusx', title: 'Earlier', url: 'https://www.tiktok.com/@noediusx/video/1234', publishedAt: '2026-11-13T20:00:00Z', obtainedAt: '2026-11-13T21:00:00Z' } } };
  const destinations = [];
  const fetcher = async (url, init) => {
    // Workers rejects redirect:"error" before sending the request; manual keeps
    // redirects disallowed without depending on that unsupported Fetch option.
    assert.equal(init.redirect, 'manual');
    destinations.push(url);
    if (url.includes('feeds/videos.xml')) return new Response(rss);
    if (url.includes('raw.githubusercontent.com')) return Response.json(backup);
    return new Response('<html>Login required</html>', { status: 200 });
  };
  const data = await collectLatest({ fetcher, now: NOW });
  assert.equal(data.platforms.youtube.status, 'ok');
  assert.equal(data.platforms.youtube.stale, false);
  assert.equal(data.platforms.tiktok.status, 'unavailable');
  assert.equal(data.platforms.tiktok.stale, true);
  assert.equal(data.platforms.tiktok.title, 'Earlier');
  assert.equal(data.platforms.tiktok.obtainedAt, '2026-11-13T21:00:00Z');
  assert.equal(data.platforms.instagram.url, null);
  assert.equal(data.updatedAt, '2026-11-14T22:00:00.000Z');
  assert.equal(destinations.length, 5);
});

test('read-only endpoint enforces exact origin and ignores arbitrary upstream destinations', async () => {
  assert.equal((await handleRequest(new Request('https://example.com/api/latest', { method: 'POST', headers: { Origin: 'https://codebydante.github.io' } }))).status, 405);
  assert.equal((await handleRequest(new Request('https://example.com/api/latest', { headers: { Origin: 'https://codebydante.github.io.evil.example' } }))).status, 403);
  const options = await handleRequest(new Request('https://example.com/api/latest', { method: 'OPTIONS', headers: { Origin: 'https://codebydante.github.io' } }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), 'https://codebydante.github.io');
  let fetched = [];
  const response = await handleRequest(new Request('https://example.com/api/latest?url=https://127.0.0.1/private', { headers: { Origin: 'https://codebydante.github.io' } }), { now: NOW, fetcher: async url => { fetched.push(url); return new Response('unavailable', { status: 503 }); } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://codebydante.github.io');
  assert.equal(fetched.some(url => url.includes('127.0.0.1')), false);
});
