import {cfg} from '../config';
const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const rid=()=>Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>A[b%A.length]).join('');
export const dist=(a,b)=>{const R=6371000,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lng-a.lng);
 const h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
export const bearing=(a,b)=>{const r=x=>x*Math.PI/180,y=Math.sin(r(b.lng-a.lng))*Math.cos(r(b.lat)),x=Math.cos(r(a.lat))*Math.sin(r(b.lat))-Math.sin(r(a.lat))*Math.cos(r(b.lat))*Math.cos(r(b.lng-a.lng));return (Math.atan2(y,x)*180/Math.PI+360)%360;};
export const dir=d=>['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8];
export const elapsed=(m,now)=>Math.max(0,(now-m.startedAt)/1000);
export const zoneAt=(m,sec)=>Math.max(50,m.radius*(1-cfg.game.shrinkFactor*Math.floor(sec/(m.shrinkMin*60))));
export const nextShrink=(m,sec)=>m.shrinkMin*60-(sec%(m.shrinkMin*60));
export const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export async function route(a,b){try{const r=await fetch(`https://router.project-osrm.org/route/v1/foot/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
 const j=await r.json();return j.routes?.[0]?.geometry.coordinates.map(([x,y])=>[y,x])||null;}catch{return null;}}
