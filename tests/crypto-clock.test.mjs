import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

async function actor(name, initialTime) {
  const user = { id: randomUUID(), username: name };
  const browserSource = readFileSync(new URL('../phase-one/public/crypto.js', import.meta.url), 'utf8');
  const require = createRequire(new URL('../phase-one/package.json', import.meta.url));
  const library = new URL('./openpgp.mjs', pathToFileURL(require.resolve('openpgp'))).href;
  const source = browserSource.replace("'/vendor/openpgp.min.mjs'", JSON.stringify(library));
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${user.id}`);
  let vault;
  const api = async (route, options) => {
    if (route === 'mvp/crypto' && !options) return { vault: null, serverTime: initialTime };
    if (route === 'mvp/time') return { serverTime: Date.now() };
    if (route === 'mvp/crypto' && options?.method === 'POST') {
      const pgp = await import(library);
      const key = await pgp.readKey({ armoredKey: options.body.publicKey });
      vault = { ...options.body, fingerprint: key.getFingerprint() };
      return { vault };
    }
    throw Error('Unexpected fixture endpoint');
  };
  await module.openSession(user, api);
  return { module, user, identity: module.ownIdentity() };
}

test('a long-open receiver can decrypt a new peer message without reloading and still rejects wrong senders and context', async t => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  t.after(() => { if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else delete globalThis.window; if(savedStorage)Object.defineProperty(globalThis,'localStorage',savedStorage);else delete globalThis.localStorage; });
  // The receiver's monotonic clock did not include a long sleep/background pause.
  const receiver = await actor('receiver', Date.now() - 6 * 60 * 60_000);
  const sender = await actor('sender', Date.now());
  const outsider = await actor('outsider', Date.now());
  const pausedSender = await actor('paused_sender', Date.now() - 6 * 60 * 60_000);
  const reply = { kind: 'message', id: randomUUID(), chatId: randomUUID(), senderId: pausedSender.user.id, text: 'Send safely after the same long pause' };
  const replyCiphertext = await pausedSender.module.encryptEnvelope(reply, [sender.identity]);
  assert.deepEqual(await sender.module.decryptEnvelope(replyCiphertext, pausedSender.identity, { kind: reply.kind, id: reply.id, chatId: reply.chatId, senderId: reply.senderId }), reply);
  const payload = { kind: 'message', id: randomUUID(), chatId: randomUUID(), senderId: sender.user.id, text: 'A new message after a long background pause' };
  const encrypted = await sender.module.encryptEnvelope(payload, [receiver.identity]);
  const expected = { kind: payload.kind, id: payload.id, chatId: payload.chatId, senderId: payload.senderId };
  assert.deepEqual(await receiver.module.decryptEnvelope(encrypted, sender.identity, expected), payload);
  await assert.rejects(receiver.module.decryptEnvelope(encrypted, outsider.identity, expected));
  await assert.rejects(receiver.module.decryptEnvelope(encrypted, sender.identity, { ...expected, chatId: randomUUID() }));
  await assert.rejects(outsider.module.decryptEnvelope(encrypted, sender.identity, expected));
});
