// オフライン対応：まずネットから取り、取れたら保存。つながらないときだけ保存しておいたものを使う。
// （常に新しい版を優先するので、更新が反映されないということは起きない）
'use strict';
const CACHE = 'mg-game-v11';
const CORE = [
  './', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'css/style.css?v=11',
  'js/data.js?v=11', 'js/engine.js?v=11', 'js/ai.js?v=11', 'js/net.js?v=11', 'js/ui.js?v=11', 'js/app.js?v=11',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
