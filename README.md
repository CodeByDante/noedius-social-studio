# Noedius · Social Studio

Generador de textos para compartir los videos de Noedius en **YouTube, Facebook, TikTok e Instagram**, publicado en GitHub Pages.

**Web:** https://codebydante.github.io/noedius-social-studio/

## Uso

1. Abre la web. Carga la última consulta de los canales.
2. Revisa el título detectado. Puedes modificarlo o tomar el de otra red.
3. Elige **Últimos videos** o **Perfiles del canal**. Cada red muestra si el enlace es detectado, manual, anterior o un perfil de respaldo.
4. Completa los enlaces que falten desplegando «Ver detección o pegar enlace».
5. Copia en **Texto**, **WhatsApp** o **Markdown**, o descarga el `.txt`.

Los cambios del editor se guardan en tu navegador. Un enlace manual tiene prioridad hasta que lo borres. El texto nunca se publica automáticamente en tus redes.

## Consulta automática: alcance real

GitHub Pages solo sirve HTML, CSS y JavaScript. **No ejecuta un servidor para consultar redes**. El workflow [Actualizar canales y publicar](https://github.com/CodeByDante/noedius-social-studio/actions/workflows/refresh.yml) consulta las fuentes desde GitHub Actions y publica `data/latest.json`:

- Al subir cambios a `main`.
- Cada hora, en el minuto 17. GitHub puede retrasar ejecuciones y desactivar programaciones de repositorios públicos inactivos.
- Manualmente: **Actions → Actualizar canales y publicar → Run workflow**. Al terminar, pulsa «Recargar datos» en la web.

El botón «Recargar datos» lee los resultados publicados; no dispara una consulta nueva ni pide un token.

**YouTube** usa RSS público o su API oficial si configuras una clave. Se ordenan las publicaciones por fecha, incluyendo Shorts y videos largos que devuelva el feed de subidas. **Facebook, Instagram y TikTok** intentan metadatos públicos y admiten sus APIs oficiales con credenciales opcionales. Esas redes suelen exigir inicio de sesión, permisos de aplicación o una cuenta profesional; **no se garantiza extraer automáticamente todos los perfiles sin conectar las APIs**. Un fallo se muestra como fallo: nunca se inventan título, fecha o enlace.

La app no asume que el último video de cada red sea la misma pieza. Revisa los enlaces antes de compartir. Un dato anterior conservado se marca explícitamente como anterior.

Consulta la [configuración de APIs y limitaciones](scripts/README.md) para añadir secretos de las plataformas a GitHub Actions. **Nunca escribas tokens en HTML, JavaScript, `channels.json`, commits ni el navegador.** El token de GitHub no consulta tus redes sociales.

## Canales incluidos

| Red | Canal |
| --- | --- |
| YouTube | https://www.youtube.com/@Noedius |
| Facebook | https://www.facebook.com/Noedius/reels/ |
| TikTok | https://www.tiktok.com/@noediusx |
| Instagram | https://www.instagram.com/noedius/ |

Edita `channels.json` para cambiar los canales de la consulta automática. La configuración del editor es local; restablece sus preferencias si estabas utilizando otros canales.

## Ejemplo de salida

Este es solo un ejemplo de formato, no un video detectado:

```text
🔥 ¿Por qué Eris golpeó brutalmente a su hijo Ars? | Mushoku Tensei

YouTube:
https://www.youtube.com/@Noedius

Facebook:
https://www.facebook.com/Noedius/reels/

TikTok:
https://www.tiktok.com/@noediusx

Instagram:
https://www.instagram.com/noedius/

¡Apóyame con tu like, comenta y comparte!
```

## Desarrollo

HTML/CSS/JS sin dependencias de frontend y sin compilación. Python 3.12+ para el colector. Node 20+ para las pruebas del formateador.

```sh
python3 scripts/preview.py
# Abre http://127.0.0.1:3000

npm test
python3 -m unittest discover -s tests -p 'test_collector.py' -v

# Consulta real de metadatos (no descarga los videos)
python3 -m pip install -r requirements.txt
python3 scripts/collect.py --config channels.json --output data/latest.json
```

## Publicación

En **Settings → Pages**, el origen es **GitHub Actions**. El workflow sube solo HTML, CSS, JS, configuración pública, `assets/` y `data/`. Se excluyen herramientas, pruebas y credenciales. Los resultados se guardan en el repositorio para que puedan revisarse. La interfaz usa la zona horaria de Perú para las fechas.

Las tipografías DM Sans y Manrope se cargan de Google Fonts; si no están disponibles se usa Arial.
