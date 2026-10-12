/* ==========================================================================
   Comprobación de un UID de LBANK:
   1. Está registrado con el enlace de afiliado (es del equipo).
   2. Tiene depositado al menos MIN_DEPOSIT USDT.
   ========================================================================== */

import { DEFAULT_BASE_URL, lbankGet } from './lbank.js';

const USER_INFO_PATH = '/affiliate-api/v2/invite/user/info';
const NET_DEPOSIT_PATH = '/affiliate-api/v2/money/net/deposit/total';
const MONEY_DETAIL_PATH = '/affiliate-api/v2/money/detail/list';

// El total de /money/net/deposit/total se actualiza con retraso (los depósitos
// del día no aparecen). Los de los últimos días se leen uno a uno de
// /money/detail/list, que sí está al momento.
const RECENT_DAYS = 7;
const STABLECOINS = ['USDT', 'USDC'];

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
  const minDeposit = Number(env.MIN_DEPOSIT ?? 100);
  const depositField = DEPOSIT_FIELDS.includes(env.DEPOSIT_FIELD) ? env.DEPOSIT_FIELD : 'netDeposit';
  return {
    apiKey: env.LBANK_API_KEY,
    secretKey: env.LBANK_API_SECRET,
    baseUrl: env.LBANK_BASE_URL || DEFAULT_BASE_URL,
    indicatorUrl: env.INDICATOR_URL,
    minDeposit: Number.isFinite(minDeposit) ? minDeposit : 100,
    requireDirect: String(env.REQUIRE_DIRECT_INVITE ?? 'true').toLowerCase() !== 'false',
    depositField,
  };
}

/**
 * Devuelve { ok: true } o { ok: false, code } con code:
 * not_registered | not_direct | low_deposit.
 * Los errores de red o de LBANK se lanzan como LBankError.
 */
// Suma de los depósitos en cadena completados en los últimos RECENT_DAYS días.
// Solo cuenta stablecoins, que valen 1 USDT.
async function recentDeposits(id, options, now) {
  const list = await lbankGet(
    MONEY_DETAIL_PATH,
    {
      ...id,
      userType: 'SELF',
      subInOutType: 'IN_DEPOSIT',
      startTime: now - RECENT_DAYS * 86_400_000,
      endTime: now,
      start: 0,
      pageSize: 100,
    },
    options
  );
  return (Array.isArray(list) ? list : [])
    .filter((d) => d.status === 'Completed' && STABLECOINS.includes(String(d.assetCode).toUpperCase()))
    .reduce((sum, d) => sum + (Number(d.assetNum) || 0), 0);
}

export async function checkUid(id, config, fetchImpl = fetch, now = Date.now()) {
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
  const total = Number(deposit?.[config.depositField]) || 0;
  if (total >= config.minDeposit) return { ok: true };

  // El total aún no incluye los depósitos recientes: se miran aparte.
  // Se usa el mayor de los dos para no contar dos veces el mismo depósito.
  const recent = await recentDeposits(id, options, now);
  if (Math.max(total, recent) < config.minDeposit) return { ok: false, code: 'low_deposit' };

  return { ok: true };
}
