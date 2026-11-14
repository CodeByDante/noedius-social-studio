const PLATFORMS = {
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/@Noedius', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 6.2a2.9 2.9 0 0 0-2-2C17.9 3.8 12 3.8 12 3.8s-5.9 0-7.6.4a2.9 2.9 0 0 0-2 2A30.7 30.7 0 0 0 2 12a30.7 30.7 0 0 0 .4 5.8 2.9 2.9 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.9 2.9 0 0 0 2-2A30.7 30.7 0 0 0 22 12a30.7 30.7 0 0 0-.4-5.8ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>' },
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/Noedius/reels/', hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'], icon: '<span aria-hidden="true">f</span>' },
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/@noediusx', hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'], icon: '<span aria-hidden="true">♪</span>' },
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/noedius/', hosts: ['instagram.com', 'www.instagram.com'], icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5-3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>' }
};
const STORAGE_KEY = 'noedius-social-studio-v1';
const $ = (id) => document.getElementById(id);
const defaults = () => ({ title: '', titleEdited: false, titleSource: 'youtube', emoji: '🔥', closing: '¡Apóyame con tu like, comenta y comparte!', format: 'text', linkMode: 'latest', profiles: Object.fromEntries(Object.entries(PLATFORMS).map(([key, value]) => [key, value.url])), manual: {}, included: Object.fromEntries(Object.keys(PLATFORMS).map(key => [key, true])) });
let state = defaults();
let dataset = null;
let timer;
let loading = false;

export function safeUrl(value, key) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && PLATFORMS[key]?.hosts.includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function isVideoUrl(value, key) {
  if (!safeUrl(value, key)) return false;
  const url = new URL(value);
  const path = url.pathname;
  if (key === 'youtube') return url.hostname === 'youtu.be' ? /^\/[\w-]{11}\/?$/.test(path) : (/^\/watch\/?$/.test(path) && /^[\w-]{11}$/.test(url.searchParams.get('v') || '')) || /^\/(shorts|live)\/[\w-]{11}\/?$/.test(path);
  if (key === 'facebook') return url.hostname === 'fb.watch' ? path.length > 2 : /\/(reel|videos)\/[^/]+/.test(path) || (path.startsWith('/watch') && !!url.searchParams.get('v')) || (path === '/video.php' && !!url.searchParams.get('v')) || /\/share\/(r|v)\/[^/]+/.test(path);
  if (key === 'tiktok') return ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) ? path.length > 2 : /\/@[^/]+\/video\/\d+/.test(path) || /^\/t\/[\w-]+/.test(path);
  return /^\/(reel|reels|p|tv)\/[^/]+/.test(path);
}

export function sameProfile(first, second) {
  const clean = value => { try { const url = new URL(value); return url.hostname.replace(/^www\./, '').toLowerCase() + url.pathname.replace(/\/+$/, '').toLowerCase(); } catch { return ''; } };
  return !!clean(first) && clean(first) === clean(second);
}

export function formatPost(title, links, closing, format = 'text', emoji = '🔥') {
  const heading = [emoji, title.trim().replace(/^(?:🔥|🎬|✨)\s*/u, '')].filter(Boolean).join(' ');
  const lines = [heading];
  for (const { name, url } of links) {
    const label = format === 'markdown' ? `_**${name}**_:` : format === 'whatsapp' ? `_*${name}*_:` : `${name}:`;
    lines.push(`${label}\n${url}`);
  }
  if (closing.trim()) lines.push(format === 'text' ? closing.trim() : format === 'whatsapp' ? `_${closing.trim()}_` : `*${closing.trim()}*`);
  return lines.join('\n\n');
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== 'object') return;
    for (const key of ['title', 'closing']) if (typeof stored[key] === 'string') state[key] = stored[key].slice(0, key === 'title' ? 500 : 300);
    state.titleEdited = stored.titleEdited === true;
    if (Object.hasOwn(PLATFORMS, stored.titleSource)) state.titleSource = stored.titleSource;
    if (['🔥', '🎬', '✨', ''].includes(stored.emoji)) state.emoji = stored.emoji;
    if (['text', 'whatsapp', 'markdown'].includes(stored.format)) state.format = stored.format;
    if (['latest', 'profiles'].includes(stored.linkMode)) state.linkMode = stored.linkMode;
    for (const key of Object.keys(PLATFORMS)) {
      if (safeUrl(stored.profiles?.[key], key)) state.profiles[key] = safeUrl(stored.profiles[key], key);
      if (isVideoUrl(stored.manual?.[key], key)) state.manual[key] = safeUrl(stored.manual[key], key);
      if (typeof stored.included?.[key] === 'boolean') state.included[key] = stored.included[key];
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('save-status').textContent = 'Guardado en este navegador'; }
  catch { $('save-status').textContent = 'Guardado solo en esta pestaña'; }
}

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(timer);
  timer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function detected(key) {
  const item = dataset?.platforms?.[key];
  if (!item || !sameProfile(item.profileUrl, state.profiles[key])) return null;
  return item;
}

