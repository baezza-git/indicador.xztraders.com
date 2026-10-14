import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { handleVerify, resetState } from '../src/handler.js';
import { buildSign, lbankGet, randomEchostr } from '../src/lbank.js';
import { parseUid } from '../src/verify.js';

const ENV = {
  LBANK_API_KEY: 'test-api-key',
  LBANK_API_SECRET: 'test-secret',
  INDICATOR_URL: 'https://example.com/indicador',
  MIN_DEPOSIT: '100',
  DEPOSIT_FIELD: 'netDeposit',
  REQUIRE_DIRECT_INVITE: 'true',
};

// Simula la API de LBANK: `users` indexado por openId.
function fakeLBank(users, calls = []) {
  return async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers });
    const user = users[u.searchParams.get('openId') || u.searchParams.get('numOpenId')];
    let data;
    if (u.pathname.endsWith('/invite/user/info')) {
      data = user
        ? {
            inviteResult: true,
            directInvitation: user.direct ?? true,
            currencyTotalFeeAmt: String(user.spot ?? 0),
            contractTotalFeeAmt: String(user.futures ?? 0),
          }
        : { inviteResult: false, directInvitation: false };
    } else if (u.pathname.endsWith('/money/net/deposit/total')) {
      data = { totalDeposit: String(user?.deposit ?? 0), totalWithdraw: '0', netDeposit: String(user?.deposit ?? 0) };
    } else if (u.pathname.endsWith('/money/detail/list')) {
      data = user?.recent ?? [];
    }
    return Response.json({ result: 'true', error_code: 0, data, ts: 1 });
  };
}

