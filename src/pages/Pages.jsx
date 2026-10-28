import {useEffect,useState} from 'react';import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {createUserWithEmailAndPassword,signInWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,deleteUser} from 'firebase/auth';
import {ref,get,set,onValue,query,limitToLast} from 'firebase/database';
import {doc,setDoc,collection,query as fq,orderBy,limit,getDocs} from 'firebase/firestore';
import {MapContainer,TileLayer,Circle,Marker,useMapEvents,useMap} from 'react-leaflet';
import L from 'leaflet';import {auth,db,fs} from '../services/firebase';import {useUser} from '../App.jsx';
import {rid,sha} from '../services/gameplay';import {cfg} from '../config';import Ad from '../components/Ad.jsx';
L.Icon.Default.mergeOptions({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'});
const err=e=>(e?.code||e?.message||String(e)).replace('auth/','').replace(/-/g,' ');
export function Home(){const u=useUser();return <>
 <section className="hero"><h1>HAUNTERS</h1><p>HUNT OR SURVIVE — a real-world, location-based multiplayer game</p>
 <Link className="btn" to={u?'/dashboard':'/login'}>Play Now</Link> <Link className="btn ghost" to="/how-to-play">How to Play</Link></section><Ad/>
 <div className="grid">{[['Real-world map','Play on OpenStreetMap in your own city.'],['Two roles','Haunters hunt, Civilians survive.'],['Shrinking zone','The safe circle contracts on a schedule.'],['Proximity alerts','Alerts within 10 m (GPS-accuracy permitting).'],['Escape hints','Suggested routes — estimates, never guaranteed safe.'],['Private rooms','Share a Game ID or invite link.']].map(([t,d])=><div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div></>;}
const P={
about:['About HAUNTERS','HAUNTERS is a real-world location-based survival game that gets people outdoors. Safety, fair play and fun come first.'],
'how-to-play':['How to Play','1. Sign in and join a Game ID (or create a game). 2. Wait in the lobby until the host starts; roles are assigned randomly. 3. Civilians stay inside the shrinking safe zone and avoid Haunters; Haunters close in within 10 m. 4. Outside the zone you lose health. 5. Civilians win if one survives until time runs out; Haunters win by eliminating all Civilians. Always stay aware of traffic and your surroundings.'],
features:['Features','Real-world map (Leaflet + OpenStreetMap), unique Game IDs, public/private rooms with optional password, host-configurable zone and duration, live player positions, proximity alerts, shrinking zone damage, XP and leaderboard, installable PWA.'],
faq:['FAQ','Is it free? Yes, using free tiers and open-source tools, subject to their limits. How accurate is GPS? Typically 5–30 m, so eliminations use accuracy checks and are approximate. Can players cheat? In this client-only version, a determined player can. See README.'],
contact:['Contact Us',`Email us at ${cfg.contact}.`],
privacy:['Privacy Policy','TEMPLATE — [OWNER NAME], [ADDRESS], [CONTACT]. Describe: account data, live location shared with players in your game, Firebase processing, cookies/ads (AdSense) and user rights. Have it reviewed for your jurisdiction.'],
terms:['Terms of Service','TEMPLATE — [OWNER NAME]. Define eligibility, acceptable use, game rules, liability limits, termination, governing law. Not legal advice.'],
disclaimer:['Disclaimer','Play only in safe, legal, public places. Never trespass or enter roads. Location data is approximate. Suggested routes are estimates, not verified safe routes. [OWNER DETAILS]'],
cookies:['Cookie Policy','TEMPLATE — list cookies/storage used (Firebase auth persistence, optional advertising cookies) and how to withdraw consent. [OWNER DETAILS]'],
guidelines:['Community Guidelines','Respect others, no harassment, no dangerous behavior, no cheating or GPS spoofing, never chase people who have not joined your game.'],
report:['Report a Problem',`Describe the issue with your Game ID and email it to ${cfg.contact}.`]};
export function Info({slug}){const [t,b]=P[slug];useEffect(()=>{document.title=t+' — HAUNTERS';},[t]);
 const [s,setS]=useState({});const sub=e=>{e.preventDefault();const f=new FormData(e.target);
  location.href=`mailto:${cfg.contact}?subject=${encodeURIComponent(f.get('subject'))}&body=${encodeURIComponent(f.get('message')+'\n\n'+f.get('email'))}`;setS({ok:1});};
 return <article><h1>{t}</h1><p>{b}</p>{slug==='contact'&&<form className="card" onSubmit={sub}>
  <label>Email<input name="email" type="email" required/></label><label>Subject<input name="subject" required/></label>
  <label>Message<input name="message" required minLength={10}/></label><button className="btn">Open in email app</button>
  {s.ok&&<p className="ok">Your email app should open. No message is sent until you send it there.</p>}</form>}<Ad/></article>;}
export const NotFound=()=><div className="c"><h1>404</h1><p>You wandered out of the safe zone.</p><Link className="btn" to="/">Home</Link></div>;
export function Login(){const nv=useNavigate(),u=useUser();const [reg,setReg]=useState(false),[m,setM]=useState('');
 useEffect(()=>{if(u)nv('/dashboard');},[u]);
 const go=async e=>{e.preventDefault();const f=new FormData(e.target),em=f.get('e'),pw=f.get('p');setM('');
  try{if(reg){const c=await createUserWithEmailAndPassword(auth,em,pw);await updateProfile(c.user,{displayName:f.get('n')});
    await setDoc(doc(fs,'profiles',c.user.uid),{name:f.get('n'),xp:0,games:0,wins:0});await sendEmailVerification(c.user);}
   else await signInWithEmailAndPassword(auth,em,pw);}catch(x){setM(err(x));}};
 const reset=async()=>{const em=document.querySelector('[name=e]').value;try{await sendPasswordResetEmail(auth,em);setM('Reset email sent (if the account exists).');}catch(x){setM(err(x));}};
 return <form className="card" onSubmit={go} style={{maxWidth:420,margin:'20px auto'}}><h2>{reg?'Create account':'Login'}</h2>
  {reg&&<><label>Username</label><input name="n" required minLength={3} maxLength={20}/></>}
  <label>Email</label><input name="e" type="email" required/><label>Password</label><input name="p" type="password" required minLength={6}/>
  {m&&<p className="err">{m}</p>}<button className="btn" style={{width:'100%'}}>{reg?'Register':'Login'}</button>
  <p className="c"><a href="#" onClick={e=>{e.preventDefault();setReg(!reg);}}>{reg?'Have an account? Login':'New? Register'}</a>{!reg&&<> · <a href="#" onClick={e=>{e.preventDefault();reset();}}>Forgot password</a></>}</p></form>;}
export function Dashboard(){const u=useUser();const [g,setG]=useState([]);
 useEffect(()=>onValue(query(ref(db,'lobby'),limitToLast(30)),s=>{const v=s.val()||{};setG(Object.entries(v).filter(([,x])=>Date.now()-x.createdAt<3*3600e3&&x.open).map(([id,x])=>({id,...x})));}),[]);
 return <><h1>Welcome, {u.displayName||'player'}</h1>{!u.emailVerified&&<p className="warn">Email not verified — check your inbox.</p>}
  <Link className="btn" to="/create">Create Game</Link> <Link className="btn ghost" to="/join">Join with ID</Link>
  <h2>Public games</h2>{!g.length&&<p>No public games right now. Create one!</p>}
  <div className="grid">{g.map(x=><div className="card" key={x.id}><b>{x.name}</b><br/>{x.radius} m · max {x.max}<br/><Link className="btn sm g" to={'/join?code='+x.id}>Join {x.id}</Link></div>)}</div></>;}
function Pick({c,set}){useMapEvents({click:e=>set({lat:e.latlng.lat,lng:e.latlng.lng})});return null;}
function Fly({c}){const m=useMap();useEffect(()=>{m.setView([c.lat,c.lng],m.getZoom()<13?14:m.getZoom());},[c.lat,c.lng]);return null;}
export function Create(){const u=useUser(),nv=useNavigate();const [c,setC]=useState({lat:20.59,lng:78.96});const [f,setF]=useState({name:'',radius:500,duration:30,haunters:1,max:8,pub:true,pass:'',shrinkMin:5});const [m,setM]=useState(''),[q,setQ]=useState('');
 useEffect(()=>{navigator.geolocation?.getCurrentPosition(p=>setC({lat:p.coords.latitude,lng:p.coords.longitude}),()=>setM('Location denied — click the map to choose the centre.'),{timeout:8000});},[]);
 const k=(n,v)=>setF(o=>({...o,[n]:v}));
 const search=async()=>{if(!q.trim())return;try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q));const j=await r.json();j[0]?setC({lat:+j[0].lat,lng:+j[0].lon}):setM('No result.');}catch{setM('Search unavailable — click the map instead.');}};
 const go=async e=>{e.preventDefault();setM('');
  if(f.name.trim().length<3)return setM('Name must be 3+ characters.');
  if(f.haunters>=f.max)return setM('Haunters must be fewer than max players.');
  try{let id;for(let i=0;i<8;i++){id=rid();if(!(await get(ref(db,`games/${id}/meta`))).exists())break;id=null;}
   if(!id)return setM('Could not find a free ID, try again.');
   const meta={name:f.name.trim(),host:u.uid,center:c,radius:+f.radius,duration:+f.duration,haunters:+f.haunters,max:+f.max,pub:f.pub,shrinkMin:+f.shrinkMin,status:'waiting',createdAt:Date.now(),pass:f.pass?await sha(f.pass+id):''};
   await set(ref(db,`games/${id}/meta`),meta);
   await set(ref(db,`games/${id}/players/${u.uid}`),{name:u.displayName||'Host',ready:true,alive:true,health:100});
   if(f.pub)await set(ref(db,`lobby/${id}`),{name:meta.name,host:u.uid,radius:meta.radius,max:meta.max,createdAt:meta.createdAt,open:true});
   nv('/game/'+id);}catch(x){setM(err(x));}};
 return <form onSubmit={go}><h1>Create Game</h1>
  <input placeholder="Search place (Nominatim)" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),search())}/>
  <div className="map"><MapContainer center={[c.lat,c.lng]} zoom={5} style={{height:'100%'}}><TileLayer url={cfg.tiles} attribution={cfg.attribution}/>
   <Pick set={setC}/><Fly c={c}/><Marker position={[c.lat,c.lng]}/><Circle center={[c.lat,c.lng]} radius={+f.radius} pathOptions={{color:'#ff2d4a'}}/></MapContainer></div>
  <p>Click the map to set the centre.</p>
  <div className="grid"><label>Game name<input value={f.name} onChange={e=>k('name',e.target.value)} maxLength={30}/></label>
  <label>Radius<select value={f.radius} onChange={e=>k('radius',e.target.value)}>{[100,250,500,1000,1500,2000].map(r=><option key={r} value={r}>{r>=1000?r/1000+' km':r+' m'}</option>)}</select></label>
  <label>Duration (min)<select value={f.duration} onChange={e=>k('duration',e.target.value)}>{[15,30,45,60].map(r=><option key={r}>{r}</option>)}</select></label>
  <label>Shrink every (min)<input type="number" min="1" max="30" value={f.shrinkMin} onChange={e=>k('shrinkMin',e.target.value)}/></label>
  <label>Haunters<input type="number" min="1" max="5" value={f.haunters} onChange={e=>k('haunters',e.target.value)}/></label>
  <label>Max players<input type="number" min="2" max="30" value={f.max} onChange={e=>k('max',e.target.value)}/></label>
  <label>Visibility<select value={f.pub} onChange={e=>k('pub',e.target.value==='true')}><option value="true">Public</option><option value="false">Private</option></select></label>
  <label>Password (optional)<input value={f.pass} onChange={e=>k('pass',e.target.value)}/></label></div>
  {m&&<p className="err">{m}</p>}<button className="btn g">Generate Game ID</button></form>;}
