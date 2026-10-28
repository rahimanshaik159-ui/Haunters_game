import {useEffect,useRef,useState} from 'react';import {useParams,Link,useNavigate} from 'react-router-dom';
import {ref,onValue,update,set,remove,onDisconnect} from 'firebase/database';
import {doc,setDoc,increment} from 'firebase/firestore';
import {MapContainer,TileLayer,Circle,CircleMarker,Polyline,useMap} from 'react-leaflet';
import {db,fs} from '../services/firebase';import {useUser} from '../App.jsx';import {cfg} from '../config';
import {dist,bearing,dir,elapsed,zoneAt,nextShrink,fmt,route} from '../services/gameplay';
import Ad from '../components/Ad.jsx';
const G=cfg.game;
function Follow({p}){const m=useMap();useEffect(()=>{if(p)m.setView([p.lat,p.lng],m.getZoom());},[!!p]);return null;}
export default function Room(){
 const {id}=useParams(),u=useUser(),nv=useNavigate();const [g,setG]=useState(undefined);
 useEffect(()=>onValue(ref(db,'games/'+id),s=>setG(s.val()),()=>setG(null)),[id]);
 useEffect(()=>{const r=ref(db,`games/${id}/players/${u.uid}/online`);set(r,true).catch(()=>{});onDisconnect(r).set(false).catch(()=>{});},[id]);
 if(g===undefined)return <p className="c">Loading…</p>;
 if(!g||!g.meta)return <div className="c"><p>Game not found.</p><Link to="/dashboard" className="btn">Back</Link></div>;
 const me=g.players?.[u.uid];if(!me)return <div className="c"><p>You are not in this game.</p><Link to={'/join?code='+id} className="btn">Join</Link></div>;
 const s=g.meta.status;
 return s==='waiting'?<Wait id={id} g={g} u={u} nv={nv}/>:s==='playing'?<Play id={id} g={g} u={u}/>:<Over id={id} g={g} u={u}/>;}
function Wait({id,g,u,nv}){const m=g.meta,ps=Object.entries(g.players||{}),host=m.host===u.uid,[msg,setMsg]=useState('');
 const link=`${cfg.siteUrl}${import.meta.env.BASE_URL.replace(/\/$/,'')}/join?code=${id}`;
 const start=async()=>{if(ps.length<2)return setMsg('Need at least 2 players.');if(m.haunters>=ps.length)return setMsg('Too many haunters for this player count.');
  const ids=ps.map(([k])=>k).sort(()=>Math.random()-.5),up={};
  ids.forEach((k,i)=>{up[`games/${id}/players/${k}/role`]=i<m.haunters?'haunter':'civilian';up[`games/${id}/players/${k}/health`]=100;up[`games/${id}/players/${k}/alive`]=true;});
  up[`games/${id}/meta/status`]='playing';up[`games/${id}/meta/startedAt`]=Date.now();up[`lobby/${id}/open`]=false;await update(ref(db),up);};
 const cancel=async()=>{await update(ref(db),X);};
 const leave=async()=>{await remove(ref(db,`games/${id}/players/${u.uid}`));nv('/dashboard');};
 return <><h1>{m.name}</h1><div className="card"><div className="gid">{id}</div><div className="c">
  <button className="btn sm" onClick={()=>navigator.clipboard.writeText(id)}>Copy ID</button>{' '}
  <button className="btn sm ghost" onClick={()=>navigator.share?navigator.share({title:'HAUNTERS',text:`Join my game: ${id}`,url:link}):navigator.clipboard.writeText(link)}>Share</button>
  <p style={{wordBreak:'break-all'}}>{link}</p></div></div>
  <div className="card"><p>Radius {m.radius} m · {m.duration} min · shrink every {m.shrinkMin} min · {m.haunters} haunter(s) · {m.pub?'Public':'Private'}</p>
  <h3>Players {ps.length}/{m.max}</h3>{ps.map(([k,p])=><div key={k}>{p.name}{k===m.host&&' 👑'} — {p.ready?<span className="ok">ready</span>:'not ready'}</div>)}</div>
  {msg&&<p className="err">{msg}</p>}
  {!host&&<button className="btn g" onClick={()=>update(ref(db,`games/${id}/players/${u.uid}`),{ready:!g.players[u.uid].ready})}>Toggle ready</button>}{' '}
  {host&&<><button className="btn g" onClick={start}>Start Game</button> <button className="btn ghost" onClick={cancel}>Cancel game</button></>}{' '}
  {!host&&<button className="btn ghost" onClick={leave}>Leave</button>}</>;}
