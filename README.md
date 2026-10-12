# indicador.xztraders.com

Web del **Indicador Chino** de XZ TRADERS. Para conseguirlo, el usuario:

1. Se registra en LBANK con el enlace de afiliado.
2. Deposita más de 115 USDT.
3. Escribe su UID de LBANK en la web. Se comprueba al momento con la API de afiliados de LBANK y, si cumple, recibe el enlace del indicador.

La web y la comprobación corren en un único **Cloudflare Worker**. La comprobación necesita un servidor porque la clave de la API de LBANK no puede estar en la página: cualquiera podría verla. El enlace del indicador tampoco está en la página; solo lo devuelve el servidor cuando el UID cumple.

## Estructura

```
public/                 Web estática (lo que ve el visitante)
  index.html            Página principal
  assets/css/styles.css Estilos (tokens de color y tipografía al inicio)
  assets/js/main.js     Enlaces, formulario del UID y animaciones
  assets/js/beams.js    Fondo animado del hero (three.js; si no hay WebGL se usa el fondo CSS)
  assets/img/           Logo, favicons e imagen para redes (og-cover.jpg)
  assets/fonts/         Fuentes Geist y Geist Mono (licencia OFL)
  assets/vendor/three/  three.js r180 (licencia MIT)
  _headers              Cabeceras de seguridad
worker/                 Servidor (Cloudflare Worker)
  index.js              POST /api/verify y el resto de la web
  verify.js             Reglas: registrado con el enlace + depósito mínimo
  lbank.js              Cliente firmado de la API de afiliados de LBANK
scripts/check-uid.mjs   Prueba la conexión con LBANK desde tu ordenador
test/                   Tests (npm test)
wrangler.jsonc          Configuración del Worker
```

## Cómo funciona la comprobación

`POST /api/verify` con `{ "uid": "LBA32323" }`:

1. `GET /affiliate-api/v2/invite/user/info`: el UID tiene que ser de tu equipo (`inviteResult`) y, por defecto, invitado directamente con tu enlace (`directInvitation`).
2. `GET /affiliate-api/v2/money/net/deposit/total` sin fechas, es decir, todo desde el registro: el depósito neto (depósitos menos retiradas, en USDT) tiene que ser de al menos `MIN_DEPOSIT`.
3. Si cumple, responde `{ "ok": true, "url": "<INDICATOR_URL>" }`. Si no, `{ "ok": false, "code": "..." }` y la web muestra el mensaje correspondiente.

Nunca se muestra cuánto ha depositado alguien: cualquiera puede escribir un UID ajeno.

El UID se acepta con prefijo (`LBA32323`, se manda como `openId`) o solo con números (se manda como `numOpenId`).

Para no pasar el límite de LBANK (5 peticiones cada 10 s), cada IP puede hacer 10 comprobaciones por minuto. Los resultados se recuerdan un rato: 10 minutos si cumple y 30 segundos si no.

## Ajustes

En `wrangler.jsonc`, dentro de `vars`:

| Variable                | Por defecto  | Qué hace                                                                          |
| ----------------------- | ------------ | --------------------------------------------------------------------------------- |
| `MIN_DEPOSIT`           | `100`        | USDT mínimos que exige la API. La web pide 115 a propósito: así hay margen        |
| `DEPOSIT_FIELD`         | `netDeposit` | `netDeposit` (depósitos − retiradas) o `totalDeposit` (solo depósitos)            |
| `REQUIRE_DIRECT_INVITE` | `true`       | `false` acepta también a los invitados por tus subafiliados                       |
| `ALLOWED_ORIGINS`       | vacío        | Solo si la web se sirve desde otro dominio: orígenes permitidos, separados por comas |

Los textos que ve el usuario tras la comprobación están en `VERIFY_MESSAGES`, al principio de `public/assets/js/main.js`, junto a los enlaces de LBANK y Telegram (`LINKS`).

## Secretos

No van nunca en el repositorio. Se guardan en Cloudflare:

```bash
npx wrangler secret put LBANK_API_KEY      # API key de afiliado de LBANK
npx wrangler secret put LBANK_SECRET_KEY   # Secret key (firma HmacSHA256)
npx wrangler secret put INDICATOR_URL      # Enlace que recibe quien cumple
```

La API key se crea en el panel de afiliados de LBANK y tiene que ser de tipo **HmacSHA256**. Si la limitas por IP, la comprobación fallará, porque Cloudflare no sale siempre por la misma IP.

## Probar en local

```bash
npm install
cp .dev.vars.example .dev.vars   # rellena tus claves (no se sube al repo)
npm run check-uid -- LBA32323    # llama a LBANK de verdad y muestra la respuesta
npm run dev                      # web + API en http://localhost:8787
npm test                         # tests con LBANK simulado
```

## Publicar

1. Crea una cuenta gratis en Cloudflare y añade el dominio `xztraders.com`; Cloudflare te dirá qué servidores DNS poner en tu registrador. Es necesario para usar `indicador.xztraders.com` como dominio propio del Worker.
2. `npx wrangler login`
3. Guarda los tres secretos (ver arriba).
4. `npm run deploy`

El dominio `indicador.xztraders.com` está en `routes` de `wrangler.jsonc` y Cloudflare lo configura solo al publicar. Si prefieres que se publique al hacer push, conecta este repositorio en Cloudflare → Workers → *Import a repository*.

## Seguridad

- La web no carga nada de fuera: fuentes y three.js están en el propio repo. Así no depende de ningún CDN ni envía datos de los visitantes a terceros.
- `index.html` lleva una política de seguridad (`Content-Security-Policy`) que solo permite recursos de este dominio y bloquea scripts inyectados.
- El `<script>` y el `<style>` que van dentro del `<head>` están autorizados por su huella SHA-256 en esa política. **Si cambias cualquiera de los dos, hay que actualizar su huella** o el navegador los bloqueará. Para calcularla:

```bash
printf '%s' 'CONTENIDO_EXACTO_ENTRE_LAS_ETIQUETAS' | openssl dgst -sha256 -binary | base64
```

- `_headers` impide que la web se meta en un iframe de otra página (clickjacking).
- Quien recibe el enlace del indicador puede compartirlo. Si el indicador es un script *invite-only* de TradingView, lo más seguro es dar acceso por nombre de usuario de TradingView en lugar de un enlace público.
