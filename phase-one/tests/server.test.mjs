import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

async function fixture(t) {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'lelekatalk-test-'));
  let server;
  let origin;
  async function start() {
    server = createApp({ dataDirectory, logoPath: null });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const stopped = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await stopped;
  }
  await start();
  t.after(async () => { await stop(); rmSync(dataDirectory, { recursive: true, force: true }); });
  return {
    dataDirectory,
    async restart() { await stop(); await start(); },
    async request(route, { method = 'GET', body, cookie, foreignOrigin } = {}) {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(method !== 'GET' ? { Origin: foreignOrigin ?? origin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
      return { status: response.status, payload, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
    },
  };
}
const account = { email: 'test@example.com', password: 'a-long-password-2026', name: 'Олена', username: 'olena', ageConfirmed: true };

test('registration persists a password hash and returns no credentials', async t => {
  const app = await fixture(t);
  const result = await app.request('/api/register', { method: 'POST', body: account });
  assert.equal(result.status, 201);
  assert.equal(result.payload.user.personalName, 'Олена');
  assert.equal(result.payload.user.activeProfile, 'personal');
  assert.equal(result.payload.user.showProfileLink, false);
  assert.ok(result.cookie.startsWith('leleka_session='));
  assert.match(result.headers.get('set-cookie'), /HttpOnly/);
  assert.match(result.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal(result.payload.user.passwordHash, undefined);
  const stored = readFileSync(path.join(app.dataDirectory, 'accounts.json'), 'utf8');
  assert.ok(!stored.includes(account.password));
  assert.equal(JSON.parse(stored).users[0].passwordHash.length, 128);
});

test('unauthenticated users cannot read or edit a profile', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('/api/me')).status, 401);
  assert.equal((await app.request('/api/profile', { method: 'PATCH', body: { personalName: 'Other' } })).status, 401);
});

test('duplicate email and case-insensitive username are rejected', async t => {
  const app = await fixture(t);
  await app.request('/api/register', { method: 'POST', body: account });
  const emailConflict = await app.request('/api/register', { method: 'POST', body: { ...account, email: 'TEST@EXAMPLE.COM', username: 'different' } });
  const nameConflict = await app.request('/api/register', { method: 'POST', body: { ...account, email: 'other@example.com', username: 'OLENA' } });
  assert.equal(emailConflict.status, 409);
  assert.equal(nameConflict.status, 409);
});

test('wrong passwords and nonexistent accounts have the same error', async t => {
  const app = await fixture(t);
  await app.request('/api/register', { method: 'POST', body: account });
  const wrong = await app.request('/api/login', { method: 'POST', body: { email: account.email, password: 'wrong-password' } });
  const missing = await app.request('/api/login', { method: 'POST', body: { email: 'missing@example.com', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.payload, missing.payload);
});

test('valid login survives a server restart and logout invalidates the session', async t => {
  const app = await fixture(t);
  await app.request('/api/register', { method: 'POST', body: account });
  await app.restart();
  const login = await app.request('/api/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(login.status, 200);
  assert.equal((await app.request('/api/me', { cookie: login.cookie })).status, 200);
  const logout = await app.request('/api/logout', { method: 'POST', cookie: login.cookie });
  assert.equal(logout.status, 200);
  assert.equal((await app.request('/api/me', { cookie: login.cookie })).status, 401);
});

test('profile settings persist and cannot change account identity', async t => {
  const app = await fixture(t);
  const registration = await app.request('/api/register', { method: 'POST', body: account });
  const changed = await app.request('/api/profile', { method: 'PATCH', cookie: registration.cookie, body: { creatorName: 'Олена створює', activeProfile: 'creator', showProfileLink: true, email: 'attacker@example.com', username: 'attacker' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.payload.user.email, account.email);
  assert.equal(changed.payload.user.username, account.username);
  await app.restart();
  const profile = await app.request('/api/me', { cookie: registration.cookie });
  assert.equal(profile.payload.user.creatorName, 'Олена створює');
  assert.equal(profile.payload.user.activeProfile, 'creator');
  assert.equal(profile.payload.user.showProfileLink, true);
});

test('profile validation does not partially apply invalid changes', async t => {
  const app = await fixture(t);
  const registration = await app.request('/api/register', { method: 'POST', body: account });
  const result = await app.request('/api/profile', { method: 'PATCH', cookie: registration.cookie, body: { activeProfile: 'creator', personalName: '' } });
  assert.equal(result.status, 400);
  const unchanged = await app.request('/api/me', { cookie: registration.cookie });
  assert.equal(unchanged.payload.user.activeProfile, 'personal');
});

test('cross-origin writes are rejected', async t => {
  const app = await fixture(t);
  const result = await app.request('/api/register', { method: 'POST', body: account, foreignOrigin: 'https://foreign.example' });
  assert.equal(result.status, 403);
  assert.equal(result.payload.error, 'invalid_origin');
});

test('registration requires age confirmation and a sufficiently long password', async t => {
  const app = await fixture(t);
  const age = await app.request('/api/register', { method: 'POST', body: { ...account, ageConfirmed: false } });
  const password = await app.request('/api/register', { method: 'POST', body: { ...account, password: 'short' } });
  assert.equal(age.payload.error, 'age_confirmation_required');
  assert.equal(password.payload.error, 'invalid_password');
});

test('local app serves its shell but does not expose the account database', async t => {
  const app = await fixture(t);
  const page = await app.request('/');
  assert.equal(page.status, 200);
  assert.match(page.payload, /LelekaTalk/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const database = await app.request('/data/accounts.json');
  assert.equal(database.status, 404);
});
