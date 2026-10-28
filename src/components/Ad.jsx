import {useEffect} from 'react';import {cfg} from '../config';
// Never place inside the map/game controls. Script loads only when owner configures IDs (add consent handling for your region first).
export default function Ad(){const {enabled,pub,slot}=cfg.ads,live=enabled&&pub&&slot;
 useEffect(()=>{if(!live)return;if(!document.getElementById('adsb')){const s=document.createElement('script');s.id='adsb';s.async=true;s.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pub}`;s.crossOrigin='anonymous';document.head.appendChild(s);}
  try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{}},[live]);
 return live?<ins className="adsbygoogle" style={{display:'block'}} data-ad-client={pub} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true"/>:<div className="ad">Advertisement — Preview Only</div>;}
