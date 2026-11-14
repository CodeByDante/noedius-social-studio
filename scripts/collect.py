#!/usr/bin/env python3
"""Collect public publication metadata. Never downloads videos or stores cookies."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import html
import json
import os
from pathlib import Path
import re
import socket
import ipaddress
import subprocess
import sys
from urllib.parse import urlsplit, urlencode, parse_qs
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

DEFAULTS = {
    'youtube': 'https://www.youtube.com/@Noedius',
    'facebook': 'https://www.facebook.com/Noedius/reels/',
    'tiktok': 'https://www.tiktok.com/@noediusx',
    'instagram': 'https://www.instagram.com/noedius/',
}
HOSTS = {
    'youtube': {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'},
    'facebook': {'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'},
    'tiktok': {'tiktok.com', 'www.tiktok.com'},
    'instagram': {'instagram.com', 'www.instagram.com'},
}
FETCH_HOSTS = set().union(*HOSTS.values()) | {'www.googleapis.com', 'graph.facebook.com', 'graph.instagram.com', 'open.tiktokapis.com'}
NS = {'atom': 'http://www.w3.org/2005/Atom', 'yt': 'http://www.youtube.com/xml/schemas/2015'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def valid_url(platform: str, value: object, video: bool = False) -> str:
    if not isinstance(value, str) or len(value) > 2000:
        raise ValueError('Enlace no válido')
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS[platform]:
        raise ValueError('Usa un enlace HTTPS de la plataforma seleccionada')
    if parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('El enlace no admite credenciales ni puertos personalizados')
    if not parsed.path.strip('/'):
        raise ValueError('Falta el canal o la publicación en el enlace')
    if video:
        patterns = {
            'youtube': r'^/(?:watch|shorts/[\w-]+|live/[\w-]+)$',
            'facebook': r'^/(?:reel/\d+|[^/]+/videos/\d+|watch/?)',
            'tiktok': r'^/@[^/]+/video/\d+',
            'instagram': r'^/(?:p|reel|tv)/[\w-]+',
        }
        if platform == 'youtube' and parsed.hostname == 'youtu.be':
            ok = re.fullmatch(r'/[\w-]{11}', parsed.path)
        else:
            ok = re.search(patterns[platform], parsed.path)
        if not ok:
            raise ValueError('No es un enlace directo de publicación verificado')
        if platform == 'youtube' and parsed.path == '/watch' and not re.search(r'(?:^|&)v=[\w-]{11}(?:&|$)', parsed.query):
            raise ValueError('Falta el ID del video')
    return value


def assert_public_host(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in FETCH_HOSTS:
        raise ValueError('Destino de red no permitido')
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        # Managed environments may resolve approved public hosts in their HTTPS
        # proxy rather than the local DNS resolver. Exact host allowlists still
        # forbid arbitrary names and private IP literals.
        addresses = []
    for result in addresses:
        if not ipaddress.ip_address(result[4][0]).is_global:
            raise ValueError('Destino privado no permitido')


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        assert_public_host(newurl)
        if req.has_header('Authorization') and urlsplit(req.full_url).hostname != urlsplit(newurl).hostname:
            raise ValueError('No se permite redirigir una petición autenticada a otro host')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str, token: str | None = None, data: dict | None = None) -> bytes:
    assert_public_host(url)
    headers = {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es,en;q=0.8'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.build_opener(SafeRedirect()).open(request, timeout=12) as response:
        body = response.read(8_000_001)
        if len(body) > 8_000_000:
            raise ValueError('Respuesta demasiado grande')
        return body


def clean_title(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return re.sub(r'\s+', ' ', ''.join(c for c in html.unescape(value) if ord(c) >= 32)).strip()[:500] or None


def date_value(value: object) -> datetime | None:
    try:
        if isinstance(value, (float, int)):
            return datetime.fromtimestamp(value, timezone.utc)
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def youtube_rss(profile: str) -> dict:
    path = urlsplit(profile).path
    match = re.match(r'/channel/(UC[\w-]{22})(?:/|$)', path)
    channel_id = match.group(1) if match else None
    if not channel_id:
        body = fetch(profile.rstrip('/') + '/videos').decode('utf-8', 'replace')
        # These fields identify the channel itself, rather than a recommended video's author.
        patterns = [r'<link[^>]+href="https://www\.youtube\.com/feeds/videos\.xml\?channel_id=(UC[\w-]{22})',
                    r'"externalId"\s*:\s*"(UC[\w-]{22})"',
                    r'<meta[^>]+itemprop="channelId"[^>]+content="(UC[\w-]{22})"',
                    r'<link[^>]+rel="canonical"[^>]+href="https://www\.youtube\.com/channel/(UC[\w-]{22})"']
        for pattern in patterns:
            match = re.search(pattern, body)
            if match:
                channel_id = match.group(1)
                break
    if not channel_id:
        raise ValueError('No se pudo resolver el ID público del canal')
    feed_url = 'https://www.youtube.com/feeds/videos.xml?' + urlencode({'channel_id': channel_id})
    try:
        body = fetch(feed_url)
    except urllib.error.HTTPError as error:
        # YouTube's feed occasionally returns a transient 404 for an existing
        # public channel. One normal retry is enough; do not retry bot checks.
        if error.code != 404:
            raise
        body = fetch(feed_url)
    xml = ET.fromstring(body)
    candidates = []
    for entry in xml.findall('atom:entry', NS):
        video_id = entry.findtext('yt:videoId', namespaces=NS)
        published = entry.findtext('atom:published', namespaces=NS)
        title = clean_title(entry.findtext('atom:title', namespaces=NS))
        when = date_value(published)
        if title and re.fullmatch(r'[\w-]{11}', video_id or '') and when and when <= datetime.now(timezone.utc):
            candidates.append({'title': title, 'url': 'https://www.youtube.com/watch?v=' + video_id, 'publishedAt': published, 'source': 'YouTube RSS'})
    if not candidates:
        raise ValueError('El feed no devolvió publicaciones públicas')
    return max(candidates, key=lambda item: date_value(item['publishedAt']))


def youtube_api(profile: str, key: str) -> dict:
    path = urlsplit(profile).path.strip('/').split('/')
    params = {'part': 'contentDetails', 'key': key}
    if path[0].startswith('@'):
        params['forHandle'] = path[0]
    elif path[0] == 'channel' and len(path) > 1:
        params['id'] = path[1]
    elif path[0] == 'user' and len(path) > 1:
        params['forUsername'] = path[1]
    else:
        raise ValueError('El API requiere @handle o /channel/ID')
    channels = json.loads(fetch('https://www.googleapis.com/youtube/v3/channels?' + urlencode(params)))
    playlist = channels['items'][0]['contentDetails']['relatedPlaylists']['uploads']
    params = {'part': 'snippet,contentDetails', 'playlistId': playlist, 'maxResults': 10, 'key': key}
    payload = json.loads(fetch('https://www.googleapis.com/youtube/v3/playlistItems?' + urlencode(params)))
    candidates = []
    for item in payload.get('items', []):
        snippet = item['snippet']
        title = clean_title(snippet.get('title'))
        video_id = snippet.get('resourceId', {}).get('videoId')
        published = item.get('contentDetails', {}).get('videoPublishedAt') or snippet.get('publishedAt')
        when = date_value(published)
        if title and video_id and when and when <= datetime.now(timezone.utc):
            candidates.append({'title': title, 'url': 'https://www.youtube.com/watch?v=' + video_id, 'publishedAt': published, 'source': 'YouTube Data API'})
    if not candidates:
        raise ValueError('El API no devolvió publicaciones')
    return max(candidates, key=lambda item: date_value(item['publishedAt']))


META_VERSION = 'v27.0'


def api_json(url: str, token: str, data: dict | None = None) -> dict:
    payload = json.loads(fetch(url, token=token, data=data))
    if not isinstance(payload, dict) or ('error' in payload and payload['error'].get('code') not in (None, 'ok')):
        raise ValueError('La API no autorizó la consulta')
    return payload


def profile_handle(profile: str) -> str:
    path = urlsplit(profile).path.strip('/').split('/')[0]
    return path.lstrip('@').casefold()


def newest_api_candidate(platform: str, entries: list, source: str) -> dict:
    candidates = []
    for item in entries:
        try:
            url = valid_url(platform, item.get('url'), video=True)
        except (ValueError, AttributeError):
            continue
        title = clean_title(item.get('title'))
        when = date_value(item.get('publishedAt'))
        if title and when and when <= datetime.now(timezone.utc):
            candidates.append({'title': title, 'url': url, 'publishedAt': when.isoformat().replace('+00:00', 'Z'), 'source': source})
    if not candidates:
        raise ValueError('La API no devolvió videos fechados con título y enlace')
    return max(candidates, key=lambda item: date_value(item['publishedAt']))


def facebook_api(profile: str, page_id: str, token: str) -> dict:
    if not re.fullmatch(r'\d+', page_id):
        raise ValueError('El ID de página debe ser numérico')
    origin = 'https://graph.facebook.com/' + META_VERSION + '/' + page_id
    identity = api_json(origin + '?' + urlencode({'fields': 'id,link'}), token)
    if str(identity.get('id')) != page_id:
        raise ValueError('El ID de la página no coincide')
    link = identity.get('link', '')
    valid_url('facebook', link)
    configured = profile_handle(profile)
    remote = profile_handle(link)
    configured_id = parse_qs(urlsplit(profile).query).get('id', [None])[0]
    if not ((configured == remote and configured != 'profile.php') or configured == page_id or configured_id == page_id):
        raise ValueError('El token pertenece a otra página de Facebook')
    entries = []
    # API edge availability differs by Page/app permissions and Meta releases.
    # Try both public video surfaces and order dated results rather than pinned position.
    for edge in ('videos', 'video_reels'):
        try:
            result = api_json(origin + '/' + edge + '?' + urlencode({'fields': 'id,title,description,created_time,permalink_url', 'limit': 50}), token)
        except Exception:
            continue
        for item in result.get('data', []):
            url = item.get('permalink_url')
            if isinstance(url, str) and url.startswith('/'):
                url = 'https://www.facebook.com' + url
            if not url and str(item.get('id', '')).isdigit():
                url = 'https://www.facebook.com/' + page_id + '/videos/' + str(item['id']) + '/'
            entries.append({'title': item.get('title') or item.get('description'), 'url': url, 'publishedAt': item.get('created_time')})
    return newest_api_candidate('facebook', entries, 'Facebook Graph API · ' + META_VERSION)


def instagram_api(profile: str, user_id: str, token: str) -> dict:
    if not re.fullmatch(r'\d+', user_id):
        raise ValueError('El ID de Instagram debe ser numérico')
    # Instagram Login and Facebook Login have different Graph hosts. Try both,
    # always verify username before fetching metadata and never follow API paging URLs.
    for hostname in ('graph.instagram.com', 'graph.facebook.com'):
        try:
            origin = 'https://' + hostname + '/' + META_VERSION + '/' + user_id
            identity = api_json(origin + '?' + urlencode({'fields': 'id,username'}), token)
            if str(identity.get('id')) != user_id or str(identity.get('username', '')).casefold() != profile_handle(profile):
                raise ValueError('El token pertenece a otra cuenta de Instagram')
            fields = 'id,caption,media_type,permalink,timestamp'
            response = api_json(origin + '/media?' + urlencode({'fields': fields, 'limit': 100}), token)
            videos = [{'title': item.get('caption'), 'url': item.get('permalink'), 'publishedAt': item.get('timestamp')} for item in response.get('data', []) if item.get('media_type') == 'VIDEO']
            return newest_api_candidate('instagram', videos, 'Instagram Graph API · ' + META_VERSION)
        except Exception:
            continue
    raise ValueError('No se pudo consultar la cuenta profesional de Instagram configurada')


def tiktok_api(profile: str, token: str) -> dict:
    fields = 'id,title,video_description,create_time,share_url'
    url = 'https://open.tiktokapis.com/v2/video/list/?' + urlencode({'fields': fields})
    response = api_json(url, token, {'max_count': 20})
    entries = []
    for item in response.get('data', {}).get('videos', []):
        share_url = item.get('share_url')
        # List Videos is scoped to the token owner; the returned public URL also
        # proves the owner's handle matches the configured channel.
        if not isinstance(share_url, str) or profile_handle(share_url) != profile_handle(profile):
            continue
        entries.append({'title': item.get('title') or item.get('video_description'), 'url': share_url, 'publishedAt': item.get('create_time')})
    return newest_api_candidate('tiktok', entries, 'TikTok Display API v2')


def ytdlp_metadata(platform: str, profile: str) -> dict:
    # A subprocess gives every provider a strict timeout; URLs never enter a shell.
    command = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--skip-download', '--flat-playlist', '--playlist-end', '12', '--dump-single-json', '--no-warnings', '--socket-timeout', '12', '--retries', '0', '--extractor-retries', '0', profile]
    result = subprocess.run(command, capture_output=True, text=True, timeout=45, check=False)
    if result.returncode or len(result.stdout) > 12_000_000:
        raise ValueError('La plataforma no expone una lista pública verificable')
    payload = json.loads(result.stdout)
    entries = payload.get('entries') or ([payload] if payload.get('id') else [])
    candidates = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        url = entry.get('webpage_url') or entry.get('url')
        if platform == 'youtube' and not str(url).startswith('https://') and re.fullmatch(r'[\w-]{11}', str(entry.get('id', ''))):
            url = 'https://www.youtube.com/watch?v=' + entry['id']
        if platform == 'tiktok' and not str(url).startswith('https://') and str(entry.get('id', '')).isdigit():
            url = profile.rstrip('/') + '/video/' + str(entry['id'])
        try:
            valid_url(platform, url, video=True)
        except ValueError:
            continue
        title = clean_title(entry.get('title') or entry.get('description'))
        when = date_value(entry.get('timestamp'))
        if when is None and entry.get('upload_date'):
            try:
                when = datetime.strptime(str(entry['upload_date']), '%Y%m%d').replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        # An undated entry could be a pinned old video. Never claim it is the latest.
        if title and when and when <= datetime.now(timezone.utc):
            candidates.append({'title': title, 'url': url, 'publishedAt': when.isoformat().replace('+00:00', 'Z'), 'source': 'Metadatos públicos · yt-dlp'})
    if not candidates:
        raise ValueError('No se pudo verificar fecha, título y enlace de las publicaciones')
    return max(candidates, key=lambda item: date_value(item['publishedAt']))


def collect_one(platform: str, profile: str, previous: dict | None = None) -> dict:
    base = {'profileUrl': profile, 'status': 'unavailable', 'title': None, 'url': None, 'publishedAt': None, 'source': '', 'message': '', 'stale': False, 'checkedAt': now()}
    try:
        valid_url(platform, profile)
        if platform == 'youtube':
            try:
                data = youtube_api(profile, os.environ['YOUTUBE_API_KEY']) if os.environ.get('YOUTUBE_API_KEY') else youtube_rss(profile)
            except Exception:
                data = ytdlp_metadata(platform, profile)
        else:
            try:
                if platform == 'facebook' and os.environ.get('FACEBOOK_PAGE_ID') and os.environ.get('FACEBOOK_ACCESS_TOKEN'):
                    data = facebook_api(profile, os.environ['FACEBOOK_PAGE_ID'], os.environ['FACEBOOK_ACCESS_TOKEN'])
                elif platform == 'instagram' and os.environ.get('INSTAGRAM_USER_ID') and os.environ.get('INSTAGRAM_ACCESS_TOKEN'):
                    data = instagram_api(profile, os.environ['INSTAGRAM_USER_ID'], os.environ['INSTAGRAM_ACCESS_TOKEN'])
                elif platform == 'tiktok' and os.environ.get('TIKTOK_ACCESS_TOKEN'):
                    data = tiktok_api(profile, os.environ['TIKTOK_ACCESS_TOKEN'])
                else:
                    raise ValueError('No se configuró la API oficial')
            except Exception:
                data = ytdlp_metadata(platform, profile)
        valid_url(platform, data['url'], video=True)
        base.update(data, status='ok', obtainedAt=now(), message='Última publicación pública encontrada. Comprueba que corresponde a la pieza que vas a compartir.')
    except Exception:
        # Preserve only a previously validated result for the SAME profile. It is explicitly stale.
        if previous and previous.get('profileUrl') == profile and previous.get('title') and previous.get('url'):
            try:
                valid_url(platform, previous['url'], video=True)
                base.update({key: previous.get(key) for key in ('title', 'url', 'publishedAt', 'source', 'obtainedAt')})
                base.update(stale=True, message='No se pudo actualizar. Se conserva la última publicación encontrada; revisa o pega el enlace actual.')
            except ValueError:
                pass
        if not base['message']:
            base['message'] = 'La plataforma no permitió verificar la publicación más reciente sin iniciar sesión. Pega el enlace del video para completar el texto.'
    return base


def run(config: Path, output: Path) -> dict:
    settings = json.loads(config.read_text('utf-8')) if config.exists() else {}
    profiles = {platform: settings.get(platform, {}).get('url', default) for platform, default in DEFAULTS.items()}
    # Fail before any requests when configuration is invalid.
    for platform, profile in profiles.items():
        valid_url(platform, profile)
    try:
        previous = json.loads(output.read_text('utf-8')).get('platforms', {})
    except (OSError, ValueError, AttributeError):
        previous = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = {platform: pool.submit(collect_one, platform, profile, previous.get(platform)) for platform, profile in profiles.items()}
        platforms = {platform: future.result() for platform, future in pending.items()}
    payload = {'schemaVersion': 1, 'updatedAt': now(), 'platforms': platforms}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + '.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    temporary.replace(output)
    for platform, item in platforms.items():
        print(f"{platform}: {item['status']}" + (' (datos anteriores)' if item['stale'] else ''))
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path('channels.json'))
    parser.add_argument('--output', type=Path, default=Path('data/latest.json'))
    args = parser.parse_args()
    run(args.config, args.output)