function getLink(key) {
  const item = detected(key);
  if (state.linkMode === 'profiles') return { url: state.profiles[key], kind: 'profile' };
  if (isVideoUrl(state.manual[key], key)) return { url: state.manual[key], kind: 'manual' };
  if (item && isVideoUrl(item.url, key)) return { url: safeUrl(item.url, key), kind: item.stale || item.status !== 'ok' ? 'stale' : 'detected' };
  return { url: state.profiles[key], kind: 'fallback' };
}

function buildNetworks() {
  $('networks').replaceChildren();
  $('profile-settings').replaceChildren();
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    const card = element('article', 'network');
    const row = element('div', 'network-top');
    const icon = element('span', `network-icon ${key}`);
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = platform.icon; // Trusted, static bundled icon markup only.
    const name = element('div', 'network-name');
    name.append(element('strong', '', platform.name));
    const profile = element('a', 'profile-link', new URL(state.profiles[key]).pathname.replace(/\/$/, ''));
    profile.href = state.profiles[key]; profile.target = '_blank'; profile.rel = 'noopener noreferrer'; profile.id = `profile-link-${key}`;
    name.append(profile);
    const status = element('span', 'network-state', 'Sin verificar'); status.id = `status-${key}`;
    const include = element('label', 'include-label');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.included[key]; checkbox.setAttribute('aria-label', `Incluir ${platform.name}`);
    checkbox.addEventListener('change', () => { state.included[key] = checkbox.checked; save(); render(); });
    include.append(checkbox); row.append(icon, name, status, include);
    const details = document.createElement('details');
    const summary = element('summary', '', 'Ver detección o pegar enlace');
    const info = element('p'); info.id = `info-${key}`;
    const label = element('label', '', `Enlace del video de ${platform.name} (opcional)`); label.htmlFor = `video-${key}`;
    const input = document.createElement('input'); input.type = 'url'; input.inputMode = 'url'; input.id = `video-${key}`; input.value = state.manual[key] || ''; input.placeholder = 'https://…'; input.autocomplete = 'off'; input.setAttribute('aria-describedby', `error-${key}`);
    const error = element('span', 'validation-error'); error.id = `error-${key}`;
    input.addEventListener('input', () => {
      const value = input.value.trim(); const valid = !value || isVideoUrl(value, key);
      input.setAttribute('aria-invalid', String(!valid)); error.textContent = valid ? '' : `Introduce un enlace HTTPS a un video de ${platform.name}.`;
      if (valid) { if (value) state.manual[key] = safeUrl(value, key); else delete state.manual[key]; save(); }
      render();
    });
    const open = element('a', 'text-button', 'Abrir video / perfil ↗'); open.id = `open-${key}`; open.target = '_blank'; open.rel = 'noopener noreferrer';
    details.append(summary, info, label, input, error, open); card.append(row, details); $('networks').append(card);

    const field = element('div');
    const profileLabel = element('label', '', `Canal de ${platform.name}`); profileLabel.htmlFor = `profile-${key}`;
    const profileInput = document.createElement('input'); profileInput.type = 'url'; profileInput.id = `profile-${key}`; profileInput.value = state.profiles[key]; profileInput.inputMode = 'url'; profileInput.autocomplete = 'off'; profileInput.setAttribute('aria-describedby', `profile-error-${key}`);
    const profileError = element('span', 'validation-error'); profileError.id = `profile-error-${key}`;
    profileInput.addEventListener('change', () => {
      const value = safeUrl(profileInput.value.trim(), key);
      profileError.textContent = value ? '' : `Usa un enlace HTTPS válido de ${platform.name}.`;
      profileInput.setAttribute('aria-invalid', String(!value));
      if (!value) { render(); return; }
      if (!sameProfile(value, state.profiles[key])) delete state.manual[key];
      state.profiles[key] = value; profile.href = value; profile.textContent = new URL(value).pathname.replace(/\/$/, ''); input.value = state.manual[key] || '';
      input.removeAttribute('aria-invalid'); error.textContent = '';
      if (!state.titleEdited) updateDetectedTitle();
      save(); render();
    });
    field.append(profileLabel, profileInput, profileError); $('profile-settings').append(field);
  }
}

