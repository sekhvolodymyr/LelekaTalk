import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createCloudApp } from '../src/cloud-app.mjs';
import { emptyDatabase } from '../src/postgres-store.mjs';

async function fixture(t, failure = false) {
  let persisted = emptyDatabase(), tail = Promise.resolve();
  const store = {
    run(mutating, action) {
      const operation = async () => {
        const snapshot = structuredClone(persisted), result = await action(snapshot);
        if (mutating && failure) throw new Error('commit failed');
        if (mutating) persisted = snapshot;
        return result;
      };
      const result = tail.then(operation); tail = result.catch(() => {}); return result;
    },
  };
  const server = createCloudApp({ store, allowedOrigins: ['https://lelekatalk.example'] });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  return {
    database: () => persisted,
    async request(route, { method = 'GET', body, cookie, origin = 'https://lelekatalk.example', host = 'lelekatalk.example' } = {}) {
      return new Promise((resolve, reject) => {
        const request = http.request(`http://127.0.0.1:${server.address().port}${route}`, { method, headers: { Host: host, Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, response => {
          const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            resolve({ status: response.statusCode, cookie: response.headers['set-cookie']?.[0], data: response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text });
          });
        });
        request.on('error', reject); request.end(body ? JSON.stringify(body) : undefined);
      });
    },
  };
}
const account = { email: 'cloud@example.test', username: 'cloud_user', name: 'Cloud user', password: 'a-cloud-test-password', ageConfirmed: true };

test('cloud adapter persists accounts across requests and uses Secure cookies and strict HTTPS origins', async t => {
  const app = await fixture(t);
  const registration = await app.request('/api/register', { method: 'POST', body: account });
  assert.equal(registration.status, 201); assert.match(registration.cookie, /; Secure/);
  const cookie = registration.cookie.split(';')[0];
  assert.equal((await app.request('/api/me', { cookie })).data.user.username, account.username);
  assert.equal((await app.request('/api/profile', { method: 'PATCH', cookie, body: { personalName: 'Changed' }, origin: 'http://lelekatalk.example' })).status, 403);
  assert.equal((await app.request('/api/me', { cookie, host: 'attacker.example' })).status, 403);
  assert.equal((await app.request('/vendor/openpgp.min.mjs')).status, 200);
  await app.request('/api/logout', { method: 'POST', cookie });
  assert.equal((await app.request('/api/me', { cookie })).status, 401);
});

test('a failed durable commit never returns a successful registration or session cookie', async t => {
  const app = await fixture(t, true);
  const registration = await app.request('/api/register', { method: 'POST', body: account });
  assert.equal(registration.status, 503); assert.equal(registration.cookie, undefined);
  assert.equal(app.database().users.length, 0);
});

test('cloud auth rate limits survive request handler recreation, including failed logins', async t => {
  const app = await fixture(t);
  for (let i = 0; i < 20; i++) assert.equal((await app.request('/api/login', { method: 'POST', body: { email: account.email, password: 'invalid-password' } })).status, 401);
  assert.equal((await app.request('/api/login', { method: 'POST', body: { email: account.email, password: 'invalid-password' } })).status, 429);
  assert.equal(Object.keys(app.database().authRates).length, 1);
});

test('a cloud server without storage rejects API requests instead of creating temporary accounts', async t => {
  const server = createCloudApp({ allowedOrigins: ['https://lelekatalk.example'] });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/me`);
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'storage_not_configured');
});
