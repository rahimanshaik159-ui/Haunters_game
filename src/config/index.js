const e=import.meta.env;
export const cfg={siteUrl:e.VITE_SITE_URL||location.origin,contact:e.VITE_CONTACT_EMAIL||'rahimanshaik159@gmail.com',
 tiles:e.VITE_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
 attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
 ads:{enabled:e.VITE_ADSENSE_ENABLED==='true',pub:e.VITE_ADSENSE_PUBLISHER_ID||'',slot:e.VITE_ADSENSE_SLOT_BANNER||''},
 game:{proximity:10,killRange:5,killHoldMs:3000,killMaxAcc:10,locationMaxAgeMs:10000,maxAcc:30,shrinkFactor:.2,damage:2,confirmTicks:3,posThrottleMs:3000}};
