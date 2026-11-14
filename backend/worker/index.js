/** Read-only, fixed-channel public metadata collector. No credentials or write endpoints. */
const CHANNEL_ID = 'UC1Zq6NrbGOI2NMQQqRgIphQ';
const PROFILES = Object.freeze({
  youtube: 'https://www.youtube.com/@Noedius',
  facebook: 'https://www.facebook.com/Noedius/reels/',
  tiktok: 'https://www.tiktok.com/@noediusx',
  instagram: 'https://www.instagram.com/noedius/',
});
const BACKUP_URL = 'https://raw.githubusercontent.com/CodeByDante/noedius-social-studio/main/data/latest.json';
const MAX_BYTES = 4_000_000;
const ALLOWED_ORIGINS = new Set(['https://codebydante.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:3000', 'http://localhost:3000']);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : '';
}

function decodeEntities(value) {
  return String(value).replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
    const names = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const code = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export function validVideoUrl(platform, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    let valid = false;
    if (platform === 'youtube' && host === 'youtube.com') valid = (/^\/watch\/?$/.test(url.pathname) && /^[\w-]{11}$/.test(url.searchParams.get('v') || '')) || /^\/(shorts|live)\/[\w-]{11}\/?$/.test(url.pathname);
    if (platform === 'tiktok' && host === 'tiktok.com') valid = /^\/@noediusx\/video\/\d+\/?$/i.test(url.pathname);
    if (platform === 'facebook' && host === 'facebook.com') valid = /^\/(?:reel\/\d+|Noedius\/videos\/\d+)\/?$/i.test(url.pathname) || (url.pathname === '/watch/' && /^\d+$/.test(url.searchParams.get('v') || ''));
    if (platform === 'instagram' && host === 'instagram.com') valid = /^\/(?:reel|p|tv)\/[\w-]+\/?$/.test(url.pathname);
    return valid ? url.href : null;
  } catch { return null; }
}

function sameProfile(platform, value) {
  try {
    const url = new URL(value);
    const expected = new URL(PROFILES[platform]);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    const root = expected.pathname.split('/').filter(Boolean)[0].toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && host === expected.hostname.replace(/^www\./, '') && (path === '/' + root || (platform === 'facebook' && path === '/' + root + '/reels'));
  } catch { return false; }
}

export function newest(platform, entries, now = Date.now()) {
  return entries.map(entry => {
    const title = cleanText(entry.title);
    const url = validVideoUrl(platform, entry.url);
    const date = typeof entry.publishedAt === 'number' ? entry.publishedAt * 1000 : Date.parse(entry.publishedAt);
    if (!title || !url || !Number.isFinite(date) || date <= 0 || date > now) return null;
    return { title, url, publishedAt: new Date(date).toISOString(), source: entry.source || 'Metadatos públicos' };
  }).filter(Boolean).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] || null;
}

export function parseYoutubeRss(xml, now = Date.now(), expectedId = CHANNEL_ID) {
  if (!xml.includes(expectedId)) return null;
  const entries = [];
  for (const match of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const body = match[1];
    const id = body.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = body.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/)?.[1];
    const date = body.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title && date) entries.push({ title: decodeEntities(title), url: 'https://www.youtube.com/watch?v=' + id, publishedAt: date, source: 'YouTube RSS · consulta directa' });
  }
  return newest('youtube', entries, now);
}