export function Join(){const u=useUser(),nv=useNavigate(),[sp]=useSearchParams();const [code,setCode]=useState((sp.get('code')||'').toUpperCase()),[pw,setPw]=useState(''),[m,setM]=useState('');
 const go=async e=>{e.preventDefault();setM('');const id=code.trim().toUpperCase();
  try{const s=await get(ref(db,`games/${id}`));if(!s.exists())return setM('Game not found.');const {meta,players={}}=s.val();
   if(players[u.uid])return nv('/game/'+id);
   if(meta.status!=='waiting')return setM('This game has already started or ended.');
   if(Date.now()-meta.createdAt>6*3600e3)return setM('This game has expired.');
   if(Object.keys(players).length>=meta.max)return setM('This game is full.');
   if(meta.pass&&meta.pass!==await sha(pw+id))return setM('Wrong password.');
   await set(ref(db,`games/${id}/players/${u.uid}`),{name:u.displayName||'Player',ready:false,alive:true,health:100});nv('/game/'+id);}catch(x){setM(err(x));}};
 return <form className="card" onSubmit={go} style={{maxWidth:420,margin:'20px auto'}}><h2>Join Game</h2><label>Game ID</label>
  <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="HN7K3" required/>
  <label>Password (if private)</label><input value={pw} onChange={e=>setPw(e.target.value)}/>{m&&<p className="err">{m}</p>}<button className="btn g">Join</button></form>;}
export function Leaderboard(){const [r,setR]=useState(null);
 useEffect(()=>{if(!fs)return setR([]);getDocs(fq(collection(fs,'profiles'),orderBy('xp','desc'),limit(20))).then(s=>setR(s.docs.map(d=>d.data()))).catch(()=>setR([]));},[]);
 return <><h1>Leaderboard</h1>{r===null?<p>Loading…</p>:!r.length?<p>No ranked players yet.</p>:<table style={{width:'100%'}}><tbody><tr><th>#</th><th>Player</th><th>XP</th><th>Games</th><th>Wins</th></tr>
  {r.map((p,i)=><tr key={i}><td>{i+1}</td><td>{p.name}</td><td>{p.xp}</td><td>{p.games}</td><td>{p.wins}</td></tr>)}</tbody></table>}<Ad/></>;}
export function Account(){const u=useUser();return <div className="card"><h1>Account</h1><p>{u.email}</p>
 <button className="btn ghost" onClick={()=>sendPasswordResetEmail(auth,u.email)}>Send password reset</button>
 <p>To delete your account:</p><button className="btn" onClick={()=>confirm('Delete account permanently?')&&deleteUser(u).catch(x=>alert(err(x)+' — log in again and retry.'))}>Delete account</button></div>;}
