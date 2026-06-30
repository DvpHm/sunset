// ode 스튜디오 서비스워커 — v1
// 변경점: 네트워크 우선(항상 최신 표시) + 캐시 버전업으로 옛 캐시 제거 + 최신 파일명
const PATH = '/sunset/';
const CACHE = 'ss-v1';
const SHELL = [
  PATH + 'index.html',
  PATH + 'd_e5f91a26c0bc49a9.html',
  PATH + 'planner.html',
  PATH + 'quote.html',
  PATH + 'manifest.json',
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  // SHELL을 개별 캐시 — 일부 파일이 없어도 install 실패하지 않도록
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.all(SHELL.map(function(u) { return c.add(u).catch(function(){}); }));
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  // 외부 리소스(CDN, GitHub API)는 그대로 네트워크로
  if (!e.request.url.includes('DvpHm.github.io') && !e.request.url.includes('localhost')) return;
  // 네트워크 우선: 항상 최신을 받아오고, 오프라인일 때만 캐시 사용
  e.respondWith(
    fetch(e.request).then(function(res) {
      var copy = res.clone();
      caches.open(CACHE).then(function(c) { c.put(e.request, copy); });
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