function scriptsFromHtml(html) {
  const result = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = match[1];
    if (!/application\/(?:ld\+)?json/i.test(attrs) && !/\bid=["'](?:SIGI_STATE|__UNIVERSAL_DATA_FOR_REHYDRATION__)["']/i.test(attrs)) continue;
    try { result.push(JSON.parse(match[2])); } catch { /* A malformed script is not trusted metadata. */ }
  }
  return result;
}

function walk(root, visit) {
  const stack = [root];
  let visited = 0;
  while (stack.length && visited++ < 30_000) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (!Array.isArray(value)) visit(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
  }
}

export function parsePublicHtml(platform, html, now = Date.now()) {
  const entries = [];
  for (const payload of scriptsFromHtml(html)) walk(payload, item => {
    const type = item['@type'];
    if (type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'))) {
      const authors = [item.author, item.creator, item.publisher].flat().filter(Boolean);
      const accountMatches = authors.some(author => typeof author === 'object' && [author.url, author['@id']].some(url => sameProfile(platform, url)));
      const url = item.url || item.mainEntityOfPage?.['@id'];
      if (accountMatches) entries.push({ title: item.name || item.headline || item.description, url, publishedAt: item.uploadDate || item.datePublished, source: 'Datos públicos VideoObject · consulta directa' });
    }
    if (platform === 'tiktok') {
      const author = typeof item.author === 'string' ? item.author : item.author?.uniqueId;
      if (String(author || '').replace(/^@/, '').toLowerCase() === 'noediusx' && /^\d+$/.test(String(item.id || ''))) {
        entries.push({ title: item.desc || item.title, url: 'https://www.tiktok.com/@noediusx/video/' + item.id, publishedAt: Number(item.createTime), source: 'TikTok · metadatos públicos directos' });
      }
    }
    if (platform === 'instagram') {
      const username = item.user?.username || item.owner?.username;
      const code = item.code || item.shortcode;
      const isVideo = item.is_video === true || item.media_type === 2;
      if (String(username || '').toLowerCase() === 'noedius' && isVideo && /^[\w-]+$/.test(String(code || ''))) {
        const caption = typeof item.caption === 'string' ? item.caption : item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text;
        entries.push({ title: caption, url: 'https://www.instagram.com/reel/' + code + '/', publishedAt: Number(item.taken_at || item.taken_at_timestamp), source: 'Instagram · metadatos públicos directos' });
      }
    }
  });
  return newest(platform, entries, now);
}

async function readText(url, fetcher, signal) {
  const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal, cf: { cacheTtl: 0, cacheEverything: false }, headers: { Accept: 'text/html,application/atom+xml,application/json;q=0.9,*/*;q=0.5', 'Cache-Control': 'no-cache', 'User-Agent': 'NoediusSocialStudio/2.0 (public metadata only)' } });
  if (!response.ok) throw new Error('Source HTTP ' + response.status);
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('Response too large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Response too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function bounded(operation, ms = 15_000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Source timeout')); }, ms); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

async function youtube(fetcher, signal, now) {
  const feedUrl = id => 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
  try {
    const result = parseYoutubeRss(await readText(feedUrl(CHANNEL_ID), fetcher, signal), now);
    if (result) return result;
  } catch { if (signal.aborted) throw new Error('Source timeout'); }
  const page = await readText(PROFILES.youtube + '/videos', fetcher, signal);
  const id = page.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1] || page.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/)?.[1];
  if (id !== CHANNEL_ID) return null;
  return parseYoutubeRss(await readText(feedUrl(id), fetcher, signal), now, id);
}

export async function collectLatest({ fetcher = fetch, now = Date.now() } = {}) {
  const checkedAt = new Date(now).toISOString();
  const backupPromise = bounded(async signal => {
    try {
      const result = JSON.parse(await readText(BACKUP_URL, fetcher, signal));
      return result.schemaVersion === 1 && typeof result.platforms === 'object' ? result.platforms : {};
    } catch (error) { console.error('Noedius backup:', String(error.message).slice(0,200)); return {}; }
  }, 8_000).catch(() => ({}));
  const fresh = await Promise.all(Object.keys(PROFILES).map(async platform => {
    try {
      return [platform, await bounded(signal => platform === 'youtube' ? youtube(fetcher, signal, now) : readText(PROFILES[platform], fetcher, signal).then(html => parsePublicHtml(platform, html, now)))];
    } catch (error) { console.error('Noedius source '+platform+':', String(error.message).slice(0,200)); return [platform, null]; }
  }));
  const backup = await backupPromise;
  const platforms = {};
  for (const [platform, result] of fresh) {
    const base = { profileUrl: PROFILES[platform], status: 'unavailable', title: null, url: null, publishedAt: null, source: '', message: 'La consulta directa no permitió verificar una publicación actual. No se ha confirmado un video nuevo.', stale: false, checkedAt };
    if (result) Object.assign(base, result, { status: 'ok', stale: false, obtainedAt: checkedAt, message: 'Publicación verificada en esta consulta directa.' });
    else {
      const previous = backup[platform];
      const previousItem = previous && sameProfile(platform, previous.profileUrl) ? newest(platform, [previous], now) : null;
      if (previousItem) Object.assign(base, previousItem, { stale: true, obtainedAt: previous.obtainedAt || null, message: 'No se pudo verificar ahora. Se conserva un dato anterior de GitHub; puede no ser el último video.' });
    }
    platforms[platform] = base;
  }
  return { schemaVersion: 1, updatedAt: checkedAt, live: true, platforms };
}

function cors(request) {
  const origin = request.headers.get('Origin');
  const headers = { 'Cache-Control': 'no-store, max-age=0', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  return headers;
}

export async function handleRequest(request, options = {}) {
  const headers = cors(request);
  const origin = request.headers.get('Origin');
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return json({ error: 'Read-only service' }, 405);
  const url = new URL(request.url);
  if (url.pathname === '/') return json({ service: 'Noedius public metadata', status: 'ok', endpoint: '/api/latest' });
  if (url.pathname !== '/api/latest') return json({ error: 'Not found' }, 404);
  // Query parameters never control upstream destinations or channel identity.
  return json(await collectLatest(options));
}

export default { fetch(request) { return handleRequest(request); } };
