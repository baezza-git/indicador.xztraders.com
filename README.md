# indicador.xztraders.com

Web del **Indicador Japonés** de XZ TRADERS. Para conseguirlo, el usuario:

1. Se registra en LBANK con el enlace de afiliado.
2. Deposita como mínimo 100 USDT.
3. Escribe su UID de LBANK en la web. Se comprueba al momento con la API de afiliados de LBANK y, si cumple, recibe el enlace del indicador.

La web se publica en **Netlify**. La comprobación es una función de Netlify (`/api/verify`) porque la clave de la API de LBANK no puede estar en la página: cualquiera podría verla, y además LBANK no deja que un navegador llame a su API directamente.

## Estructura

```
public/                    Web estática (lo que ve el visitante)
  index.html               Página principal
  assets/css/styles.css    Estilos (tokens de color y tipografía al inicio)
  assets/js/main.js        Enlaces, formulario del UID y animaciones
  assets/js/beams.js       Fondo animado del hero (three.js; si no hay WebGL se usa el fondo CSS)
  assets/img/              Logo, favicons e imagen para redes (og-cover.jpg)
  assets/fonts/            Fuentes Geist y Geist Mono (licencia OFL)
  assets/vendor/three/     three.js r180 (licencia MIT)
  _headers                 Cabeceras de seguridad
netlify/functions/verify.mjs  Función de Netlify: POST /api/verify
src/
  handler.js               Petición → respuesta (límite por IP, caché, errores)
  verify.js                Reglas: registrado con el enlace + depósito mínimo
  lbank.js                 Cliente firmado de la API de afiliados de LBANK
scripts/check-uid.mjs      Prueba la conexión con LBANK desde tu ordenador
test/                      Tests (npm test)
netlify.toml               Configuración de Netlify
```

## Cómo funciona la comprobación

`POST /api/verify` con `{ "uid": "LBA32323" }`:

1. `GET /affiliate-api/v2/invite/user/info`: el UID tiene que ser de tu equipo (`inviteResult`) y, por defecto, invitado directamente con tu enlace (`directInvitation`).
2. `GET /affiliate-api/v2/money/net/deposit/total` sin fechas, es decir, todo desde el registro: el depósito neto (depósitos menos retiradas, en USDT) tiene que ser de al menos `MIN_DEPOSIT`.
   Ese total se actualiza con retraso y no incluye los depósitos del día. Si no llega al mínimo, se consulta `GET /affiliate-api/v2/money/detail/list` (depósitos en cadena de los últimos 7 días, solo USDT/USDC completados) y se usa la cantidad mayor de las dos.
3. Si cumple, responde `{ "ok": true, "url": "<INDICATOR_URL>" }`. Si no, `{ "ok": false, "code": "..." }` y la web muestra el mensaje correspondiente.

Nunca se muestra cuánto ha depositado alguien: cualquiera puede escribir un UID ajeno.

El UID se acepta con prefijo (`LBA32323`, se manda como `openId`) o solo con números (se manda como `numOpenId`).

Para no pasar el límite de LBANK (5 peticiones cada 10 s), cada IP puede hacer 10 comprobaciones por minuto. Los resultados se recuerdan un rato: 10 minutos si cumple y 30 segundos si no.

## Variables de entorno

Se configuran en Netlify, en *Site configuration → Environment variables*. Nunca van en el repositorio.

| Variable                | Obligatoria | Qué es                                                                 |
| ----------------------- | ----------- | ---------------------------------------------------------------------- |
| `LBANK_API_KEY`         | Sí          | API key de afiliado de LBANK                                           |
| `LBANK_API_SECRET`      | Sí          | Secret key de esa API key (firma HmacSHA256)                           |
| `INDICATOR_URL`         | Sí          | Enlace que recibe quien cumple: `https://es.tradingview.com/script/stIGX5O9/` |
| `MIN_DEPOSIT`           | No (`100`)  | USDT mínimos que exige la API (se acepta igual o más). Coincide con lo que pide la web |
| `DEPOSIT_FIELD`         | No (`netDeposit`) | `netDeposit` (depósitos − retiradas) o `totalDeposit` (solo depósitos) |
| `REQUIRE_DIRECT_INVITE` | No (`true`) | `false` acepta también a los invitados por tus subafiliados            |

La API key se crea en el panel de afiliados de LBANK y tiene que ser de tipo **HmacSHA256**. No la limites por IP: Netlify no sale siempre por la misma IP.

Los textos que ve el usuario tras la comprobación están en `VERIFY_MESSAGES`, al principio de `public/assets/js/main.js`, junto a los enlaces de LBANK y Telegram (`LINKS`).

## Probar en local

```bash
cp .env.example .env              # rellena tus claves (.env no se sube al repo)
npm run check-uid -- LBA32323     # llama a LBANK de verdad y muestra la respuesta
npm run dev                       # web + API en http://localhost:8888 (Netlify CLI)
npm test                          # tests con LBANK simulado
```

## Publicar en Netlify

1. En Netlify: *Add new site → Import an existing project → GitHub* y elige este repositorio. Netlify lee `netlify.toml`, así que no hay que tocar nada más en la configuración de build.
2. Añade las variables de entorno de arriba y vuelve a desplegar.
3. En *Domain management → Add a domain*, pon `indicador.xztraders.com`.
4. En Openprovider, en la zona DNS de `xztraders.com`, crea un registro **CNAME** `indicador` → `<nombre-del-sitio>.netlify.app`. La web principal no se toca.

Netlify activa HTTPS solo en unos minutos. Cada push a la rama de producción vuelve a publicar la web.

Sitio actual: `xztraders-indicador` (`https://xztraders-indicador.netlify.app`), con el dominio `indicador.xztraders.com`. Si un sitio nuevo pide iniciar sesión en Netlify al abrirlo, desactiva la protección de visitantes en *Site configuration → Access & security → Visitor access*.

Para publicar a mano sin conectar GitHub:

```bash
NETLIFY_AUTH_TOKEN=... npx netlify-cli deploy --prod --site xztraders-indicador --dir public --functions netlify/functions
```

## Seguridad

- La web no carga nada de fuera: fuentes y three.js están en el propio repo. Así no depende de ningún CDN ni envía datos de los visitantes a terceros.
- `index.html` lleva una política de seguridad (`Content-Security-Policy`) que solo permite recursos de este dominio y bloquea scripts inyectados.
- El `<script>` y el `<style>` que van dentro del `<head>` están autorizados por su huella SHA-256 en esa política. **Si cambias cualquiera de los dos, hay que actualizar su huella** o el navegador los bloqueará. Para calcularla:

```bash
printf '%s' 'CONTENIDO_EXACTO_ENTRE_LAS_ETIQUETAS' | openssl dgst -sha256 -binary | base64
```

- `_headers` impide que la web se meta en un iframe de otra página (clickjacking).
