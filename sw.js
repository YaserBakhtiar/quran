/* Service Worker — قرآن آفلاین
   بعد از هر تغییر در فایل‌های برنامه، عدد نسخه را بالا ببرید (v3 → v4). */
const SHELL = 'quran-shell-v4';
const FONTS = 'quran-fonts-v1';           // فونت‌های گوگل (Vazirmatn و Almarai)
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Vazirmatn:wght@100..900&display=swap'; // باید با index.html یکی باشد
const IMGS  = 'quran-img-v1';              // باید با index.html یکی باشد
const IMG_PATH = '/webp-image/';           // باید با مسیر عکس‌ها در index.html یکی باشد

// فایل‌های برنامه. اگر فایلی وجود نداشت، نصب خراب نمی‌شود.
const ASSETS = [
  './', 'index.html', 'manifest.json', 'favicon.ico',
  'icons/maskable_icon_x48.png', 'icons/maskable_icon_x96.png',
  'icons/maskable_icon_x192.png', 'icons/maskable_icon_x512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {}))))
      .then(() => cacheFonts())
      .then(() => self.skipWaiting())
  );
});

// دانلود CSS فونت‌های گوگل و همهٔ فایل‌های فونت آن، تا بدون اینترنت هم کار کنند
async function cacheFonts() {
  try {
    const c = await caches.open(FONTS);
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await c.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
    await Promise.all(urls.map(u => fetch(u).then(r => r.ok && c.put(u, r)).catch(() => {})));
  } catch (_) {}
}

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== IMGS && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // فونت‌های گوگل: اول کش + بروزرسانی در پس‌زمینه
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req.url);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  // عکس صفحه‌ها: اول کش؛ اگر نبود شبکه و ذخیره (فقط پاسخ کامل ۲۰۰)
  if (url.pathname.includes(IMG_PATH)) {
    e.respondWith((async () => {
      const c = await caches.open(IMGS);
      const hit = await c.match(url.pathname + url.search, { ignoreVary: true }) || await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.status === 200) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  // باز شدن برنامه (navigate): همیشه از کش، حتی بدون اینترنت و با هر آدرس/هش
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match('index.html') || await c.match('./');
      const net = fetch(req).then(r => { if (r.ok) { c.put('index.html', r.clone()); } return r; }).catch(() => null);
      return hit || (await net) || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // بقیهٔ فایل‌ها (فونت، آیکن، manifest): کش اول + بروزرسانی در پس‌زمینه
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