function verifyRequest(body) {
  return new Request('https://indicador.xztraders.com/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function verify(uid, users, { env = ENV, ip = '1.1.1.1', calls } = {}) {
  const res = await handleVerify(verifyRequest({ uid }), env, { fetchImpl: fakeLBank(users, calls), ip });
  return { status: res.status, body: await res.json() };
}

describe('firma LBANK', () => {
  it('coincide con el conector oficial de Python', () => {
    // Valor calculado con lbank-connector-python (utils.build_md5 + hmac sha256).
    const sign = buildSign(
      {
        openId: 'LBA0001001',
        api_key: 'test-api-key',
        timestamp: '1721305060631',
        signature_method: 'HmacSHA256',
        echostr: 'P3LHfw6tUIYWc8R2VQNy0ilKmdg5pjhbxC7',
      },
      'test-secret'
    );
    assert.equal(sign, 'b47f325941518fdaaae330e9fab673930b10ce5450f1977954de888662464b6e');
  });

  it('echostr tiene 35 letras y números', () => {
    assert.match(randomEchostr(), /^[A-Za-z0-9]{35}$/);
  });

  it('manda api_key y sign en la URL y el resto en cabeceras', async () => {
    const calls = [];
    await lbankGet('/affiliate-api/v2/invite/user/info', { openId: 'LBA0001001' }, {
      apiKey: 'test-api-key',
      secretKey: 'test-secret',
      timestamp: '1721305060631',
      echostr: 'P3LHfw6tUIYWc8R2VQNy0ilKmdg5pjhbxC7',
      fetchImpl: fakeLBank({}, calls),
    });
    assert.deepEqual(calls[0].params, {
      openId: 'LBA0001001',
      api_key: 'test-api-key',
      sign: 'b47f325941518fdaaae330e9fab673930b10ce5450f1977954de888662464b6e',
    });
    assert.equal(calls[0].headers.timestamp, '1721305060631');
    assert.equal(calls[0].headers.signature_method, 'HmacSHA256');
  });

  it('lanza error si LBANK responde result=false', async () => {
    const fetchImpl = async () => Response.json({ result: 'false', msg: 'bad sign', error_code: 10003 });
    await assert.rejects(
      lbankGet('/x', {}, { apiKey: 'k', secretKey: 's', fetchImpl }),
      (err) => err.name === 'LBankError' && err.code === 10003
    );
  });
});

describe('parseUid', () => {
  it('acepta UID con LBA o numérico', () => {
    assert.deepEqual(parseUid(' lba32323 '), { openId: 'LBA32323' });
    assert.deepEqual(parseUid('6537377207'), { numOpenId: '6537377207' });
  });

  it('rechaza basura', () => {
    for (const bad of ['', 'hola', 'LBA', '12', 'LBA32323&x=1', null, undefined, { a: 1 }]) {
      assert.equal(parseUid(bad), null, String(bad));
    }
  });
});

describe('/api/verify', () => {
  beforeEach(() => resetState());

  const users = {
    LBA0000OK1: { deposit: 150 },
    LBA000EXACT: { deposit: 100 },
    LBA000110: { deposit: 110 },
    LBA000POOR: { deposit: 50 },
    LBA000SUB: { deposit: 500, direct: false },
    // El total de LBANK aún no refleja los depósitos de hoy.
    LBA000TODAY: {
      deposit: 0,
      recent: [
        { assetCode: 'USDT', assetNum: '100.99', status: 'Completed' },
        { assetCode: 'USDT', assetNum: '9.99', status: 'Completed' },
      ],
    },
    LBA000PEND: {
      deposit: 0,
      recent: [
        { assetCode: 'USDT', assetNum: '150', status: 'Processing' },
        { assetCode: 'BTC', assetNum: '0.01', status: 'Completed' },
        { assetCode: 'USDT', assetNum: '20', status: 'Completed' },
      ],
    },
    LBA000HALF: { deposit: 60, recent: [{ assetCode: 'USDT', assetNum: '60', status: 'Completed' }] },
    // Recibió los USDT por transferencia interna: no cuenta como depósito, pero sí como saldo.
    LBA000XFER: { deposit: 0, spot: 102 },
    LBA000MIX: { deposit: 0, spot: 40, futures: 60 },
    LBA000LOWBAL: { deposit: 0, spot: 99.99 },
  };

  it('da el enlace si está registrado y ha depositado lo suficiente', async () => {
    const { status, body } = await verify('LBA0000OK1', users);
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, url: ENV.INDICATOR_URL });
  });

  it('acepta justo el mínimo (100 USDT) y cualquier cantidad mayor', async () => {
    assert.equal((await verify('LBA000EXACT', users)).body.ok, true);
    assert.equal((await verify('LBA000110', users)).body.ok, true);
  });

  it('cuenta los depósitos de hoy que el total de LBANK aún no refleja', async () => {
    const calls = [];
    assert.equal((await verify('LBA000TODAY', users, { calls })).body.ok, true);
    const detail = calls.find((c) => c.path.endsWith('/money/detail/list'));
    assert.equal(detail.params.subInOutType, 'IN_DEPOSIT');
    assert.equal(detail.params.userType, 'SELF');
  });

  it('no cuenta depósitos pendientes ni de monedas que no son stablecoins', async () => {
    assert.deepEqual((await verify('LBA000PEND', users)).body, { ok: false, code: 'low_deposit' });
  });

  it('no suma dos veces lo que ya está en el total', async () => {
    assert.deepEqual((await verify('LBA000HALF', users)).body, { ok: false, code: 'low_deposit' });
  });

  it('si el total ya llega, no consulta el detalle', async () => {
    const calls = [];
    await verify('LBA0000OK1', users, { calls });
    assert.equal(calls.some((c) => c.path.endsWith('/money/detail/list')), false);
  });

  it('acepta el saldo spot aunque LBANK no lo cuente como depósito', async () => {
    const calls = [];
    assert.equal((await verify('LBA000XFER', users, { calls })).body.ok, true);
    assert.equal(calls.length, 1, 'con el saldo basta: solo se llama a user/info');
  });

  it('suma spot y futuros', async () => {
    assert.equal((await verify('LBA000MIX', users)).body.ok, true);
  });

  it('saldo por debajo del mínimo y sin depósitos', async () => {
    assert.deepEqual((await verify('LBA000LOWBAL', users)).body, { ok: false, code: 'low_deposit' });
  });

  it('no registrado con el enlace', async () => {
    assert.deepEqual((await verify('LBA9999999', users)).body, { ok: false, code: 'not_registered' });
  });

  it('depósito insuficiente, sin revelar la cantidad', async () => {
    assert.deepEqual((await verify('LBA000POOR', users)).body, { ok: false, code: 'low_deposit' });
  });

  it('del equipo pero no invitado directo', async () => {
    assert.deepEqual((await verify('LBA000SUB', users)).body, { ok: false, code: 'not_direct' });
    resetState();
    const env = { ...ENV, REQUIRE_DIRECT_INVITE: 'false' };
    assert.equal((await verify('LBA000SUB', users, { env })).body.ok, true);
  });

  it('UID inválido no llama a LBANK', async () => {
    const calls = [];
    const { status, body } = await verify('nope', users, { calls });
    assert.equal(status, 400);
    assert.equal(body.code, 'invalid_uid');
    assert.equal(calls.length, 0);
  });

  it('JSON roto', async () => {
    const res = await handleVerify(verifyRequest('{nope'), ENV, { fetchImpl: fakeLBank(users) });
    assert.equal(res.status, 400);
  });

  it('sin secretos configurados no filtra nada', async () => {
    const { status, body } = await verify('LBA0000OK1', users, { env: { ...ENV, INDICATOR_URL: '' } });
    assert.equal(status, 503);
    assert.deepEqual(body, { ok: false, code: 'unavailable' });
  });

  it('error de LBANK → unavailable', async () => {
    const fetchImpl = async () => Response.json({ result: 'false', msg: 'limit', error_code: 10008 });
    const res = await handleVerify(verifyRequest({ uid: 'LBA0000OK1' }), ENV, { fetchImpl });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { ok: false, code: 'unavailable' });
  });

  it('reutiliza el resultado reciente sin volver a llamar a LBANK', async () => {
    const calls = [];
    await verify('LBA0000OK1', users, { calls });
    await verify('LBA0000OK1', users, { calls, ip: '2.2.2.2' });
    assert.equal(calls.length, 2);
  });

  it('limita las peticiones por IP', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await verify(`LBA00000${i}0`, users, { ip: '9.9.9.9' });
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'rate_limited');
  });

  it('solo POST', async () => {
    const res = await handleVerify(new Request('https://x/api/verify'), ENV);
    assert.equal(res.status, 405);
  });
});
