const CACHE = 'lelekatalk-shell-v5';
const ASSETS = ['/', '/styles.css', '/app.js', '/mvp.js', '/crypto.js', '/push.js', '/emoji.js', '/calls.js', '/vendor/openpgp.min.mjs', '/logo.png', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lelekatalk-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data; try { data=event.data?.json(); } catch { return; }
    if(!['message','call'].includes(data?.type) || !/^[a-f0-9-]{36}$/.test(data.chatId) || !/^[a-f0-9-]{36}$/.test(data.userId))return;
    try { const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});if(!response.ok || (await response.json()).user.id!==data.userId)return; } catch { return; }
    const body=data.type==='call'?(data.language==='en'?'Incoming audio call. Open LelekaTalk to answer.':'Вхідний аудіодзвінок. Відкрий LelekaTalk, щоб відповісти.'):(data.language==='en'?'New message. Open the chat to read it.':'Нове повідомлення. Відкрий чат, щоб прочитати.');
    await self.registration.showNotification('LelekaTalk',{body,icon:'/logo.png',badge:'/icon.svg',tag:`${data.type}-${data.chatId}`,data:{chatId:data.chatId},renotify:true});
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id=event.notification.data?.chatId;if(!/^[a-f0-9-]{36}$/.test(id))return;
  const url=new URL(`/?chat=${encodeURIComponent(id)}`,self.location.origin).href;
  event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);if(existing){await existing.navigate(url);await existing.focus();}else await self.clients.openWindow(url);})());
});
