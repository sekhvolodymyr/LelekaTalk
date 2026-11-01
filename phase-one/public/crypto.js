import * as openpgp from '/vendor/openpgp.min.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map();
let session = null;
let lifecycle = 0;
function assertCurrent(epoch, current) {
  if (epoch !== lifecycle || current && session !== current) throw new Error('keys_locked');
}
let serverClock;
let clockSync;
// Derive crypto timestamps from the server and a monotonic timer, rather than
// the device's wall clock. Backdate creation slightly for network transit.
function cryptoDate(creating = false) {
  if (!serverClock) throw new Error('keys_required');
  return new Date(serverClock.time + performance.now() - serverClock.started - (creating ? 5000 : 0));
}
async function synchronizeClock() {
  if (!session?.api) throw new Error('keys_required');
  if (clockSync) return clockSync;
  const current = session;
  const operation = (async () => {
    const { serverTime } = await current.api('mvp/time');
    if (session !== current) throw new Error('keys_locked');
    if (!Number.isSafeInteger(serverTime)) throw new Error('server_time_required');
    serverClock = { time: serverTime, started: performance.now() };
    return cryptoDate();
  })();
  clockSync = operation;
  try { return await operation; } finally { if (clockSync === operation) clockSync = null; }
}
async function storage(mode, operation, guard = () => {}) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('lelekatalk-device-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try { guard(); } catch(error) { database.close(); throw error; }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('keys', mode);
    const request = operation(transaction.objectStore('keys'));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('device_storage_error')); };
  });
}
async function saveDevice(userId, privateKey, fingerprint, guard) {
  const wrappingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  guard();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(userId) }, wrappingKey, encoder.encode(privateKey.armor()));
  guard();
  await storage('readwrite', store => store.put({ id: userId, wrappingKey, iv, encryptedKey, fingerprint }), guard);
  guard();
}
async function loadDevice(userId, fingerprint) {
  const saved = await storage('readonly', store => store.get(userId));
  if (!saved) return null;
  if (saved.fingerprint !== fingerprint) throw new Error('key_changed');
  const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv, additionalData: encoder.encode(userId) }, saved.wrappingKey, saved.encryptedKey);
  const key = await openpgp.readPrivateKey({ armoredKey: decoder.decode(decoded) });
  if (key.getFingerprint() !== fingerprint) throw new Error('key_changed');
  return key;
}
function recoverySecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,8}/g).join('-');
}
export async function openSession(user, api) {
  const epoch = ++lifecycle, guard = () => assertCurrent(epoch);
  session = null;
  serverClock = null;
  clockSync = null;
  keyCache.clear();
  if (!window.isSecureContext || !crypto.subtle) throw new Error('secure_context_required');
  const { vault, serverTime } = await api('mvp/crypto');
  guard();
  if (!Number.isSafeInteger(serverTime)) throw new Error('server_time_required');
  serverClock = { time: serverTime, started: performance.now() };
  if (vault) {
    const privateKey = await loadDevice(user.id, vault.fingerprint).catch(error => {
      if (error.message === 'key_changed') throw error;
      return null;
    });
    guard();
    session = { userId: user.id, vault, privateKey, api };
    return { locked: !privateKey };
  }
  const recoveryCode = recoverySecret();
  const generated = await openpgp.generateKey({ type: 'ecc', curve: 'curve25519', userIDs: [{ name: `@${user.username}` }], passphrase: recoveryCode, format: 'armored', date: cryptoDate(true) });
  guard();
  const result = await api('mvp/crypto', { method: 'POST', body: { publicKey: generated.publicKey, encryptedPrivateKey: generated.privateKey } });
  guard();
  const privateKey = await openpgp.decryptKey({ privateKey: await openpgp.readPrivateKey({ armoredKey: generated.privateKey }), passphrase: recoveryCode });
  guard();
  session = { userId: user.id, vault: result.vault, privateKey, api };
  let remembered = true;
  try { await saveDevice(user.id, privateKey, result.vault.fingerprint, guard); } catch { guard(); remembered = false; }
  guard();
  return { locked: false, recoveryCode, remembered };
}
export async function unlock(recoveryCode) {
  if (!session) throw new Error('keys_required');
  const current = session, epoch = lifecycle, guard = () => assertCurrent(epoch, current);
  const normalized = recoveryCode.trim().toUpperCase().replace(/\s/g, '');
  const privateKey = await openpgp.decryptKey({ privateKey: await openpgp.readPrivateKey({ armoredKey: current.vault.encryptedPrivateKey }), passphrase: normalized });
  guard();
  if (privateKey.getFingerprint() !== current.vault.fingerprint) throw new Error('key_changed');
  current.privateKey = privateKey;
  await saveDevice(current.userId, privateKey, current.vault.fingerprint, guard).catch(() => { guard(); });
  guard();
}
export function ownIdentity() {
  if (!session) throw new Error('keys_required');
  return { id: session.userId, publicKey: session.vault.publicKey, fingerprint: session.vault.fingerprint };
}
export function unlocked() { return Boolean(session?.privateKey); }
export async function closeSession(userId) {
  ++lifecycle;
  session = null;
  serverClock = null;
  clockSync = null;
  keyCache.clear();
  await storage('readwrite', store => store.delete(userId));
}
export function fingerprint(person) { return person.fingerprint.toUpperCase().match(/.{1,4}/g).join(' '); }
async function publicKey(person) {
  if (!session || !person.publicKey || !person.fingerprint) throw new Error('keys_required');
  const current = session, epoch = lifecycle;
  const pin = `leleka:peer:${session.userId}:${person.id}`;
  const previous = localStorage.getItem(pin);
  if (previous && previous !== person.fingerprint) throw new Error('key_changed');
  const key = keyCache.get(person.fingerprint) ?? await openpgp.readKey({ armoredKey: person.publicKey });
  assertCurrent(epoch, current);
  if (key.getFingerprint() !== person.fingerprint || key.isPrivate()) throw new Error('key_changed');
  keyCache.set(person.fingerprint, key);
  localStorage.setItem(pin, person.fingerprint);
  return key;
}
export async function encryptEnvelope(envelope, recipients = [ownIdentity()]) {
  if (!unlocked()) throw new Error('keys_locked');
  const current = session, epoch = lifecycle;
  const identities = [...new Map([...recipients, ownIdentity()].map(person => [person.id, person])).values()];
  await synchronizeClock();
  assertCurrent(epoch, current);
  const message = await openpgp.createMessage({ text: JSON.stringify(envelope) }), encryptionKeys = await Promise.all(identities.map(publicKey));
  assertCurrent(epoch, current);
  const ciphertext = await openpgp.encrypt({ message, encryptionKeys, signingKeys: current.privateKey, format: 'armored', date: cryptoDate(true) });
  assertCurrent(epoch, current);
  return ciphertext;
}
export async function decryptEnvelope(ciphertext, sender, expected, serverTime) {
  if (!unlocked()) throw new Error('keys_locked');
  const current = session, epoch = lifecycle;
  // Use the authenticated read response's time. A tab's projected clock can
  // become stale after sleep; never disable signature verification to compensate.
  const date = Number.isSafeInteger(serverTime) ? new Date(serverTime) : await synchronizeClock();
  assertCurrent(epoch, current);
  const message = await openpgp.readMessage({ armoredMessage: ciphertext }), verificationKeys = await publicKey(sender);
  assertCurrent(epoch, current);
  const result = await openpgp.decrypt({ message, decryptionKeys: current.privateKey, verificationKeys, expectSigned: true, format: 'utf8', date, config: { maxDecompressedMessageSize: 96_000 } });
  assertCurrent(epoch, current);
  if (result.signatures.length === 0) throw new Error('invalid_signature');
  await result.signatures[0].verified;
  assertCurrent(epoch, current);
  if (typeof result.data !== 'string' || result.data.length > 32_000) throw new Error('invalid_payload');
  const value = JSON.parse(result.data);
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) throw new Error('invalid_payload');
  return value;
}
