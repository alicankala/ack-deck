const SHELL = 'ack-mobile-shell-__ACK_BUILD__';
const PRELOAD = '__ACK_PRECACHE__';
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(Array.isArray(PRELOAD) ? PRELOAD : ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'])).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ack-mobile-shell-') && key !== SHELL).map(key => caches.delete(key))))])));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const clone = response.clone(); void caches.open(SHELL).then(cache => cache.put(event.request, clone)); } return response; }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match('/') : undefined) || new Response('Çevrimdışı içerik bulunamadı.', {status:503})));
});
self.addEventListener('push', event => {
  let data; try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data.body !== 'string') return;
  const url = typeof data.url === 'string' && (data.url.startsWith('/#task=') || data.url === '/#page=subscriptions') ? data.url : '/';
  event.waitUntil(self.registration.showNotification('ACKDeck', {body:data.body.slice(0,600),tag:String(data.tag || 'ackdeck'),icon:'/icon-192.png',badge:'/icon-192.png',data:{url}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients => { const target = new URL(event.notification.data?.url || '/', self.location.origin).href; for (const client of clients) { if (new URL(client.url).origin === self.location.origin) { await client.navigate(target); return client.focus(); } } return self.clients.openWindow(target); }));
});
