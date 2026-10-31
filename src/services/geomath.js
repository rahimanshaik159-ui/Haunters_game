// Small, dependency-free geo helpers (no import.meta / DOM access, so they are unit-testable in Node).
const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
const deg = (x) => (x * 180) / Math.PI;

export const distM = (a, b) => {
  const dl = rad(b.lat - a.lat), dn = rad(b.lng - a.lng);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// Point `meters` away from `p` along compass `bearingDeg`.
export const offsetLatLng = (p, bearingDeg, meters) => {
  const br = rad(bearingDeg), d = meters / R, lat1 = rad(p.lat), lng1 = rad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
};

// Uniformly distributed random point inside a circle.
export const randomPointInCircle = (center, radiusM, rnd = Math.random) =>
  offsetLatLng(center, rnd() * 360, Math.sqrt(rnd()) * radiusM);

export const validLatLng = (p) =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
