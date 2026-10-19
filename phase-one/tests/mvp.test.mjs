import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import * as pgp from 'openpgp';
import { createApp } from '../server.mjs';

async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'lelekatalk-mvp-test-'));
  const server = createApp({ dataDirectory: directory });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { const done = once(server, 'close'); server.close(); server.closeAllConnections(); await done; rmSync(directory, { recursive: true, force: true }); });
  async function call(actor, route, method = 'GET', body) {
    const response = await fetch(`${origin}/api/${route}`, { method, headers: { Origin: origin, ...(actor ? { Cookie: actor.cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function actor(name) {
    const result = await call(null, 'register', 'POST', { email: `${name}@example.test`, username: name, name, password: 'a-long-test-password', ageConfirmed: true });
    assert.equal(result.status, 201);
    const code = randomUUID();
    const keys = await pgp.generateKey({ type: 'ecc', curve: 'curve25519', userIDs: [{ name }], passphrase: code });
    const person = { ...result.data.user, cookie: result.cookie, code, ...keys };
    const enrolled = await call(person, 'mvp/crypto', 'POST', { publicKey: keys.publicKey, encryptedPrivateKey: keys.privateKey });
    assert.equal(enrolled.status, 201);
    person.private = await pgp.decryptKey({ privateKey: await pgp.readPrivateKey({ armoredKey: keys.privateKey }), passphrase: code });
    person.public = await pgp.readKey({ armoredKey: keys.publicKey });
    return person;
  }
  async function encrypt(sender, recipients, payload) {
    return pgp.encrypt({ message: await pgp.createMessage({ text: JSON.stringify(payload) }), encryptionKeys: recipients.map(person => person.public), signingKeys: sender.private });
  }
  async function decrypt(receiver, sender, ciphertext) {
    const result = await pgp.decrypt({ message: await pgp.readMessage({ armoredMessage: ciphertext }), decryptionKeys: receiver.private, verificationKeys: sender.public, expectSigned: true });
    await result.signatures[0].verified;
    return JSON.parse(result.data);
  }
  return { call, actor, encrypt, decrypt, stored: () => readFileSync(path.join(directory, 'accounts.json'), 'utf8') };
}

test('direct messaging requires consent, verifies signatures, blocks outsiders and never stores plaintext', async t => {
  const app = await fixture(t); const alice = await app.actor('alice'); const bob = await app.actor('bob'); const eve = await app.actor('eve');
  assert.equal((await app.call(null, 'mvp/chats')).status, 401);
  const found = await app.call(alice, 'mvp/users?q=bob');
  assert.equal(found.data.users[0].email, undefined);
  const created = await app.call(alice, 'mvp/chats', 'POST', { type: 'direct', userId: bob.id });
  assert.equal(created.status, 201); const chat = created.data.chat;
  assert.equal(chat.ready, false);
  assert.equal((await app.call(bob, `mvp/chats/${chat.id}/messages`)).status, 403);
  const id = randomUUID(), secret = 'a-private-text-not-on-the-server';
  const ciphertext = await app.encrypt(alice, [alice, bob], { kind: 'message', id, chatId: chat.id, senderId: alice.id, text: secret });
  const body = { id, ciphertext, revision: chat.revision };
  assert.equal((await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', body)).status, 403);
  const accepted = await app.call(bob, `mvp/chats/${chat.id}/accept`, 'POST');
  assert.equal(accepted.status, 200);
  assert.equal((await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', body)).status, 409);
  body.revision = accepted.data.chat.revision;
  assert.equal((await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', { ...body, text: secret })).status, 400);
  const sent = await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', body);
  assert.equal(sent.status, 201);
  assert.equal((await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', body)).status, 200);
  const received = await app.call(bob, `mvp/chats/${chat.id}/messages`);
  assert.equal(received.data.messages.length, 1);
  assert.equal((await app.decrypt(bob, alice, received.data.messages[0].ciphertext)).text, secret);
  assert.equal((await app.decrypt(alice, alice, ciphertext)).text, secret);
  assert.equal((await app.call(eve, `mvp/chats/${chat.id}/messages`)).status, 404);
  await assert.rejects(app.decrypt(eve, alice, ciphertext));
  await assert.rejects(app.decrypt(bob, eve, ciphertext));
  await app.call(bob, `mvp/chats/${chat.id}/block`, 'POST');
  assert.equal((await app.call(alice, `mvp/chats/${chat.id}/messages`, 'POST', { ...body, id: randomUUID() })).status, 403);
  await app.call(bob, `mvp/chats/${chat.id}/unblock`, 'POST');
  assert.equal((await app.call(bob, 'mvp/reports', 'POST', { chatId: chat.id, description: 'Spam', messages: [secret] })).status, 400);
  assert.equal((await app.call(bob, 'mvp/reports', 'POST', { chatId: chat.id, description: 'Spam' })).status, 201);
  assert.ok(!app.stored().includes(secret)); assert.ok(!app.stored().includes(alice.code));
  assert.ok(!app.stored().includes(alice.private.armor()));
  assert.equal((await app.call(alice, 'mvp/crypto', 'POST', { publicKey: alice.publicKey, encryptedPrivateKey: alice.privateKey })).status, 409);
  const restored = await pgp.decryptKey({ privateKey: await pgp.readPrivateKey({ armoredKey: (await app.call(alice, 'mvp/crypto')).data.vault.encryptedPrivateKey }), passphrase: alice.code });
  assert.equal(restored.getFingerprint(), alice.private.getFingerprint());
});

test('groups require each invitee to accept and do not expose messages sent before joining', async t => {
  const app = await fixture(t); const alice = await app.actor('alice'); const bob = await app.actor('bob'); const eve = await app.actor('eve');
  let chat = (await app.call(alice, 'mvp/chats', 'POST', { type: 'group', title: 'Team', userIds: [bob.id] })).data.chat;
  assert.equal((await app.call(bob, `mvp/chats/${chat.id}/messages`)).status, 403);
  const send = async (sender, recipients, text) => {
    const id = randomUUID(); const ciphertext = await app.encrypt(sender, recipients, { kind: 'message', id, chatId: chat.id, senderId: sender.id, text });
    return app.call(sender, `mvp/chats/${chat.id}/messages`, 'POST', { id, ciphertext, revision: chat.revision });
  };
  assert.equal((await send(alice, [alice], 'Before Bob joined')).status, 201);
  chat = (await app.call(bob, `mvp/chats/${chat.id}/accept`, 'POST')).data.chat;
  assert.equal((await app.call(bob, `mvp/chats/${chat.id}/messages`)).data.messages.length, 0);
  assert.equal((await send(bob, [alice, bob], 'After consent')).status, 201);
  assert.equal((await app.call(bob, `mvp/chats/${chat.id}/invite`, 'POST', { userId: eve.id })).status, 403);
  chat = (await app.call(alice, `mvp/chats/${chat.id}/invite`, 'POST', { userId: eve.id })).data.chat;
  assert.equal((await app.call(eve, `mvp/chats/${chat.id}/messages`)).status, 403);
  chat = (await app.call(eve, `mvp/chats/${chat.id}/accept`, 'POST')).data.chat;
  assert.equal((await app.call(eve, `mvp/chats/${chat.id}/messages`)).data.messages.length, 0);
  assert.equal((await send(alice, [alice, bob, eve], 'Everyone joined')).status, 201);
  const eveHistory = await app.call(eve, `mvp/chats/${chat.id}/messages`);
  assert.equal(eveHistory.data.messages.length, 1);
  await app.call(bob, `mvp/chats/${chat.id}/leave`, 'POST');
  assert.equal((await app.call(bob, `mvp/chats/${chat.id}/messages`)).status, 404);
  const aliceHistory = await app.call(alice, `mvp/chats/${chat.id}/messages`);
  assert.equal(aliceHistory.data.chat.members.find(member => member.id === bob.id).status, 'left');
  assert.equal((await app.decrypt(alice, bob, aliceHistory.data.messages[1].ciphertext)).text, 'After consent');
});

test('channels enforce ownership, feed follows subscriptions and public profiles respect hidden linkage', async t => {
  const app = await fixture(t); const alice = await app.actor('alice'); const bob = await app.actor('bob');
  const channel = (await app.call(alice, 'mvp/channels', 'POST', { title: 'Design notes', description: 'Ideas', topic: 'creative' })).data.channel;
  assert.equal(channel.personalUsername, null); assert.equal(channel.ownerId, undefined);
  assert.equal((await app.call(bob, `mvp/channels/${channel.id}/posts`, 'POST', { text: 'Unauthorized' })).status, 403);
  const post = (await app.call(alice, `mvp/channels/${channel.id}/posts`, 'POST', { text: 'A public creative idea' })).data.post;
  assert.equal((await app.call(bob, 'mvp/feed?mode=following')).data.posts.length, 0);
  await app.call(bob, `mvp/channels/${channel.id}/follow`, 'POST', { following: true });
  assert.equal((await app.call(bob, 'mvp/feed?mode=following')).data.posts[0].id, post.id);
  await app.call(bob, `mvp/posts/${post.id}/like`, 'POST', { liked: true });
  await app.call(bob, `mvp/posts/${post.id}/like`, 'POST', { liked: true });
  await app.call(bob, `mvp/posts/${post.id}/comments`, 'POST', { text: 'Great idea' });
  const feed = (await app.call(bob, 'mvp/feed')).data.posts;
  assert.equal(feed[0].likes, 1); assert.equal(feed[0].comments[0].text, 'Great idea');
  assert.equal(feed[0].comments[0].authorId, undefined);
  assert.equal((await app.call(bob, `mvp/posts/${post.id}`, 'DELETE')).status, 403);
  await app.call(alice, 'profile', 'PATCH', { showProfileLink: true });
  assert.equal((await app.call(bob, 'mvp/channels')).data.channels[0].personalUsername, 'alice');
  assert.equal((await app.call(alice, `mvp/posts/${post.id}`, 'DELETE')).status, 200);
  assert.equal((await app.call(bob, 'mvp/feed')).data.posts.length, 0);
});

test('calendar and habits store encrypted names, enforce ownership and use idempotent completion changes', async t => {
  const app = await fixture(t); const alice = await app.actor('alice'); const bob = await app.actor('bob');
  const planId = randomUUID(), habitId = randomUUID();
  const planCipher = await app.encrypt(alice, [alice], { kind: 'plan', id: planId, title: 'Private meeting title' });
  const habitCipher = await app.encrypt(alice, [alice], { kind: 'habit', id: habitId, title: 'Private habit name' });
  assert.equal((await app.call(alice, 'mvp/plans', 'POST', { id: planId, date: '2026-02-30', time: '12:00', ciphertext: planCipher })).status, 400);
  assert.equal((await app.call(alice, 'mvp/plans', 'POST', { id: planId, date: '2026-10-09', time: '12:00', ciphertext: planCipher })).status, 201);
  assert.equal((await app.call(alice, 'mvp/habits', 'POST', { id: habitId, ciphertext: habitCipher })).status, 201);
  assert.equal((await app.call(bob, 'mvp/plans')).data.plans.length, 0);
  assert.equal((await app.call(bob, `mvp/plans/${planId}`, 'PATCH', { done: true })).status, 404);
  assert.equal((await app.call(bob, `mvp/habits/${habitId}`, 'DELETE')).status, 404);
  await app.call(alice, `mvp/plans/${planId}`, 'PATCH', { done: true });
  await app.call(alice, `mvp/habits/${habitId}`, 'PATCH', { date: '2026-10-09', completed: true });
  await app.call(alice, `mvp/habits/${habitId}`, 'PATCH', { date: '2026-10-09', completed: true });
  assert.equal((await app.call(alice, 'mvp/plans')).data.plans[0].done, true);
  const habit = (await app.call(alice, 'mvp/habits')).data.habits[0];
  assert.deepEqual(habit.completedDates, ['2026-10-09']);
  assert.equal((await app.decrypt(alice, alice, habit.ciphertext)).title, 'Private habit name');
  assert.ok(!app.stored().includes('Private meeting title')); assert.ok(!app.stored().includes('Private habit name'));
  await app.call(alice, `mvp/plans/${planId}`, 'DELETE');
  assert.equal((await app.call(alice, 'mvp/plans')).data.plans.length, 0);
});

test('calendar events can be renamed and rescheduled privately with atomic validation and ownership checks',async t=>{
  const app=await fixture(t),alice=await app.actor('alice'),bob=await app.actor('bob'),id=randomUUID();
  const ciphertext=await app.encrypt(alice,[alice],{kind:'plan',id,title:'Original private title'});
  await app.call(alice,'mvp/plans','POST',{id,date:'2026-10-19',time:'09:00',ciphertext});
  const changed=await app.encrypt(alice,[alice],{kind:'plan',id,title:'Edited private title'});
  assert.equal((await app.call(bob,`mvp/plans/${id}`,'PATCH',{date:'2026-10-20',ciphertext:changed})).status,404);
  assert.equal((await app.call(alice,`mvp/plans/${id}`,'PATCH',{date:'2026-10-20',time:'25:00',ciphertext:changed})).status,400);
  assert.equal((await app.call(alice,'mvp/plans')).data.plans[0].date,'2026-10-19');
  assert.equal((await app.call(alice,`mvp/plans/${id}`,'PATCH',{title:'plaintext'})).status,400);
  assert.equal((await app.call(alice,`mvp/plans/${id}`,'PATCH',{date:'2026-10-20',time:'14:30',ciphertext:changed})).status,200);
  const plan=(await app.call(alice,'mvp/plans')).data.plans[0];assert.equal(plan.date,'2026-10-20');assert.equal(plan.time,'14:30');assert.equal((await app.decrypt(alice,alice,plan.ciphertext)).title,'Edited private title');assert.ok(!app.stored().includes('Edited private title'));
});

test('Google Calendar configuration exposes only the public client ID to authenticated users',async t=>{
  const previous=process.env.GOOGLE_CALENDAR_CLIENT_ID;t.after(()=>{if(previous===undefined)delete process.env.GOOGLE_CALENDAR_CLIENT_ID;else process.env.GOOGLE_CALENDAR_CLIENT_ID=previous;});
  const app=await fixture(t),alice=await app.actor('alice');
  assert.equal((await app.call(null,'mvp/google-calendar/config')).status,401);
  process.env.GOOGLE_CALENDAR_CLIENT_ID='123-app.apps.googleusercontent.com';assert.deepEqual((await app.call(alice,'mvp/google-calendar/config')).data,{clientId:'123-app.apps.googleusercontent.com'});
  process.env.GOOGLE_CALENDAR_CLIENT_ID='not-a-client';assert.deepEqual((await app.call(alice,'mvp/google-calendar/config')).data,{clientId:null});
});
