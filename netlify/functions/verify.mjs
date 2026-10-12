// Función de Netlify: POST /api/verify (la lógica está en src/handler.js).
import { handleVerify } from '../../src/handler.js';

export default (request, context) => handleVerify(request, process.env, { ip: context.ip });

export const config = { path: '/api/verify' };
