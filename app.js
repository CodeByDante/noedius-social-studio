const PLATFORMS = {
  youtube: {name:'YouTube',url:'https://www.youtube.com/@Noedius',hosts:['youtube.com','www.youtube.com','m.youtube.com','youtu.be']},
  facebook: {name:'Facebook',url:'https://www.facebook.com/Noedius/reels/',hosts:['facebook.com','www.facebook.com','m.facebook.com','fb.watch']},
  tiktok: {name:'TikTok',url:'https://www.tiktok.com/@noediusx',hosts:['tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com']},
  instagram: {name:'Instagram',url:'https://www.instagram.com/noedius/',hosts:['instagram.com','www.instagram.com']}
};
const $ = id => document.getElementById(id);
const PROFILES = Object.fromEntries(Object.entries(PLATFORMS).map(([key,value])=>[key,value.url]));
const CLOSING = '¡Apóyame con tu like, comenta y comparte!';
let dataset = null;
let liveApi = '';
let busy = false;
let clipboardText = '';
let lastVideoUrl = null;
let toastTimer;

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
export function selectLatestVideo(data, profiles = PROFILES, now = Date.now()) {
  const valid = Object.entries(PLATFORMS).map(([key]) => {
    const item = data?.platforms?.[key];
    const date = Date.parse(item?.publishedAt);
    if (!item || item.status !== 'ok' || item.stale || typeof item.title !== 'string' || !item.title.trim() ||
        !sameProfile(item.profileUrl, profiles[key]) || !isVideoUrl(item.url,key) ||
        !Number.isFinite(date) || date > now) return null;
    return { key, ...item };
  }).filter(Boolean);
  return valid.find(item => item.key === 'youtube') || valid.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0] || null;
}