function Play({id,g,u}){const m=g.meta,me=g.players[u.uid],[pos,setPos]=useState(null),[err,setErr]=useState(''),[now,setNow]=useState(Date.now()),[rt,setRt]=useState(null);
 const posR=useRef(null),last=useRef(0),near=useRef({}),lastRt=useRef(0),gR=useRef(g);gR.current=g;
 useEffect(()=>{if(!navigator.geolocation)return setErr('Geolocation unavailable.');
  const w=navigator.geolocation.watchPosition(p=>{const v={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy};posR.current=v;setPos(v);setErr(v.acc>G.maxAcc?`Weak GPS (±${Math.round(v.acc)} m): eliminations paused for you.`:'');
   if(Date.now()-last.current>G.posThrottleMs){last.current=Date.now();update(ref(db,`games/${id}/players/${u.uid}`),{...v,ts:Date.now()});}},
   e=>setErr(e.code===1?'Location permission denied. Enable it in browser settings to play.':'Location unavailable or timed out.'),{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
  return()=>navigator.geolocation.clearWatch(w);},[id]);
 useEffect(()=>{const t=setInterval(()=>{const n=Date.now();setNow(n);const gg=gR.current,mm=gg.meta,p=posR.current,self=gg.players[u.uid],sec=elapsed(mm,n);
  if(self.alive&&p){const z=zoneAt(mm,sec);if(dist(p,mm.center)-Math.min(p.acc,G.maxAcc)>z){const h=Math.max(0,(self.health??100)-G.damage);update(ref(db,`games/${id}/players/${u.uid}`),h<=0?{health:0,alive:false}:{health:h});}}
  if(self.alive&&self.role==='haunter'&&p&&p.acc<=G.maxAcc)for(const [k,o] of Object.entries(gg.players)){
   if(o.role!=='civilian'||!o.alive||!o.ts||n-o.ts>15000||(o.acc||99)>G.maxAcc)continue;
   if(dist(p,o)<=G.proximity){near.current[k]=(near.current[k]||0)+1;if(near.current[k]>=G.confirmTicks)update(ref(db,`games/${id}/players/${k}`),{alive:false,health:0,by:u.uid});}else near.current[k]=0;}
  if(mm.host===u.uid){const civ=Object.values(gg.players).filter(x=>x.role==='civilian'&&x.alive).length;
   if(civ===0)update(ref(db,`games/${id}/meta`),{status:'ended',winner:'haunters',endedAt:n});
   else if(sec>=mm.duration*60)update(ref(db,`games/${id}/meta`),{status:'ended',winner:'civilians',endedAt:n});}},1000);return()=>clearInterval(t);},[id]);
 const sec=elapsed(m,now),z=zoneAt(m,sec),zn=zoneAt(m,sec+nextShrink(m,sec)+1),civ=me.role==='civilian';
 const others=Object.entries(g.players).filter(([k,o])=>k!==u.uid&&o.alive&&o.pos!==0&&o.ts&&now-o.ts<15000&&pos&&dist(pos,o)<=G.proximity&&o.role===(civ?'haunter':'civilian')&&(civ||o.acc<=G.maxAcc*2));
 const alive=Object.values(g.players);const cl=alive.filter(x=>x.role==='civilian'&&x.alive).length;
 const danger=civ&&others[0];
 useEffect(()=>{if(danger&&pos&&Date.now()-lastRt.current>20000){lastRt.current=Date.now();route(pos,m.center).then(setRt);}if(!danger)setRt(null);},[!!danger]);
 if(!me.alive)return <div className="c card"><h2>You were eliminated 👻</h2><p>{me.health<=0?'Health depleted or caught.':''} Watch the game end or <Link to="/dashboard">leave</Link>.</p><p>Time left {fmt(Math.max(0,m.duration*60-sec))}</p></div>;
 const toC=pos?bearing(pos,m.center):0;
 return <><div className="hud"><div className="card">Role<br/><b style={{color:civ?'var(--cy)':'var(--red)'}}>{me.role.toUpperCase()}</b></div>
  <div className="card">Time left<br/><b>{fmt(Math.max(0,m.duration*60-sec))}</b></div><div className="card">Zone {Math.round(z)} m<br/>shrinks in {fmt(nextShrink(m,sec))}</div>
  <div className="card">Civilians left<br/><b>{cl}</b></div></div>
  <div className="bar"><i style={{width:(me.health??100)+'%'}}/></div><small>Health {me.health??100}%</small>
  {err&&<p className="warn">{err}</p>}{!pos&&!err&&<p>Waiting for GPS…</p>}
  {danger&&<p className="alert">⚠ Haunter within ~{Math.round(dist(pos,danger[1]))} m (±{Math.round(pos.acc)} m). {rt?'Route to safe-zone centre shown (estimate).':`Move ${dir((toC))} toward the zone centre (estimate only).`}</p>}
  {!civ&&others.map(([k,o])=><p className="alert" key={k}>Civilian ~{Math.round(dist(pos,o))} m away</p>)}
  {pos&&pos.lat&&dist(pos,m.center)>z&&<p className="alert">Outside safe zone — losing health!</p>}
  <div className="map"><MapContainer center={[m.center.lat,m.center.lng]} zoom={16} style={{height:'100%'}}><TileLayer url={cfg.tiles} attribution={cfg.attribution}/>
   <Circle center={[m.center.lat,m.center.lng]} radius={z} pathOptions={{color:'#ff2d4a'}}/>
   <Circle center={[m.center.lat,m.center.lng]} radius={zn} pathOptions={{color:'#22c55e',dashArray:'6',fill:false}}/>
   {pos&&<CircleMarker center={[pos.lat,pos.lng]} radius={8} pathOptions={{color:civ?'#22d3ee':'#ff2d4a'}}/>}
   {pos&&<Circle center={[pos.lat,pos.lng]} radius={pos.acc} pathOptions={{weight:1,opacity:.4}}/>}
   {(!civ?others:[]).map(([k,o])=><CircleMarker key={k} center={[o.lat,o.lng]} radius={7} pathOptions={{color:'#22d3ee'}}/>)}
   {rt&&<Polyline positions={rt} pathOptions={{color:'#22c55e'}}/>}<Follow p={pos}/></MapContainer></div>
  <small>Green dashed = next zone. Positions are approximate GPS estimates; routes are suggestions, not verified safe.</small></>;}
function Over({id,g,u}){const m=g.meta,me=g.players[u.uid],done=useRef(false);const won=m.winner==='civilians'?me.role==='civilian'&&me.alive:m.winner==='haunters'&&me.role==='haunter';
 const mins=Math.round(((m.endedAt||Date.now())-(m.startedAt||Date.now()))/60000);
 useEffect(()=>{if(done.current||!fs||!m.winner)return;done.current=true;const k='h_'+id;if(localStorage.getItem(k))return;localStorage.setItem(k,1);
  setDoc(doc(fs,'profiles',u.uid),{games:increment(1),wins:increment(won?1:0),xp:increment(50+(won?100:0)+mins)},{merge:true}).catch(()=>{});},[]);
 return <div className="c card"><h1>{m.winner?`${m.winner.toUpperCase()} WIN`:'Game cancelled'}</h1>{m.winner&&<><p>You were a {me.role} — {won?'victory! 🏆':'defeat'}</p><p>Match length: {mins} min · XP earned: {50+(won?100:0)+mins}</p></>}
  <Link className="btn" to="/dashboard">Return to Lobby</Link> <Link className="btn ghost" to="/create">Play Again</Link><Ad/></div>;}
