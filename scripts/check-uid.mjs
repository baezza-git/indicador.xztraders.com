// Prueba la conexión con LBANK desde tu ordenador, sin desplegar nada.
// Uso: npm run check-uid -- LBA32323
// Lee las claves de .dev.vars (o de las variables de entorno).

import { existsSync, readFileSync } from 'node:fs';
import { lbankGet } from '../worker/lbank.js';
import { checkUid, parseUid, readConfig } from '../worker/verify.js';

const env = { ...process.env };
if (existsSync('.dev.vars')) {
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) env[match[1]] = match[2];
  }
}

const id = parseUid(process.argv[2]);
if (!id) {
  console.error('Uso: npm run check-uid -- LBA32323');
  process.exit(1);
}

const config = readConfig(env);
if (!config.apiKey || !config.secretKey) {
  console.error('Faltan LBANK_API_KEY y LBANK_SECRET_KEY en .dev.vars');
  process.exit(1);
}

const options = { apiKey: config.apiKey, secretKey: config.secretKey, baseUrl: config.baseUrl };
try {
  console.log('user/info →', await lbankGet('/affiliate-api/v2/invite/user/info', id, options));
  console.log('net/deposit →', await lbankGet('/affiliate-api/v2/money/net/deposit/total', id, options));
  console.log('Resultado →', await checkUid(id, config));
} catch (err) {
  console.error(`Error: ${err.message} (code=${err.code ?? '-'}, status=${err.status ?? '-'})`);
  process.exit(1);
}
