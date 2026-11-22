// App de Endulcora: recibe las notificaciones y abre la pagina del aviso.
// No guarda paginas en cache: la app siempre muestra el sitio al dia.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Sin internet: en lugar del error del navegador, una pantalla de Endulcora.
const SIN_CONEXION = '<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · Endulcora</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF4E9;font-family:system-ui,sans-serif;color:#1B0720;text-align:center;padding:24px}b{display:block;font-size:22px;color:#4E1454;margin-bottom:8px}button{margin-top:18px;border:0;border-radius:999px;background:#4E1454;color:#FBF4E9;padding:12px 22px;font-size:15px}</style></head><body><div><b>Sin conexión</b>Revisa tu internet y vuelve a intentarlo.<br><button onclick="location.reload()">Intentar de nuevo</button></div></body></html>';
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { cuerpo: e.data && e.data.text() }; }
  const titulo = d.titulo || 'Endulcora';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: '/app/icono-192.png?v=2',
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
