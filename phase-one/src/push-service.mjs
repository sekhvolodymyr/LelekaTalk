import { randomUUID } from 'node:crypto';
import webpush from 'web-push';

export function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || value.endpoint.length > 4096) return false;
    if (!(host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com'))) return false;
    const { p256dh, auth } = value.keys;
    return /^[\w-]+$/.test(p256dh) && /^[\w-]+$/.test(auth) && Buffer.from(p256dh, 'base64url').length === 65 && Buffer.from(p256dh, 'base64url')[0] === 4 && Buffer.from(auth, 'base64url').length === 16;
  } catch { return false; }
}

export function queueMessagePush(database, chat, message) {
  const now = Date.now();
  database.pushOutbox = (database.pushOutbox ?? []).filter(job => job.expiresAt > now).slice(-1000);
  for (const subscription of database.pushSubscriptions ?? []) {
    if (subscription.userId === message.senderId || !message.audience.includes(subscription.userId)) continue;
    if (database.mvp.blocks.some(b => (b.from === message.senderId && b.to === subscription.userId) || (b.to === message.senderId && b.from === subscription.userId))) continue;
    if (!database.sessions.some(s => s.tokenHash === subscription.sessionHash && s.expiresAt > now)) continue;
    database.pushOutbox.push({ id: randomUUID(), subscriptionId: subscription.id, chatId: chat.id, senderId: message.senderId, type:message.type==='call'?'call':'message', ...(message.callId?{callId:message.callId}:{}), attempts: 0, nextAttempt: now, expiresAt: now + (message.type==='call'?60_000:5*60_000) });
  }
  database.pushOutbox = database.pushOutbox.slice(-1000);
}

export function createPushService({ publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT ?? 'https://lelekatalk.vercel.app', send = webpush.sendNotification.bind(webpush) } = {}) {
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    async drain(store) {
      // Claim after message COMMIT. Leases prevent parallel instances duplicating
      // delivery; subsequent API activity retries transient failures for 5 minutes.
      for (let batch = 0; batch < 3; batch++) {
        const lease = randomUUID();
        const jobs = await store.run(true, database => {
          const now = Date.now();
          database.pushOutbox = (database.pushOutbox ?? []).filter(job => job.expiresAt > now && job.attempts < 4);
          const selected = [];
          for (const job of database.pushOutbox) {
            if (selected.length >= 50 || job.nextAttempt > now || job.leaseUntil > now) continue;
            const subscription = database.pushSubscriptions?.find(s => s.id === job.subscriptionId);
            const chat = database.mvp.chats.find(c => c.id === job.chatId);
            const allowed = subscription && validSubscription(subscription) && database.sessions.some(s => s.tokenHash === subscription.sessionHash && s.expiresAt > now) && chat?.members.some(m => m.userId === subscription.userId && m.status === 'accepted') && !database.mvp.blocks.some(b => (b.from === job.senderId && b.to === subscription.userId) || (b.to === job.senderId && b.from === subscription.userId));
            const ringing=job.type!=='call'||database.calls?.some(call=>call.id===job.callId&&call.status==='ringing'&&call.expiresAt>now);
            if (!allowed || !ringing) { job.expiresAt = 0; continue; }
            job.lease = lease; job.leaseUntil = now + 20_000; job.attempts++;
            selected.push({ ...job, subscription: structuredClone(subscription) });
          }
          database.pushOutbox = database.pushOutbox.filter(job => job.expiresAt > now);
          return selected;
        });
        if (!jobs.length) break;
        const outcomes = await Promise.all(jobs.map(async job => {
          try {
            await send({ endpoint: job.subscription.endpoint, keys: job.subscription.keys }, JSON.stringify({ type: job.type??'message', chatId: job.chatId, userId: job.subscription.userId, language: job.subscription.language }), { vapidDetails: { subject, publicKey, privateKey }, TTL: Math.max(1,Math.min(300,Math.ceil((job.expiresAt-Date.now())/1000))), urgency: 'high', timeout: 4000 });
            return { id: job.id, done: true };
          } catch (error) { return { id: job.id, done: [404, 410].includes(error.statusCode), expired: [404, 410].includes(error.statusCode), subscriptionId: job.subscription.id }; }
        }));
        await store.run(true, database => {
          for (const outcome of outcomes) {
            const job = database.pushOutbox?.find(j => j.id === outcome.id && j.lease === lease);
            if (!job) continue;
            if (outcome.expired) database.pushSubscriptions = database.pushSubscriptions.filter(s => s.id !== outcome.subscriptionId);
            if (outcome.done) job.expiresAt = 0;
            else { delete job.lease; delete job.leaseUntil; job.nextAttempt = Date.now() + 15_000 * job.attempts; }
          }
          database.pushOutbox = database.pushOutbox.filter(job => job.expiresAt > Date.now());
        });
      }
    },
  };
}
