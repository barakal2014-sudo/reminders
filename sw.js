// Service worker: keeps the app shell available offline, and shows reminder notifications.
var CACHE = 'tazkorot-shell-v2', CFG = 'tazkorot-cfg';
var SHELL = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== CFG; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  var font = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !font)) return;      // sync requests go straight to the network
  if (u.origin === location.origin && /\/url$/.test(u.pathname)) return;                   // the stored connection code is not a page
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});

// A push arrives with no content: ask the server what is due right now, and show it.
// A notification is always shown, even if the server cannot be reached (iOS requires one per push).
self.addEventListener('push', function (e) {
  e.waitUntil(caches.open(CFG).then(function (c) { return c.match('url'); })
    .then(function (r) { return r ? r.text() : ''; })
    .then(function (url) {
      if (!url) return {};
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ src: 'app', op: 'due' }) })
        .then(function (r) { return r.json(); });
    })
    .catch(function () { return {}; })
    .then(function (j) {
      var items = j.items || [], shows = [];
      var show = function (title, body, tag, id) {
        return self.registration.showNotification(title, { body: body, tag: tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { id: id || '' } });
      };
      if (j.msg) shows.push(show('תזכורות', j.msg, 'msg'));
      items.forEach(function (x) { shows.push(show('🔔 ' + x.text, 'לחץ כדי לסמן כבוצע או לדחות', x.id, x.id)); });
      if (!shows.length) shows.push(show('🔔 תזכורת', 'יש תזכורת שהגיע זמנה. לחץ לפתיחה', 'generic'));
      try { if (self.navigator.setAppBadge && j.count !== undefined) { if (j.count) self.navigator.setAppBadge(j.count); else self.navigator.clearAppBadge(); } } catch (err) {}
      return Promise.all(shows);
    }));
});

// Tapping a notification opens the app on that reminder.
self.addEventListener('notificationclick', function (e) {
  var id = e.notification.data && e.notification.data.id;
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if ('focus' in cs[i]) { if (id) cs[i].postMessage({ open: id }); return cs[i].focus(); }
    }
    return self.clients.openWindow(id ? './?id=' + encodeURIComponent(id) : './');
  }));
});
