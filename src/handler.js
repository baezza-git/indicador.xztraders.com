/* ==========================================================================
   POST /api/verify → comprueba el UID en LBANK y devuelve el enlace.
   La función de Netlify (netlify/functions/verify.mjs) solo llama aquí.
   ========================================================================== */

import { LBankError } from './lbank.js';
import { checkUid, parseUid, readConfig } from './verify.js';

// Límite por IP para no agotar el de LBANK (5 peticiones cada 10 s).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

// Resultados recientes por UID: evita repetir llamadas a LBANK.
const CACHE_OK_MS = 10 * 60_000;
const CACHE_FAIL_MS = 30_000;

const hitsByIp = new Map();
const resultByUid = new Map();

export function resetState() {
  hitsByIp.clear();
  resultByUid.clear();
}

function rateLimited(ip, now) {
  if (hitsByIp.size > 5000) hitsByIp.clear();
  const recent = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hitsByIp.set(ip, recent);
  return recent.length > RATE_MAX;
}

function cachedResult(key, now) {
  const entry = resultByUid.get(key);
  if (!entry) return null;
  if (entry.expires <= now) {
    resultByUid.delete(key);
    return null;
  }
  return entry.result;
}

function storeResult(key, result, now) {
  if (resultByUid.size > 5000) resultByUid.clear();
  resultByUid.set(key, { result, expires: now + (result.ok ? CACHE_OK_MS : CACHE_FAIL_MS) });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function handleVerify(request, env, { fetchImpl = fetch, now = Date.now(), ip = 'unknown' } = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405, { Allow: 'POST', ...cors });

  if (rateLimited(ip, now)) return json({ ok: false, code: 'rate_limited' }, 429, { 'Retry-After': '60', ...cors });

  let payload;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error('too large');
    payload = JSON.parse(text);
  } catch {
    return json({ ok: false, code: 'invalid_uid' }, 400, cors);
  }

  const id = parseUid(payload?.uid);
  if (!id) return json({ ok: false, code: 'invalid_uid' }, 400, cors);

  const config = readConfig(env);
  if (!config.apiKey || !config.secretKey || !config.indicatorUrl) {
    console.error('Faltan secretos: LBANK_API_KEY, LBANK_API_SECRET o INDICATOR_URL');
    return json({ ok: false, code: 'unavailable' }, 503, cors);
  }

  const cacheKey = id.openId || id.numOpenId;
  let result = cachedResult(cacheKey, now);
  if (!result) {
    try {
      result = await checkUid(id, config, fetchImpl);
    } catch (err) {
      if (!(err instanceof LBankError)) throw err;
      console.error(`LBANK: ${err.message} (code=${err.code}, status=${err.status})`);
      return json({ ok: false, code: 'unavailable' }, 502, cors);
    }
    storeResult(cacheKey, result, now);
  }

  if (!result.ok) return json({ ok: false, code: result.code }, 200, cors);
  return json({ ok: true, url: config.indicatorUrl }, 200, cors);
}
