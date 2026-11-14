# API de consulta en directo

Endpoint público de solo lectura:

`GET https://noedius-live-api.mauro12mendezyt.chatgpt.site/api/latest`

Consulta los cuatro perfiles fijos de Noedius al recibir la petición. No acepta URLs arbitrarias, no almacena claves ni realiza escrituras en GitHub. Cada fuente tiene un límite de 15 segundos; los errores se devuelven como `unavailable`. El respaldo de GitHub se marca `stale: true`.

El servicio está desplegado en Sites como Worker ESM. `worker/index.js` exporta `default.fetch`. La fuente también se conserva en el repositorio privado de servicio gestionado por Sites. Esta copia permite revisar y reutilizar la implementación.

La política CORS permite la web de GitHub Pages y el preview local. La API no contiene información privada. No es un proxy general ni intenta saltar bloqueos de las redes.

Pruebas sin dependencias: `node --test tests/worker.test.mjs` desde esta carpeta.
