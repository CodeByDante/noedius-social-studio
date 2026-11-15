# Noedius · Último video

Una pantalla negra, dos botones y el mensaje listo para copiar.

**Web:** https://codebydante.github.io/noedius-social-studio/

- **Actualizar:** consulta las fuentes públicas en ese momento mediante el servicio de lectura. Muestra el resultado real de cada red; una consulta bloqueada no se anuncia como actualización.
- **Último video:** abre el último video verificado de YouTube; si no está disponible, usa la publicación válida más reciente de otra red. El título y el destino corresponden al mismo video.
- **Clic en el mensaje:** copia el texto con los cuatro enlaces, los nombres en Markdown y el cierre «¡Apóyame con tu like, comenta y comparte!».

No hay formularios, ajustes ni credenciales en la página. Los canales de esta versión son los cuatro de Noedius.

## Actualización

GitHub Pages sirve la interfaz. El botón llama al servicio público de lectura configurado en `app-config.json`, que intenta consultar los cuatro perfiles en paralelo. La consulta puede tardar varios segundos. No ejecuta un workflow de GitHub ni espera a la próxima hora.

Las redes pueden bloquear consultas públicas o exigir acceso autorizado. En ese caso se conserva el enlace previo, marcado **Anterior**, o se usa el **Perfil** si no hay video verificable. **Anterior y Perfil no se anuncian como videos nuevos.** El título y el botón «Último video» priorizan YouTube para conservar el título completo.

Además, GitHub Actions conserva una consulta automática cada hora (minuto 17), al subir cambios y al ejecutar `Run workflow`. Es el respaldo que carga la página al abrirse. GitHub puede retrasar las ejecuciones. La página revisa el respaldo cada minuto mientras está visible, sin reemplazar una consulta en directo por otra más antigua.

**No recibe una notificación instantánea cuando publicas:** busca periódicamente y cuando pulsas Actualizar.

## Fuentes y límites

| Plataforma | Perfil |
| --- | --- |
| YouTube | https://www.youtube.com/@Noedius |
| Facebook | https://www.facebook.com/Noedius/reels/ |
| TikTok | https://www.tiktok.com/@noediusx |
| Instagram | https://www.instagram.com/noedius/ |

El servidor en directo usa únicamente datos públicos: RSS de YouTube y estructuras verificables de los perfiles. TikTok puede ocultar su lista de videos al servidor, aunque el colector horario con yt-dlp sí consiga leerla. Facebook e Instagram suelen requerir autorización. Los videos de cada red pueden ser piezas diferentes.

El colector horario admite las [APIs oficiales opcionales](scripts/README.md). Esas credenciales solo se usan en GitHub Actions, nunca en el navegador ni en el servidor público de lectura.

## Código

- `index.html`, `styles.css`, `app.js`: interfaz sin dependencias ni compilación.
- `app-config.json`: dirección pública del servicio en directo, sin secretos.
- `backend/worker/index.js`: fuente del servicio desplegado como Cloudflare Worker mediante Sites; solo GET y OPTIONS, canales fijos, CORS exacto y límites de tiempo.
- `scripts/collect.py`: consulta horaria con RSS, yt-dlp y APIs opcionales.
- `data/latest.json`: respaldo de metadatos; no contiene videos.

El servidor y GitHub Pages tienen despliegues independientes. Actualizar `backend/` en GitHub conserva su fuente, pero no vuelve a desplegar el servicio automáticamente.

## Desarrollo y pruebas

```sh
python3 scripts/preview.py
# http://127.0.0.1:3000
npm test
node --test backend/tests/worker.test.mjs
python3 -m unittest discover -s tests -p 'test_collector.py' -v
```

En GitHub, **Settings → Pages → Source: GitHub Actions**. El artefacto público incluye solo la interfaz, configuración pública, assets y metadatos. No incluye código de servidor, herramientas, pruebas ni secretos. El historial del repositorio conserva versiones previas.
