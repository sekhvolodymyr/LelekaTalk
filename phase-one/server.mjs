import http from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMvpRouter } from './src/mvp-router.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(directory, 'public');
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const BODY_LIMIT = 128 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');

export function createApp({ dataDirectory = path.join(directory, 'data'), logoPath = process.env.LELEKA_LOGO ?? 'C:/Users/volod/Desktop/LelekaTalk/Leleka Talk logo.png' } = {}) {
  mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, 'accounts.json');
  const database = existsSync(databasePath)
    ? JSON.parse(readFileSync(databasePath, 'utf8'))
    : { version: 1, users: [], sessions: [] };
  if (database.version !== 1 || !Array.isArray(database.users) || !Array.isArray(database.sessions)) {
    throw new Error('Unsupported account database. Preserve the file before repairing it.');
  }
  const rateLimits = new Map();
  const persist = () => {
    const temporaryPath = `${databasePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(database, null, 2), { mode: 0o600 });
    renameSync(temporaryPath, databasePath);
  };
  const publicUser = user => ({
    id: user.id, email: user.email, username: user.username,
    personalName: user.personalName, creatorName: user.creatorName,
    activeProfile: user.activeProfile, showProfileLink: user.showProfileLink,
    createdAt: user.createdAt,
  });

  function send(response, status, value, headers = {}) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    response.end(JSON.stringify(value));
  }
  function fail(status, code) {
    return Object.assign(new Error(code), { status, code });
  }
  function getUser(request) {
    const token = /(?:^|;\s*)leleka_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (!token) return null;
    const session = database.sessions.find(item => item.tokenHash === hash(token) && item.expiresAt > Date.now());
    return session ? database.users.find(item => item.id === session.userId) ?? null : null;
  }
  function issueSession(user) {
    const token = randomBytes(32).toString('hex');
    database.sessions = database.sessions.filter(item => item.expiresAt > Date.now());
    database.sessions.push({ tokenHash: hash(token), userId: user.id, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
    persist();
    return `leleka_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
  }
  async function readBody(request) {
    if (!(request.headers['content-type'] ?? '').startsWith('application/json')) throw fail(415, 'json_required');
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > BODY_LIMIT) throw fail(413, 'body_too_large');
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      return body;
    } catch {
      throw fail(400, 'invalid_json');
    }
  }
  function checkRate(request) {
    const key = request.socket.remoteAddress ?? 'local';
    const now = Date.now();
    for (const [address, entry] of rateLimits) if (entry.until <= now) rateLimits.delete(address);
    const entry = rateLimits.get(key) ?? { count: 0, until: now + 60_000 };
    entry.count += 1;
    rateLimits.set(key, entry);
    if (entry.count > 20) throw fail(429, 'too_many_attempts');
  }
  function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }
  const mvpRouter = createMvpRouter({ database, persist, getUser, readBody, send, fail });
  const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/mvp.js', ['mvp.js', 'text/javascript; charset=utf-8']],
    ['/crypto.js', ['crypto.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
    ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
    ['/icon.svg', ['icon.svg', 'image/svg+xml']],
  ]);

  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = request.headers.host;
      if (!host || !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) throw fail(403, 'local_only');
      const url = new URL(request.url, `http://${host}`);
      const route = url.pathname;
      if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.headers.origin !== `http://${host}`) throw fail(403, 'invalid_origin');
      }
      if (route === '/api/register' && request.method === 'POST') {
        checkRate(request);
        const body = await readBody(request);
        const email = normalizeEmail(body.email);
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw fail(400, 'invalid_email');
        if (!/^[a-z0-9_]{3,24}$/.test(username)) throw fail(400, 'invalid_username');
        if (name.length < 1 || name.length > 60) throw fail(400, 'invalid_name');
        if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) throw fail(400, 'invalid_password');
        if (body.ageConfirmed !== true) throw fail(400, 'age_confirmation_required');
        if (database.users.some(item => item.email === email || item.username === username)) throw fail(409, 'account_conflict');
        const salt = randomBytes(16).toString('hex');
        const user = {
          id: randomUUID(), email, username, personalName: name, creatorName: name,
          salt, passwordHash: scryptSync(body.password, salt, 64).toString('hex'),
          activeProfile: 'personal', showProfileLink: false, createdAt: new Date().toISOString(),
          ageConfirmed: true,
        };
        database.users.push(user);
        const cookie = issueSession(user);
        return send(response, 201, { user: publicUser(user) }, { 'Set-Cookie': cookie });
      }
      if (route === '/api/login' && request.method === 'POST') {
        checkRate(request);
        const body = await readBody(request);
        if (typeof body.password !== 'string' || body.password.length > 256) throw fail(401, 'invalid_credentials');
        const user = database.users.find(item => item.email === normalizeEmail(body.email));
        const candidate = scryptSync(body.password, user?.salt ?? 'missing-account-salt', 64);
        const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
        if (!timingSafeEqual(candidate, expected) || !user) throw fail(401, 'invalid_credentials');
        return send(response, 200, { user: publicUser(user) }, { 'Set-Cookie': issueSession(user) });
      }
      if (route === '/api/me' && request.method === 'GET') {
        const user = getUser(request);
        if (!user) throw fail(401, 'authentication_required');
        return send(response, 200, { user: publicUser(user) });
      }
      if (route === '/api/profile' && request.method === 'PATCH') {
        const user = getUser(request);
        if (!user) throw fail(401, 'authentication_required');
        const body = await readBody(request);
        if (body.activeProfile !== undefined && !['personal', 'creator'].includes(body.activeProfile)) throw fail(400, 'invalid_profile');
        if (body.showProfileLink !== undefined && typeof body.showProfileLink !== 'boolean') throw fail(400, 'invalid_profile');
        for (const key of ['personalName', 'creatorName']) {
          if (body[key] !== undefined && (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > 60)) throw fail(400, 'invalid_name');
        }
        if (body.activeProfile !== undefined) user.activeProfile = body.activeProfile;
        if (body.showProfileLink !== undefined) user.showProfileLink = body.showProfileLink;
        if (body.personalName !== undefined) user.personalName = body.personalName.trim();
        if (body.creatorName !== undefined) user.creatorName = body.creatorName.trim();
        persist();
        return send(response, 200, { user: publicUser(user) });
      }
      if (route === '/api/logout' && request.method === 'POST') {
        const token = /(?:^|;\s*)leleka_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
        if (token) database.sessions = database.sessions.filter(item => item.tokenHash !== hash(token));
        persist();
        return send(response, 200, { ok: true }, { 'Set-Cookie': 'leleka_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (await mvpRouter(request, response, url)) return;
      if (route.startsWith('/api/')) throw fail(404, 'not_found');
      if (request.method !== 'GET' && request.method !== 'HEAD') throw fail(405, 'method_not_allowed');
      let assetPath, contentType;
      if (route === '/vendor/openpgp.min.mjs') {
        assetPath = path.join(directory, 'node_modules', 'openpgp', 'dist', 'openpgp.min.mjs');
        contentType = 'text/javascript; charset=utf-8';
      } else if (route === '/logo.png') {
        const bundled = path.join(publicDirectory, 'logo.png');
        assetPath = existsSync(bundled) ? bundled : logoPath;
        contentType = 'image/png';
      } else {
        const asset = staticFiles.get(route);
        if (!asset) throw fail(404, 'not_found');
        assetPath = path.join(publicDirectory, asset[0]);
        contentType = asset[1];
      }
      if (!assetPath || !existsSync(assetPath)) throw fail(404, 'not_found');
      const contents = readFileSync(assetPath);
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': contents.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      if (response.headersSent) return response.end();
      if (!error.status) console.error('Request failed:', error.message);
      send(response, error.status ?? 500, { error: error.code ?? 'server_error' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const server = createApp();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`LelekaTalk local development: http://127.0.0.1:${port}`));
}
