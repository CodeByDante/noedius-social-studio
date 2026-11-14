import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The app is a browser ES module. A data URL lets Node test its pure helpers
// without package-manager dependencies or emulating the document.
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const { safeUrl, isVideoUrl, sameProfile, formatPost, selectLatestVideo } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('latest video keeps the YouTube title and destination together and excludes stale, foreign or future data', () => {
  const item={profileUrl:'https://www.youtube.com/@Noedius',status:'ok',stale:false,title:'Título completo',url:'https://www.youtube.com/watch?v=Abc_def-123',publishedAt:'2026-11-14T18:00:00Z'};
  const now=Date.parse('2026-11-14T22:00:00Z');
  assert.equal(selectLatestVideo({platforms:{youtube:item}},undefined,now).url,item.url);
  for(const change of [{stale:true},{status:'unavailable'},{profileUrl:'https://www.youtube.com/@Other'},{url:'https://www.youtube.com/@Noedius'},{title:''},{publishedAt:'bad'},{publishedAt:'2030-01-01T00:00:00Z'}]){
    assert.equal(selectLatestVideo({platforms:{youtube:{...item,...change}}},undefined,now),null);
  }
});

test('latest video falls back to the newest valid network when YouTube is unavailable', () => {
  const data={platforms:{youtube:{status:'unavailable'},tiktok:{status:'ok',stale:false,profileUrl:'https://www.tiktok.com/@noediusx',title:'Último TikTok',url:'https://www.tiktok.com/@noediusx/video/1234567890123456789',publishedAt:'2026-11-14T19:00:00Z'}}};
  assert.equal(selectLatestVideo(data,undefined,Date.parse('2026-11-14T22:00:00Z')).title,'Último TikTok');
});

test('only HTTPS URLs at exact platform hosts can be shared', () => {
  assert.equal(safeUrl('https://www.youtube.com/@Noedius', 'youtube'), 'https://www.youtube.com/@Noedius');
  for (const url of [
    'javascript:alert(1)',
    'http://www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com.evil.example/watch?v=abcdefghijk',
    'https://youtube.com@evil.example/watch?v=abcdefghijk',
    'https://user:password@www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com:8080/watch?v=abcdefghijk',
    'https://127.0.0.1/watch?v=abcdefghijk',
    'https://www.instagram.com/reel/abc/',
  ]) assert.equal(safeUrl(url, 'youtube'), null, url);
  assert.equal(safeUrl('not a URL', 'youtube'), null);
  assert.equal(safeUrl(null, 'youtube'), null);
});

test('YouTube long videos and Shorts are accepted; channels are not video links', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=Abc_def-123',
    'https://www.youtube.com/shorts/Abc_def-123',
    'https://youtu.be/Abc_def-123?si=share',
    'https://www.youtube.com/live/Abc_def-123',
  ]) assert.equal(isVideoUrl(url, 'youtube'), true, url);
  for (const url of [
    'https://www.youtube.com/@Noedius',
    'https://www.youtube.com/@Noedius/shorts',
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/',
    'https://www.youtube.com/playlist?list=test',
  ]) assert.equal(isVideoUrl(url, 'youtube'), false, url);
});

test('social video links are distinct from profile fallback URLs', () => {
  const examples = [
    ['facebook', 'https://www.facebook.com/reel/123456789/', 'https://www.facebook.com/Noedius/reels/'],
    ['tiktok', 'https://www.tiktok.com/@noediusx/video/1234567890123456789', 'https://www.tiktok.com/@noediusx'],
    ['instagram', 'https://www.instagram.com/reel/Example123/', 'https://www.instagram.com/noedius/?hl=es'],
  ];
  for (const [key, video, profile] of examples) {
    assert.equal(isVideoUrl(video, key), true, key);
    assert.equal(isVideoUrl(profile, key), false, key);
  }
  assert.equal(isVideoUrl('https://www.tiktok.com/@noediusx/video/', 'tiktok'), false);
});

test('profile matching tolerates www, case, query and trailing slash but not other channels', () => {
  assert.equal(sameProfile('https://youtube.com/@NOEDIUS/', 'https://www.youtube.com/@Noedius?hl=es'), true);
  assert.equal(sameProfile('https://www.instagram.com/noedius/?hl=es', 'https://www.instagram.com/noedius'), true);
  assert.equal(sameProfile('https://youtube.com/@Noedius', 'https://youtube.com/@OtherChannel'), false);
  assert.equal(sameProfile('', ''), false);
});

const links = [
  { name: 'YouTube', url: 'https://www.youtube.com/watch?v=Abc_def-123' },
  { name: 'Facebook', url: 'https://www.facebook.com/reel/123456789/' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@noediusx/video/1234567890123456789' },
  { name: 'Instagram', url: 'https://www.instagram.com/reel/Example123/' },
];

test('text output keeps requested order, title, URLs, spacing and closing', () => {
  const actual = formatPost('Un título de prueba', links, '¡Apóyame con tu like, comenta y comparte!');
  assert.equal(actual, [
    '🔥 Un título de prueba',
    'YouTube:\nhttps://www.youtube.com/watch?v=Abc_def-123',
    'Facebook:\nhttps://www.facebook.com/reel/123456789/',
    'TikTok:\nhttps://www.tiktok.com/@noediusx/video/1234567890123456789',
    'Instagram:\nhttps://www.instagram.com/reel/Example123/',
    '¡Apóyame con tu like, comenta y comparte!',
  ].join('\n\n'));
});

test('WhatsApp and Markdown markers match their actual clipboard format', () => {
  assert.equal(formatPost('Título', [links[0]], 'Comparte', 'markdown'), '🔥 Título\n\n_**YouTube**_:\nhttps://www.youtube.com/watch?v=Abc_def-123\n\n*Comparte*');
  assert.equal(formatPost('Título', [links[0]], 'Comparte', 'whatsapp'), '🔥 Título\n\n_*YouTube*_:\nhttps://www.youtube.com/watch?v=Abc_def-123\n\n_Comparte_');
});

test('blank closing is omitted and an existing fire prefix is not doubled', () => {
  assert.equal(formatPost(' 🔥 Título ', [], ' ', 'text'), '🔥 Título');
  assert.equal(formatPost('Título', [], '', 'text', ''), 'Título');
});
