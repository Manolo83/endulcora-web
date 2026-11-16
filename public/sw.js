// App de Endulcora: recibe las notificaciones y abre la pagina del aviso.
// No guarda paginas en cache: la app siempre muestra el sitio al dia.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { cuerpo: e.data && e.data.text() }; }
  const titulo = d.titulo || 'Endulcora';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: '/app/icono-192.png',
    badge: '/app/badge-96.png',
    image: d.imagen || undefined,
    tag: d.clave || undefined,
    data: { url: d.url || '/', envio: d.envio || null },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  const envio = e.notification.data && e.notification.data.envio;
  if (envio) fetch('/api/push/abierta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envio }) }).catch(() => {});
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
