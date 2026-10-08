import http from 'node:http';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createApp } from '../phase-one/server.mjs';
import { emptyDatabase } from './postgres-store.mjs';

function captureResponse() {
  const headers = {};
  return {
    statusCode: 200, headers, body: undefined, headersSent: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    writeHead(status, values = {}) { this.statusCode = status; for (const [name, value] of Object.entries(values)) this.setHeader(name, value); },
    end(body) { this.body = body; },
  };
}
function rates(database) {
  const values = database.authRates ??= {};
  return {
    get: key => values[key], set: (key, value) => { values[key] = value; }, delete: key => { delete values[key]; },
    [Symbol.iterator]: function* () { yield* Object.entries(values); },
  };
}
async function bufferedRequest(request) {
  if (['GET', 'HEAD'].includes(request.method)) return request;
  if (Number(request.headers['content-length'] ?? 0) > 128 * 1024) throw Object.assign(new Error(), { status: 413, code: 'body_too_large' });
  let length = 0; const chunks = [];
  const source = request.body === undefined ? request : [Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body))];
  for await (const chunk of source) {
    length += chunk.length;
    if (length > 128 * 1024) throw Object.assign(new Error(), { status: 413, code: 'body_too_large' });
    chunks.push(chunk);
  }
  return Object.assign(Readable.from([Buffer.concat(chunks)]), { method: request.method, url: request.url, headers: request.headers, socket: request.socket });
}
export function createCloudApp({ store, allowedOrigins, secureCookies = true, trustedProxy = false } = {}) {
  const options = { allowedOrigins, secureCookies, clientAddress: request => createHash('sha256').update(String(trustedProxy ? request.headers['x-vercel-forwarded-for'] ?? request.headers['x-forwarded-for'] ?? request.socket.remoteAddress : request.socket.remoteAddress)).digest('hex') };
  async function handle(request, database) {
    const output = captureResponse();
    const app = createApp({ ...options, managedDatabase: database, rateLimits: rates(database) });
    await app.listeners('request')[0](request, output);
    return output;
  }
  return http.createServer(async (request, response) => {
    try {
      const route = new URL(request.url, 'http://localhost').pathname;
      const isApi = route.startsWith('/api/');
      if (isApi && !store) {
        response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'storage_not_configured' })); return;
      }
      const input = await bufferedRequest(request);
      const result = isApi
        ? await store.run(!['GET', 'HEAD'].includes(request.method), database => handle(input, database))
        : await handle(input, emptyDatabase());
      // Responses, including session cookies, are released only after COMMIT.
      response.writeHead(result.statusCode, result.headers); response.end(result.body);
    } catch (error) {
      response.writeHead(error.status ?? 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.code ?? 'storage_unavailable' }));
      if (!error.status) console.error('Cloud request failed; database credentials and details omitted.');
    }
  });
}
