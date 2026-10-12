/* ==========================================================================
   Comprobación de un UID de LBANK:
   1. Está registrado con el enlace de afiliado (es del equipo).
   2. Tiene depositado al menos MIN_DEPOSIT USDT.
   ========================================================================== */

import { DEFAULT_BASE_URL, lbankGet } from './lbank.js';

const USER_INFO_PATH = '/affiliate-api/v2/invite/user/info';
const NET_DEPOSIT_PATH = '/affiliate-api/v2/money/net/deposit/total';

// Campos válidos de /money/net/deposit/total (ver documentación de LBANK).
const DEPOSIT_FIELDS = ['netDeposit', 'totalDeposit'];

/**
 * Acepta el UID con prefijo (LBA32323) o solo numérico.
 * Devuelve los parámetros para LBANK ({ openId } o { numOpenId }) o null.
 */
export function parseUid(raw) {
  const uid = String(raw ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (/^LBA[0-9A-Z]{3,16}$/.test(uid)) return { openId: uid };
  if (/^\d{5,20}$/.test(uid)) return { numOpenId: uid };
  return null;
}

export function readConfig(env) {
  const minDeposit = Number(env.MIN_DEPOSIT ?? 115);
  const depositField = DEPOSIT_FIELDS.includes(env.DEPOSIT_FIELD) ? env.DEPOSIT_FIELD : 'netDeposit';
  return {
    apiKey: env.LBANK_API_KEY,
    secretKey: env.LBANK_SECRET_KEY,
    baseUrl: env.LBANK_BASE_URL || DEFAULT_BASE_URL,
    indicatorUrl: env.INDICATOR_URL,
    minDeposit: Number.isFinite(minDeposit) ? minDeposit : 115,
    requireDirect: String(env.REQUIRE_DIRECT_INVITE ?? 'true').toLowerCase() !== 'false',
    depositField,
  };
}

/**
 * Devuelve { ok: true } o { ok: false, code } con code:
 * not_registered | not_direct | low_deposit.
 * Los errores de red o de LBANK se lanzan como LBankError.
 */
export async function checkUid(id, config, fetchImpl = fetch) {
  const options = {
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    fetchImpl,
  };

  const info = await lbankGet(USER_INFO_PATH, id, options);
  if (!info || info.inviteResult !== true) return { ok: false, code: 'not_registered' };
  if (config.requireDirect && info.directInvitation !== true) return { ok: false, code: 'not_direct' };

  // Sin startTime/endTime: todo lo depositado desde el registro.
  const deposit = await lbankGet(NET_DEPOSIT_PATH, id, options);
  const amount = Number(deposit?.[config.depositField]);
  if (!Number.isFinite(amount) || amount < config.minDeposit) return { ok: false, code: 'low_deposit' };

  return { ok: true };
}
