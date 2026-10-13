let state = 'loading';
const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export function notificationButton(language) {
  const uk = language === 'uk';
  const labels = { loading: uk ? 'Перевіряємо сповіщення…' : 'Checking notifications…', enabled: uk ? 'Вимкнути сповіщення' : 'Turn notifications off', disabled: uk ? 'Увімкнути сповіщення' : 'Turn notifications on', blocked: uk ? 'Сповіщення заблоковано браузером' : 'Notifications blocked by browser', unsupported: uk ? 'Push недоступний у цьому браузері' : 'Push unavailable in this browser', unconfigured: uk ? 'Push ще не налаштовано' : 'Push not configured yet' };
  return `<button type="button" class="button secondary small push-toggle" data-mvp="notifications" ${['loading','blocked','unsupported','unconfigured'].includes(state) ? 'disabled' : ''} aria-pressed="${state === 'enabled'}">🔔 ${labels[state]}</button>`;
}
function keyBytes(value) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0)); }
async function readyWorker() {
  const registration = await navigator.serviceWorker.register('/sw.js');
  let timer;
  const activated = async () => {
    const pending = registration.installing ?? registration.waiting;
    if (pending && pending.state !== 'activated') await new Promise((resolve,reject) => {
      const changed = () => { if (['activated','redundant'].includes(pending.state)) { pending.removeEventListener('statechange',changed); pending.state === 'activated' ? resolve() : reject(new Error('push_worker_unavailable')); } };
      pending.addEventListener('statechange',changed); changed();
    });
    return navigator.serviceWorker.ready;
  };
  try { return await Promise.race([activated(), new Promise((_,reject) => { timer=setTimeout(()=>reject(new Error('push_worker_unavailable')),8000); })]); }
  finally { clearTimeout(timer); }
}
export async function refreshNotifications(api) {
  if (!supported()) { state = 'unsupported'; return; }
  if (Notification.permission === 'denied') { state = 'blocked'; return; }
  try {
    const config = await api('mvp/push');
    if (!config.publicKey) { state = 'unconfigured'; return; }
    const registration = await readyWorker();
    const subscription = await registration.pushManager.getSubscription();
    state = subscription && config.endpoints.includes(subscription.endpoint) ? 'enabled' : 'disabled';
  } catch { state = 'disabled'; }
}
export async function toggleNotifications(api, language) {
  if (!supported()) throw new Error('push_unsupported');
  const permission = state === 'enabled' ? Notification.permission : await Notification.requestPermission();
  if (permission !== 'granted') { state = permission === 'denied' ? 'blocked' : 'disabled'; return; }
  const registration = await readyWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (state === 'enabled') {
    await api('mvp/push', { method: 'DELETE', body: { endpoint: subscription?.endpoint } });
    for (const notification of await registration.getNotifications()) notification.close();
    await subscription?.unsubscribe(); state = 'disabled'; return;
  }
  const config = await api('mvp/push');
  if (!config.publicKey) { state = 'unconfigured'; return; }
  const expectedKey = keyBytes(config.publicKey);
  if (subscription?.options.applicationServerKey && !new Uint8Array(subscription.options.applicationServerKey).every((b,i) => b === expectedKey[i])) { await subscription.unsubscribe(); subscription = null; }
  const created = !subscription;
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
  try {
    await api('mvp/push', { method: 'POST', body: { subscription: subscription.toJSON(), language } });
    state = 'enabled';
  } catch (error) { if (created) await subscription.unsubscribe().catch(() => {}); state = 'disabled'; throw error; }
}
export async function forgetNotifications() {
  state = 'loading';
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  for (const notification of await registration?.getNotifications() ?? []) notification.close();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