function currentLinks() {
  return Object.entries(PLATFORMS).filter(([key]) => state.included[key]).map(([key, platform]) => ({ key, name: platform.name, ...getLink(key) }));
}

function render() {
  const links = currentLinks();
  const title = state.title.trim();
  const post = formatPost(title, links, state.closing, state.format, state.emoji);
  $('title-count').textContent = `${state.title.length}/500`;
  $('network-count').textContent = `${links.length} seleccionad${links.length === 1 ? 'o' : 'os'}`;
  const detectedTitle = detected(state.titleSource)?.title;
  $('use-detected').disabled = !detectedTitle;
  for (const key of Object.keys(PLATFORMS)) {
    const item = detected(key); const link = getLink(key); const status = $(`status-${key}`);
    let text = 'Sin verificar', className = '';
    if (link.kind === 'profile') text = 'Perfil';
    else if (link.kind === 'manual') { text = 'Manual'; className = 'manual'; }
    else if (link.kind === 'detected') { text = 'Detectado'; className = 'ok'; }
    else if (link.kind === 'stale') { text = 'Dato anterior'; className = 'stale'; }
    else if (dataset) { text = 'Usando perfil'; className = 'warning'; }
    status.textContent = text; status.className = `network-state ${className}`;
    const detail = [];
    if (item?.title) detail.push(item.title);
    if (item?.publishedAt && !Number.isNaN(Date.parse(item.publishedAt))) detail.push(`Publicado: ${dateLabel(item.publishedAt)}.`);
    if (item?.message) detail.push(item.message);
    if (!item) detail.push(dataset ? 'Sin datos para este canal. La consulta automática usa channels.json.' : 'Aún no se ha realizado una consulta. Puedes pegar el enlace del video.');
    if (link.kind === 'stale') detail.push('No se pudo confirmar que siga siendo el video más reciente.');
    if (link.kind === 'manual') detail.push('Estás usando un enlace añadido manualmente. Bórralo para volver a la detección.');
    $(`info-${key}`).textContent = detail.join(' ');
    $(`open-${key}`).href = link.url;
  }
  $('preview').replaceChildren();
  const heading = element('h3', title ? '' : 'empty-title', title ? [state.emoji, title.replace(/^(?:🔥|🎬|✨)\s*/u, '')].filter(Boolean).join(' ') : 'Tu próximo mensaje empieza aquí…');
  $('preview').append(heading);
  for (const link of links) {
    const block = element('p', 'preview-network'); block.append(element('strong', '', `${link.name}:`));
    const anchor = element('a', '', link.url); anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; block.append(anchor); $('preview').append(block);
  }
  if (state.closing.trim()) $('preview').append(element('p', 'closing-preview', state.closing.trim()));
  $('preview').hidden = state.format !== 'text'; $('code-preview').hidden = state.format === 'text'; $('code-preview').textContent = post;
  const fallbacks = links.filter(link => link.kind === 'fallback').length;
  const stale = links.filter(link => link.kind === 'stale').length;
  $('preview-note').textContent = !title ? 'Completa el título para copiar tu publicación.' : !links.length ? 'Selecciona al menos una red para compartir.' : fallbacks ? `${fallbacks} ${fallbacks === 1 ? 'red usa su perfil' : 'redes usan su perfil'}: no hay un enlace al último video confirmado.` : stale ? 'Hay enlaces de consultas anteriores. Confírmalos antes de compartir.' : 'Tu mensaje está listo. Revisa los enlaces y dale a copiar.';
  const hasInvalid = [...document.querySelectorAll('[aria-invalid="true"]')].length > 0;
  $('copy').disabled = !title || !links.length || hasInvalid; $('download').disabled = $('copy').disabled;
  if (hasInvalid) $('preview-note').textContent = 'Corrige los enlaces marcados antes de copiar.';
  $('character-count').textContent = `${post.length.toLocaleString('es')} caracteres`;
  $('mode-hint').textContent = state.linkMode === 'profiles' ? 'Comparte las páginas de tus canales, como en tu formato original.' : 'Si una red no permite la consulta, se usará su perfil hasta que pegues el enlace del video.';
  document.querySelectorAll('[data-format]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.format === state.format)));
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'fecha no disponible' : new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(date);
}

function updateDetectedTitle(force = false) {
  const item = detected(state.titleSource);
  if (item?.title && (force || !state.titleEdited)) {
    state.title = String(item.title).slice(0, 500); state.titleEdited = false;
    $('post-title').value = state.title;
  }
}

async function refresh(manual = false) {
  if (loading) return;
  loading = true; $('refresh').disabled = true; $('refresh').setAttribute('aria-busy', 'true');
  $('sync-title').textContent = 'Leyendo la última consulta…';
  try {
    const response = await fetch(`data/latest.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('No se pudo cargar la consulta');
    const data = await response.json();
    if (data.schemaVersion !== 1 || !data.platforms || typeof data.platforms !== 'object') throw new Error('Datos no válidos');
    dataset = data;
    updateDetectedTitle(); save();
    const ok = Object.entries(data.platforms).filter(([key, value]) => Object.hasOwn(PLATFORMS, key) && value.status === 'ok' && !value.stale && isVideoUrl(value.url, key)).length;
    const date = data.updatedAt && !Number.isNaN(Date.parse(data.updatedAt)) ? dateLabel(data.updatedAt) : null;
    $('sync-title').textContent = date ? `Última consulta · ${date} (Perú)` : 'Primera consulta pendiente';
    $('sync-detail').textContent = date ? `${ok} de 4 redes con video detectado. Búsqueda automática cada hora; puede haber retrasos.` : 'El primer flujo de GitHub actualizará los canales. Puedes completar el mensaje manualmente.';
    if (manual) notify('Datos recargados. Para una nueva búsqueda, abre GitHub Actions.');
  } catch {
    $('sync-title').textContent = 'No se pudo cargar la consulta';
    $('sync-detail').textContent = 'Comprueba tu conexión o ejecuta la búsqueda en GitHub. Puedes pegar los enlaces manualmente.';
    if (manual) notify('No se pudieron cargar datos nuevos. Tus cambios siguen aquí.');
  } finally {
    loading = false; $('refresh').disabled = false; $('refresh').removeAttribute('aria-busy'); render();
  }
}

function syncFields() {
  $('post-title').value = state.title; $('closing').value = state.closing; $('title-source').value = state.titleSource; $('emoji').value = state.emoji;
  document.querySelector(`input[name="link-mode"][value="${state.linkMode}"]`).checked = true;
}

async function copy() {
  const text = formatPost(state.title, currentLinks(), state.closing, state.format, state.emoji);
  try {
    await navigator.clipboard.writeText(text);
    notify('Publicación copiada. ¡Lista para compartir!');
  } catch {
    const field = document.createElement('textarea'); field.value = text; field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'; document.body.append(field); field.select();
    const success = document.execCommand('copy'); field.remove(); $('copy').focus();
    notify(success ? 'Publicación copiada.' : 'Tu navegador bloqueó la copia. Usa «Descargar .txt».');
  }
}

async function init() {
  try {
    const response = await fetch('channels.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const config = await response.json();
      for (const key of Object.keys(PLATFORMS)) if (safeUrl(config[key]?.url, key)) state.profiles[key] = safeUrl(config[key].url, key);
    }
  } catch { /* Bundled Noedius defaults remain available offline. */ }
  loadState(); syncFields(); buildNetworks(); render();
  $('post-title').addEventListener('input', event => { state.title = event.target.value; state.titleEdited = !!state.title.trim(); save(); render(); });
  $('closing').addEventListener('input', event => { state.closing = event.target.value; save(); render(); });
  $('title-source').addEventListener('change', event => { state.titleSource = event.target.value; updateDetectedTitle(true); save(); render(); });
  $('emoji').addEventListener('change', event => { state.emoji = event.target.value; save(); render(); });
  $('use-detected').addEventListener('click', () => { updateDetectedTitle(true); save(); render(); notify('Título detectado aplicado.'); });
  document.querySelectorAll('input[name="link-mode"]').forEach(input => input.addEventListener('change', () => { state.linkMode = input.value; save(); render(); }));
  document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => { state.format = button.dataset.format; save(); render(); }));
  $('refresh').addEventListener('click', () => refresh(true));
  $('copy').addEventListener('click', copy);
  $('download').addEventListener('click', () => {
    const text = formatPost(state.title, currentLinks(), state.closing, state.format, state.emoji);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `noedius-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Texto descargado.');
  });
  $('reset').addEventListener('click', () => { state = defaults(); updateDetectedTitle(true); syncFields(); buildNetworks(); save(); render(); notify('Canales y mensaje de Noedius restablecidos.'); });
  refresh();
}

if (typeof document !== 'undefined') init();
