# Colector de publicaciones

La web es estática. Este colector se ejecuta en GitHub Actions y publica únicamente metadatos en `data/latest.json`. No descarga videos, no guarda contraseñas/cookies y no envía tokens al navegador.

## Sin claves

- **YouTube:** resuelve el ID del canal y consulta el feed público RSS que incluye publicaciones de videos y Shorts. Si falla, intenta metadatos públicos con yt-dlp.
- **Facebook, Instagram y TikTok:** intenta obtener la lista pública con yt-dlp. Estas plataformas pueden exigir inicio de sesión o bloquear consultas automatizadas. No hay garantía de extracción anónima.
- Si no puede comprobar título, fecha y enlace, devuelve `unavailable`. Conserva un resultado anterior del mismo perfil con `stale: true`, sin presentarlo como actualizado.
- Compara fechas; un video fijado no gana por aparecer primero. No relaciona automáticamente la misma pieza entre redes: revisa que los enlaces correspondan al video que quieres compartir.

## APIs oficiales opcionales

Añade los valores como **Repository secrets** en **Settings → Secrets and variables → Actions** del repositorio. Nunca los escribas en `channels.json`, JavaScript, HTML o archivos versionados. Cada secreto es independiente; puedes activar una sola plataforma.

| Plataforma | Secrets | Requisitos |
| --- | --- | --- |
| YouTube | `YOUTUBE_API_KEY` | Clave con YouTube Data API v3 activada. Lee la playlist de subidas. |
| Facebook | `FACEBOOK_PAGE_ID`, `FACEBOOK_ACCESS_TOKEN` | Token autorizado de la página, permisos de lectura correspondientes y acceso a metadatos de sus videos. |
| Instagram | `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` | Cuenta profesional y token de Instagram Login o Facebook Login con los permisos de lectura correspondientes. |
| TikTok | `TIKTOK_ACCESS_TOKEN` | App aprobada con Display API, autorización del usuario y scope `video.list`. |

El colector comprueba el perfil: Facebook compara el enlace/ID de la página, Instagram compara `username`, TikTok compara el `@handle` de los enlaces que devuelve la API para el usuario autorizado. Un token de otra cuenta no se usa para rellenar Noedius.

Los tokens de Meta se envían por `Authorization: Bearer`. No se imprimen respuestas de error ni valores de los secrets. No se implementa renovación OAuth: cuando caduquen, reemplázalos en Secrets.

### Comportamiento de las APIs

- **YouTube:** `channels.list` → playlist de subidas → `playlistItems.list`, incluidos videos y Shorts. Usa la fecha de publicación del video, no el orden de resultados.
- **Facebook:** Graph API `v27.0`. Intenta los perímetros `videos` y `video_reels`; compara `created_time`. Su disponibilidad de lectura depende de los permisos de la app/página y de Meta. La documentación de referencia y las guías de lectura de Reels presentan diferencias; si Meta rechaza la operación se usa el intento público y, si también falla, entrada manual. La integración no se anuncia como operativa hasta obtener una respuesta real.
- **Instagram:** Graph API `v27.0`, `/USER_ID/media`, filtra `media_type=VIDEO` y compara `timestamp`. Las imágenes se excluyen. Prueba el host de Instagram Login y el de Facebook Login, validando el usuario antes de consultar contenido.
- **TikTok:** `POST https://open.tiktokapis.com/v2/video/list/`, obtiene `id,title,video_description,create_time,share_url`; utiliza la primera página de hasta 20 publicaciones, que la API ordena por creación descendente. No usa la posición de videos fijados.

## Ejecución y comprobaciones

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p test_collector.py -v
python scripts/collect.py --config channels.json --output data/latest.json
```

El workflow `refresh.yml` se inicia al publicar cambios en `main`, al pulsar **Run workflow** y aproximadamente una vez por hora. GitHub puede retrasar las ejecuciones programadas. La consulta tiene un límite de cuatro minutos y cada extracción yt-dlp un límite de 45 segundos. No se comprometen resultados parciales: el JSON se reemplaza de forma atómica.

## Fuentes técnicas

- [YouTube: recuperar videos subidos](https://developers.google.com/youtube/data/sample_requests)
- [Meta Graph API: versión actual](https://developers.facebook.com/docs/graph-api/)
- [Meta: Page Videos](https://developers.facebook.com/docs/graph-api/reference/page/videos)
- [Meta: Page Video Reels](https://developers.facebook.com/docs/graph-api/reference/page/video_reels/)
- [Meta: limitaciones de Page Post y consulta de Reels](https://developers.facebook.com/docs/graph-api/reference/page-post/)
- [Instagram Media: campos, tipos y permisos](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/)
- [TikTok v2: List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list)
- [TikTok: autorización de Display API](https://developers.tiktok.com/docs/en/display-api-get-started)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
