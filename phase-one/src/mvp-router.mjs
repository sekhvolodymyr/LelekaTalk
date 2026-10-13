import { randomUUID } from 'node:crypto';
import * as openpgp from 'openpgp';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOPICS = ['creative', 'technology', 'learning', 'life'];

export function createMvpRouter({ database, persist, getUser, readBody, send, fail }) {
  const db = database.mvp ??= { version: 1, chats: [], messages: [], blocks: [], channels: [], posts: [], comments: [], plans: [], habits: [], reports: [] };
  if (db.version !== 1) throw new Error('Unsupported MVP database version.');
  persist();
  const userById = id => database.users.find(user => user.id === id);
  const person = user => ({ id: user.id, username: user.username, name: user.personalName, cryptoReady: Boolean(user.crypto), publicKey: user.crypto?.publicKey ?? null, fingerprint: user.crypto?.fingerprint ?? null });
  const blocked = (a, b) => db.blocks.some(item => (item.from === a && item.to === b) || (item.from === b && item.to === a));
  const isMember = (chat, id) => chat.members.some(member => member.userId === id && member.status === 'accepted');
  function requireChat(id, user, accepted = false) {
    const chat = db.chats.find(item => item.id === id);
    if (!chat || !chat.members.some(member => member.userId === user.id && ['accepted', 'invited'].includes(member.status))) throw fail(404, 'chat_not_found');
    if (accepted && !isMember(chat, user.id)) throw fail(403, 'invitation_required');
    return chat;
  }
  const chatDTO = (chat, user) => ({
    id: chat.id, type: chat.type, title: chat.title, ownerId: chat.ownerId, revision: chat.revision,
    members: chat.members.filter(member => ['accepted', 'invited', 'left'].includes(member.status)).map(member => ({ ...person(userById(member.userId)), status: member.status })),
    myStatus: chat.members.find(member => member.userId === user.id)?.status,
    ready: chat.type === 'group' || chat.members.every(member => member.status === 'accepted'),
    blocked: chat.type === 'direct' && blocked(chat.members[0].userId, chat.members[1].userId),
    blockedByMe: chat.type === 'direct' && db.blocks.some(item => item.from === user.id && chat.members.some(member => member.userId === item.to)),
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: db.messages.filter(message => message.chatId === chat.id && message.audience.includes(user.id)).length,
  });
  function cleanText(value, maximum, code = 'invalid_text') {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw fail(400, code);
    return value.trim();
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail(400, 'invalid_date');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw fail(400, 'invalid_date');
    return value;
  }
  async function encrypted(value) {
    if (typeof value !== 'string' || value.length > 96_000 || !value.startsWith('-----BEGIN PGP MESSAGE-----')) throw fail(400, 'encrypted_payload_required');
    try {
      const packet = await openpgp.readMessage({ armoredMessage: value });
      if (packet.getEncryptionKeyIDs().length === 0) throw new Error();
    } catch { throw fail(400, 'invalid_ciphertext'); }
    return value;
  }
  function recordId(value) {
    if (typeof value !== 'string' || !UUID.test(value)) throw fail(400, 'invalid_id');
    return value;
  }
  function targetUser(id, self) {
    const target = userById(id);
    if (!target || target.id === self.id || !target.crypto) throw fail(400, 'invalid_recipient');
    if (blocked(target.id, self.id)) throw fail(403, 'user_blocked');
    return target;
  }
  const channelDTO = (channel, user) => {
    const owner = userById(channel.ownerId);
    return { id: channel.id, title: channel.title, description: channel.description, topic: channel.topic, creatorName: owner.creatorName, personalUsername: owner.showProfileLink ? owner.username : null, isOwner: channel.ownerId === user.id, following: channel.followers.includes(user.id), followers: channel.followers.length, createdAt: channel.createdAt };
  };
  const postDTO = (post, user) => ({
    id: post.id, text: post.text, createdAt: post.createdAt,
    channel: channelDTO(db.channels.find(channel => channel.id === post.channelId), user),
    likes: post.likes.length, liked: post.likes.includes(user.id),
    comments: db.comments.filter(comment => comment.postId === post.id).map(comment => ({ id: comment.id, text: comment.text, authorName: comment.authorName, createdAt: comment.createdAt, isMine: comment.authorId === user.id })),
  });

  return async function route(request, response, url) {
    if (!url.pathname.startsWith('/api/mvp/')) return false;
    const user = getUser(request);
    if (!user) throw fail(401, 'authentication_required');
    const pathname = url.pathname.slice('/api/mvp'.length);
    const method = request.method;
    const reply = (status, value) => { send(response, status, value); return true; };

    if (pathname === '/crypto' && method === 'GET') return reply(200, { vault: user.crypto ?? null, serverTime: Date.now() });
    if (pathname === '/crypto' && method === 'POST') {
      if (user.crypto) throw fail(409, 'key_already_enrolled');
      const body = await readBody(request);
      if (typeof body.publicKey !== 'string' || body.publicKey.length > 16_000 || typeof body.encryptedPrivateKey !== 'string' || body.encryptedPrivateKey.length > 32_000) throw fail(400, 'invalid_key');
      let publicKey, privateKey;
      try {
        publicKey = await openpgp.readKey({ armoredKey: body.publicKey });
        privateKey = await openpgp.readPrivateKey({ armoredKey: body.encryptedPrivateKey });
        if (publicKey.isPrivate() || privateKey.isDecrypted() || publicKey.getFingerprint() !== privateKey.getFingerprint()) throw new Error();
        await publicKey.verifyPrimaryKey();
      } catch { throw fail(400, 'invalid_key'); }
      if (user.crypto) throw fail(409, 'key_already_enrolled');
      user.crypto = { publicKey: body.publicKey, encryptedPrivateKey: body.encryptedPrivateKey, fingerprint: publicKey.getFingerprint(), createdAt: new Date().toISOString() };
      persist();
      return reply(201, { vault: user.crypto });
    }
    if (pathname === '/users' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').replace(/^@/, '').trim().toLowerCase();
      if (query.length < 2) return reply(200, { users: [] });
      return reply(200, { users: database.users.filter(target => target.id !== user.id && target.crypto && !blocked(user.id, target.id) && (target.username.includes(query) || target.personalName.toLowerCase().includes(query))).slice(0, 20).map(person) });
    }
    if (pathname === '/chats' && method === 'GET') {
      return reply(200, { chats: db.chats.filter(chat => chat.members.some(member => member.userId === user.id && ['accepted', 'invited'].includes(member.status))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(chat => chatDTO(chat, user)) });
    }
    if (pathname === '/chats' && method === 'POST') {
      if (!user.crypto) throw fail(409, 'keys_required');
      const body = await readBody(request);
      const now = new Date().toISOString();
      let chat;
      if (body.type === 'direct') {
        const target = targetUser(body.userId, user);
        const existing = db.chats.find(item => item.type === 'direct' && item.members.some(member => member.userId === user.id) && item.members.some(member => member.userId === target.id));
        if (existing) return reply(200, { chat: chatDTO(existing, user) });
        chat = { id: randomUUID(), type: 'direct', title: '', ownerId: user.id, revision: 1, members: [{ userId: user.id, status: 'accepted', joinedAt: now }, { userId: target.id, status: 'invited', joinedAt: null }], createdAt: now, updatedAt: now };
      } else if (body.type === 'group') {
        const title = cleanText(body.title, 80, 'invalid_title');
        if (!Array.isArray(body.userIds) || body.userIds.length < 1 || body.userIds.length > 24 || new Set(body.userIds).size !== body.userIds.length) throw fail(400, 'invalid_members');
        const targets = body.userIds.map(id => targetUser(id, user));
        chat = { id: randomUUID(), type: 'group', title, ownerId: user.id, revision: 1, members: [{ userId: user.id, status: 'accepted', joinedAt: now }, ...targets.map(target => ({ userId: target.id, status: 'invited', joinedAt: null }))], createdAt: now, updatedAt: now };
      } else throw fail(400, 'invalid_chat_type');
      db.chats.push(chat);
      persist();
      return reply(201, { chat: chatDTO(chat, user) });
    }
    let match = /^\/chats\/([^/]+)\/(accept|reject|invite|leave|block|unblock|messages)$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const chat = requireChat(id, user, ['invite', 'leave', 'block', 'unblock', 'messages'].includes(action));
      if (['accept', 'reject'].includes(action) && method === 'POST') {
        const member = chat.members.find(item => item.userId === user.id);
        if (member.status !== 'invited') throw fail(409, 'not_pending');
        if (action === 'accept' && chat.type === 'direct' && blocked(chat.members[0].userId, chat.members[1].userId)) throw fail(403, 'user_blocked');
        member.status = action === 'accept' ? 'accepted' : 'rejected';
        member.joinedAt = action === 'accept' ? new Date().toISOString() : null;
        chat.revision += 1;
        chat.updatedAt = new Date().toISOString();
        persist();
        return reply(200, { chat: chatDTO(chat, user) });
      }
      if (action === 'invite' && method === 'POST') {
        if (chat.type !== 'group' || chat.ownerId !== user.id) throw fail(403, 'owner_required');
        const body = await readBody(request);
        const target = targetUser(body.userId, user);
        if (chat.members.some(member => member.userId === target.id)) throw fail(409, 'already_invited');
        if (chat.members.filter(member => ['accepted', 'invited'].includes(member.status)).length >= 25) throw fail(400, 'group_full');
        chat.members.push({ userId: target.id, status: 'invited', joinedAt: null });
        chat.revision += 1;
        chat.updatedAt = new Date().toISOString();
        persist();
        return reply(200, { chat: chatDTO(chat, user) });
      }
      if (action === 'leave' && method === 'POST') {
        if (chat.type !== 'group' || chat.ownerId === user.id) throw fail(400, 'cannot_leave');
        chat.members.find(member => member.userId === user.id).status = 'left';
        chat.revision += 1;
        chat.updatedAt = new Date().toISOString();
        persist();
        return reply(200, { ok: true });
      }
      if (['block', 'unblock'].includes(action) && method === 'POST') {
        if (chat.type !== 'direct') throw fail(400, 'direct_only');
        const target = chat.members.find(member => member.userId !== user.id).userId;
        db.blocks = db.blocks.filter(item => !(item.from === user.id && item.to === target));
        if (action === 'block') db.blocks.push({ from: user.id, to: target });
        persist();
        return reply(200, { chat: chatDTO(chat, user) });
      }
      if (action === 'messages' && method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0);
        const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
        if (!Number.isSafeInteger(after) || !Number.isSafeInteger(before) || after < 0 || before < 1) throw fail(400, 'invalid_cursor');
        const messages = db.messages.filter(message => message.chatId === chat.id && message.audience.includes(user.id) && message.seq > after && message.seq < before);
        return reply(200, { messages: messages.slice(-100), hasMore: messages.length > 100, chat: chatDTO(chat, user) });
      }
      if (action === 'messages' && method === 'POST') {
        if (!user.crypto || !chat.members.every(member => member.status !== 'invited' || chat.type === 'group')) throw fail(403, 'invitation_required');
        if (chat.type === 'direct' && (!chat.members.every(member => member.status === 'accepted') || blocked(chat.members[0].userId, chat.members[1].userId))) throw fail(403, 'messaging_not_allowed');
        const body = await readBody(request);
        if (Object.keys(body).some(key => !['id', 'ciphertext', 'revision'].includes(key))) throw fail(400, 'encrypted_payload_required');
        const messageId = recordId(body.id);
        const ciphertext = await encrypted(body.ciphertext);
        requireChat(id, user, true);
        if (chat.type === 'direct' && (!chat.members.every(member => member.status === 'accepted') || blocked(chat.members[0].userId, chat.members[1].userId))) throw fail(403, 'messaging_not_allowed');
        if (body.revision !== chat.revision) throw fail(409, 'members_changed');
        const existing = db.messages.find(message => message.id === messageId);
        if (existing) {
          if (existing.chatId !== chat.id || existing.senderId !== user.id || existing.ciphertext !== ciphertext) throw fail(409, 'message_conflict');
          return reply(200, { message: existing });
        }
        const now = new Date().toISOString();
        const message = { id: messageId, seq: (db.messages.at(-1)?.seq ?? 0) + 1, chatId: chat.id, senderId: user.id, ciphertext, audience: chat.members.filter(member => member.status === 'accepted').map(member => member.userId), createdAt: now };
        db.messages.push(message);
        chat.updatedAt = now;
        persist();
        return reply(201, { message });
      }
    }
    if (pathname === '/reports' && method === 'POST') {
      const body = await readBody(request);
      requireChat(body.chatId, user);
      if (Object.keys(body).some(key => !['chatId', 'description'].includes(key))) throw fail(400, 'description_only');
      db.reports.push({ id: randomUUID(), reporterId: user.id, chatId: body.chatId, description: cleanText(body.description, 2000), createdAt: new Date().toISOString() });
      persist();
      return reply(201, { ok: true });
    }
    if (pathname === '/channels' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const topic = url.searchParams.get('topic');
      return reply(200, { channels: db.channels.filter(channel => (!query || channel.title.toLowerCase().includes(query)) && (!topic || channel.topic === topic)).slice(-100).reverse().map(channel => channelDTO(channel, user)) });
    }
    if (pathname === '/channels' && method === 'POST') {
      const body = await readBody(request);
      const title = cleanText(body.title, 80, 'invalid_title');
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (description.length > 500 || !TOPICS.includes(body.topic)) throw fail(400, 'invalid_channel');
      const channel = { id: randomUUID(), ownerId: user.id, title, description, topic: body.topic, followers: [user.id], createdAt: new Date().toISOString() };
      db.channels.push(channel);
      persist();
      return reply(201, { channel: channelDTO(channel, user) });
    }
    match = /^\/channels\/([^/]+)(?:\/(follow|posts))?$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const channel = db.channels.find(item => item.id === id);
      if (!channel) throw fail(404, 'channel_not_found');
      if (!action && method === 'GET') return reply(200, { channel: channelDTO(channel, user), posts: db.posts.filter(post => post.channelId === channel.id).slice(-100).reverse().map(post => postDTO(post, user)) });
      if (action === 'follow' && method === 'POST') {
        const body = await readBody(request);
        if (typeof body.following !== 'boolean') throw fail(400, 'invalid_follow');
        channel.followers = channel.followers.filter(id => id !== user.id);
        if (body.following) channel.followers.push(user.id);
        persist();
        return reply(200, { channel: channelDTO(channel, user) });
      }
      if (action === 'posts' && method === 'POST') {
        if (channel.ownerId !== user.id) throw fail(403, 'owner_required');
        const body = await readBody(request);
        const post = { id: randomUUID(), channelId: channel.id, text: cleanText(body.text, 5000), likes: [], createdAt: new Date().toISOString() };
        db.posts.push(post);
        persist();
        return reply(201, { post: postDTO(post, user) });
      }
    }
    if (pathname === '/feed' && method === 'GET') {
      const following = url.searchParams.get('mode') === 'following';
      const followed = db.channels.filter(channel => channel.followers.includes(user.id));
      const interests = new Set(followed.map(channel => channel.topic));
      const likedTopics = db.posts.filter(post => post.likes.includes(user.id)).map(post => db.channels.find(channel => channel.id === post.channelId)?.topic);
      for (const topic of likedTopics) if (topic) interests.add(topic);
      const score = post => {
        const channel = db.channels.find(item => item.id === post.channelId);
        return (channel.followers.includes(user.id) ? 3 : 0) + (interests.has(channel.topic) ? 2 : 0);
      };
      const posts = db.posts.filter(post => !following || followed.some(channel => channel.id === post.channelId)).sort((a, b) => (following ? 0 : score(b) - score(a)) || b.createdAt.localeCompare(a.createdAt));
      return reply(200, { posts: posts.slice(0, 100).map(post => postDTO(post, user)) });
    }
    match = /^\/posts\/([^/]+)(?:\/(like|comments))?$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const post = db.posts.find(item => item.id === id);
      if (!post) throw fail(404, 'post_not_found');
      if (action === 'like' && method === 'POST') {
        const body = await readBody(request);
        if (typeof body.liked !== 'boolean') throw fail(400, 'invalid_like');
        post.likes = post.likes.filter(id => id !== user.id);
        if (body.liked) post.likes.push(user.id);
        persist();
        return reply(200, { post: postDTO(post, user) });
      }
      if (action === 'comments' && method === 'POST') {
        const body = await readBody(request);
        db.comments.push({ id: randomUUID(), postId: post.id, authorId: user.id, authorName: user.activeProfile === 'creator' ? user.creatorName : user.personalName, text: cleanText(body.text, 2000), createdAt: new Date().toISOString() });
        persist();
        return reply(201, { post: postDTO(post, user) });
      }
      if (!action && method === 'DELETE') {
        if (db.channels.find(channel => channel.id === post.channelId)?.ownerId !== user.id) throw fail(403, 'owner_required');
        db.posts = db.posts.filter(item => item.id !== post.id);
        db.comments = db.comments.filter(item => item.postId !== post.id);
        persist();
        return reply(200, { ok: true });
      }
    }
    if (pathname === '/plans' && method === 'GET') return reply(200, { plans: db.plans.filter(plan => plan.ownerId === user.id).map(({ ownerId, ...plan }) => plan) });
    if (pathname === '/plans' && method === 'POST') {
      const body = await readBody(request);
      const id = recordId(body.id);
      const day = date(body.date);
      const time = body.time ?? '';
      if (typeof time !== 'string' || (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) throw fail(400, 'invalid_time');
      const ciphertext = await encrypted(body.ciphertext);
      if (db.plans.some(plan => plan.id === id)) throw fail(409, 'record_exists');
      const plan = { id, ownerId: user.id, date: day, time, ciphertext, done: false, createdAt: new Date().toISOString() };
      db.plans.push(plan);
      persist();
      return reply(201, { plan: { ...plan, ownerId: undefined } });
    }
    match = /^\/(plans|habits)\/([^/]+)$/.exec(pathname);
    if (match && ['PATCH', 'DELETE'].includes(method)) {
      const [, collection, id] = match;
      const record = db[collection].find(item => item.id === id && item.ownerId === user.id);
      if (!record) throw fail(404, 'record_not_found');
      if (method === 'DELETE') db[collection] = db[collection].filter(item => item !== record);
      else {
        const body = await readBody(request);
        if (collection === 'plans') {
          if (typeof body.done !== 'boolean') throw fail(400, 'invalid_done');
          record.done = body.done;
        } else {
          const day = date(body.date);
          if (typeof body.completed !== 'boolean') throw fail(400, 'invalid_done');
          record.completedDates = record.completedDates.filter(value => value !== day);
          if (body.completed) record.completedDates.push(day);
          record.completedDates.sort();
        }
      }
      persist();
      return reply(200, { ok: true });
    }
    if (pathname === '/habits' && method === 'GET') return reply(200, { habits: db.habits.filter(habit => habit.ownerId === user.id).map(({ ownerId, ...habit }) => habit) });
    if (pathname === '/habits' && method === 'POST') {
      const body = await readBody(request);
      const id = recordId(body.id);
      const ciphertext = await encrypted(body.ciphertext);
      if (db.habits.some(habit => habit.id === id)) throw fail(409, 'record_exists');
      const habit = { id, ownerId: user.id, ciphertext, completedDates: [], createdAt: new Date().toISOString() };
      db.habits.push(habit);
      persist();
      return reply(201, { habit: { ...habit, ownerId: undefined } });
    }
    throw fail(404, 'not_found');
  };
}
