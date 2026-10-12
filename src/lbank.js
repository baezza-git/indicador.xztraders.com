/* ==========================================================================
   Cliente mínimo de la API de afiliados de LBANK.
   Firma: parámetros ordenados → MD5 en mayúsculas → HmacSHA256 en hex,
   igual que el conector oficial lbank-connector-python.
   ========================================================================== */

import { createHash, createHmac, randomInt } from 'node:crypto';

export const DEFAULT_BASE_URL = 'https://affiliatehub.lbank.info';

const ECHOSTR_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class LBankError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = 'LBankError';
    this.code = code;
    this.status = status;
  }
}

// Cadena aleatoria de 35 letras y números (LBANK pide entre 30 y 40).
export function randomEchostr(length = 35) {
  let out = '';
  for (let i = 0; i < length; i++) out += ECHOSTR_CHARS[randomInt(ECHOSTR_CHARS.length)];
  return out;
}

export function buildSign(params, secretKey) {
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const prepared = createHash('md5').update(query, 'utf8').digest('hex').toUpperCase();
  return createHmac('sha256', secretKey).update(prepared, 'utf8').digest('hex');
}

/**
 * GET firmado a la API de afiliados. Devuelve `data` o lanza LBankError.
 * `timestamp`, `signature_method` y `echostr` entran en la firma pero viajan
 * en las cabeceras; en la URL solo van los parámetros, `api_key` y `sign`.
 */
export async function lbankGet(path, params, options) {
  const {
    apiKey,
    secretKey,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
    timestamp = String(Date.now()),
    echostr = randomEchostr(),
    timeoutMs = 8000,
  } = options;

  const clean = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
  const sign = buildSign(
    { ...clean, api_key: apiKey, timestamp, signature_method: 'HmacSHA256', echostr },
    secretKey
  );
  const query = new URLSearchParams({ ...clean, api_key: apiKey, sign });

  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}?${query}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        timestamp,
        signature_method: 'HmacSHA256',
        echostr,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new LBankError(`No se pudo conectar con LBANK: ${err.message}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new LBankError(`Respuesta no válida de LBANK (HTTP ${response.status})`, {
      status: response.status,
    });
  }

  const ok = (body.result === true || body.result === 'true') && Number(body.error_code) === 0;
  if (!response.ok || !ok) {
    throw new LBankError(body.msg || `Error de LBANK (HTTP ${response.status})`, {
      code: body.error_code ?? null,
      status: response.status,
    });
  }
  return body.data;
}