function knownVideo(data) {
  return Object.keys(PLATFORMS).map(key=>({key,...data?.platforms?.[key]})).find(item=>
    typeof item.title === 'string' && item.title.trim() && sameProfile(item.profileUrl,PROFILES[item.key]) && isVideoUrl(item.url,item.key)) || null;
}
function node(tag, className, text) {
  const element=document.createElement(tag); if(className)element.className=className;
  if(text!==undefined)element.textContent=text; return element;
}
function dateLabel(value) {
  if(!value || Number.isNaN(Date.parse(value)))return 'fecha no disponible';
  return new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(value));
}
function notify(message) {
  $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);
}
function render() {
  const primary=selectLatestVideo(dataset);
  const display=primary || knownVideo(dataset);
  lastVideoUrl=primary?.url || null;
  $('latest-video').disabled=!lastVideoUrl || busy;
  $('latest-video').title=primary ? 'Abrir último video de '+PLATFORMS[primary.key].name : 'No hay un último video verificado disponible';
  $('platform-status').replaceChildren();
  const links=[]; const profiles=[]; const older=[];
  for(const [key,platform] of Object.entries(PLATFORMS)) {
    const item=dataset?.platforms?.[key];
    const matching=item && sameProfile(item.profileUrl,PROFILES[key]);
    const hasVideo=matching && isVideoUrl(item.url,key);
    const fresh=hasVideo && item.status==='ok' && !item.stale;
    const label=fresh?'Verificado':hasVideo?'Anterior':'Perfil';
    const status=node('span',fresh?'ok':hasVideo?'old':'',platform.name+' · '+label);
    const dot=node('i'); dot.setAttribute('aria-hidden','true');status.prepend(dot);
    $('platform-status').append(status);
    links.push({name:platform.name,url:hasVideo?safeUrl(item.url,key):PROFILES[key]});
    if(hasVideo&&!fresh)older.push(platform.name);
    if(!hasVideo)profiles.push(platform.name);
  }
  $('message').replaceChildren();
  if(display) {
    const title=display.title.trim().replace(/^(?:🔥|🎬|✨)\s*/u,'');
    $('message').append(node('h2','','🔥 '+title));
    for(const link of links) {
      const line=node('p','network-line');
      line.append(node('strong','',link.name+':'),node('span','',link.url)); $('message').append(line);
    }
    $('message').append(node('p','closing',CLOSING));
    clipboardText=formatPost(display.title,links,CLOSING);
  } else {
    $('message').append(node('p','empty','Pulsa Actualizar para buscar el último video.'));
    clipboardText='';
  }
  $('copy-card').setAttribute('aria-disabled',String(!clipboardText));
  $('copy-card').tabIndex=clipboardText?0:-1;
  $('copy-hint').textContent=clipboardText?'Clic en el mensaje para copiar.':'Aún no hay un título de video verificado.';
  const notes=[];
  if(profiles.length)notes.push(profiles.join(' / ')+' usan el perfil: no se pudo verificar su último video.');
  if(older.length)notes.push(older.join(' y ')+(older.length===1?' conserva un enlace anterior; no se pudo verificar ahora.':' conservan enlaces anteriores; no se pudieron verificar ahora.'));
  $('notice').textContent=notes.join(' ');
}
function validDataset(value) {return value && value.schemaVersion===1 && value.platforms && typeof value.platforms==='object';}
async function savedResults(silent=false) {
  try {
    const response=await fetch('data/latest.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Unavailable');
    const result=await response.json(); if(!validDataset(result))throw new Error('Invalid response');
    if(dataset && Date.parse(result.updatedAt)<=Date.parse(dataset.updatedAt))return;
    dataset=result;render();
    if(!silent)$('status').textContent='Consulta guardada · '+dateLabel(result.updatedAt)+' (Perú)';
  } catch {
    if(!silent)$('status').textContent='No se pudo cargar la consulta guardada. Pulsa Actualizar.';
  }
}
async function refresh() {
  if(busy)return;
  if(!liveApi){notify('La búsqueda en directo no está disponible. Inténtalo de nuevo más tarde.');return;}
  busy=true;$('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');$('refresh-label').textContent='Buscando…';
  $('status').textContent='Consultando tus canales ahora…';render();
  const previous=selectLatestVideo(dataset)?.url;
  try {
    const response=await fetch(liveApi,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Unavailable');
    const result=await response.json();if(!validDataset(result))throw new Error('Invalid response');
    for(const key of Object.keys(PLATFORMS)) {
      const current=dataset?.platforms?.[key], incoming=result.platforms[key];
      if(current && sameProfile(current.profileUrl,PROFILES[key]) && isVideoUrl(current.url,key) && (!incoming || !isVideoUrl(incoming.url,key))) {
        result.platforms[key]={...current,status:'unavailable',stale:true,checkedAt:result.updatedAt,message:'No se pudo verificar ahora. Se conserva el dato anterior.'};
      }
    }
    dataset=result;
    const primary=selectLatestVideo(result);
    $('status').textContent=primary ? (primary.url!==previous?'Último video encontrado':'Consulta realizada · Sin cambios')+' · '+dateLabel(result.updatedAt)+' (Perú)' : 'Consulta realizada: las redes no permitieron verificar un video ahora.';
    notify(primary?'Búsqueda terminada. Mensaje actualizado.':'No se pudo confirmar el último video. Se conservan los enlaces anteriores.');
  } catch {
    $('status').textContent='La búsqueda en directo no respondió. Se conserva la consulta anterior.';
    notify('No se pudo consultar ahora. Inténtalo de nuevo.');
  } finally {
    busy=false;$('refresh').disabled=false;$('refresh').removeAttribute('aria-busy');$('refresh-label').textContent='Actualizar';render();
  }
}
async function copy() {
  if(!clipboardText)return;
  try {await navigator.clipboard.writeText(clipboardText);notify('Mensaje copiado.');}
  catch {
    const field=document.createElement('textarea');field.value=clipboardText;
    field.style.cssText='position:fixed;opacity:0;width:1px;height:1px';document.body.append(field);field.select();
    const copied=document.execCommand('copy');field.remove();$('copy-card').focus();
    notify(copied?'Mensaje copiado.':'No se pudo copiar. Selecciona el texto y usa Ctrl+C.');
  }
}
async function init() {
  $('refresh').addEventListener('click',refresh);
  $('latest-video').addEventListener('click',()=>{if(lastVideoUrl)window.open(lastVideoUrl,'_blank','noopener,noreferrer');});
  $('copy-card').addEventListener('click',copy);
  $('copy-card').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();copy();}});
  render();
  try {
    const response=await fetch('app-config.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(response.ok) {
      const config=await response.json();
      const url=new URL(config.liveApi);
      if(url.protocol==='https:'&&url.hostname==='noedius-live-api.mauro12mendezyt.chatgpt.site'&&url.pathname==='/api/latest'&&!url.username&&!url.password)liveApi=url.href;
    }
  }catch{/* The saved results remain usable. */}
  await savedResults();
  setInterval(()=>{if(document.visibilityState==='visible'&&!busy)savedResults(true);},60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!busy)savedResults(true);});
}
if(typeof document!=='undefined')init();


