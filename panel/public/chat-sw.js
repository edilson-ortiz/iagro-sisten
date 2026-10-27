// Service worker del chat web IAGRO (alcance /chat/): notificaciones push y app instalable.
// Lo registra src/app/chat/[tel]/chat.tsx.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const ventanasDelChat = () =>
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((lista) => lista.filter((c) => new URL(c.url).pathname.startsWith('/chat/')));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // Con el chat abierto y a la vista, la respuesta ya aparece en pantalla: no se avisa.
    // Las difusiones del panel no están en el chat: esas se muestran siempre.
    const abiertas = await ventanasDelChat();
    if (d.tipo !== 'difusion' && abiertas.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(d.titulo || 'IAGRO Clima', {
      body: d.texto || 'Nuevo mensaje',
      icon: '/img/app-192.png',
      badge: '/img/app-96.png',
      tag: d.tipo === 'difusion' ? `iagro-aviso-${Date.now()}` : 'iagro-chat',
      renotify: true,
      data: { url: d.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const abiertas = await ventanasDelChat();
    if (abiertas.length) return abiertas[0].focus();
    return self.clients.openWindow(url);
  })());
});
