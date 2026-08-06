// تحويل الإحداثيات لعنوان عربي تقريبي عن طريق Nominatim (OpenStreetMap)
// ملاحظة: سياسة Nominatim بتسمح بطلب واحد في الثانية كحد أقصى — عشان كده فيه طابور وكاش.

const cache = new Map();
const CACHE_MAX = 500;
const MIN_INTERVAL_MS = 1100;
let lastCallAt = 0;

const USER_AGENT = 'Ballagh-Alexandria/1.0 (garbage reporting app; contact: admin@localhost)';

/**
 * يرجّع عنوان عربي تقريبي، أو null لو الخدمة مش متاحة.
 * البلاغ بيتسجّل عادي حتى لو ده رجّع null.
 */
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  // احترام حد الطلبات
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('accept-language', 'ar');
  url.searchParams.set('zoom', '17');

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const address = data.display_name ?? null;

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, address);

    return address;
  } catch {
    // الشبكة مقطوعة أو الخدمة بطيئة — مش مشكلة، البلاغ هيتسجّل بالإحداثيات
    return null;
  }
}
