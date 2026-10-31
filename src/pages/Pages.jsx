import {useEffect,useRef,useState} from 'react';import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {createUserWithEmailAndPassword,signInWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,deleteUser} from 'firebase/auth';
import {ref,get,set,onValue,query,limitToLast} from 'firebase/database';
import {doc,setDoc,collection,query as fq,orderBy,limit,getDocs} from 'firebase/firestore';
import {MapContainer,TileLayer,Circle,Marker,useMapEvents,useMap} from 'react-leaflet';
import L from 'leaflet';import {auth,db,fs} from '../services/firebase';import {useUser} from '../App.jsx';
import {rid,sha,elapsed} from '../services/gameplay';import {cfg} from '../config';import Ad from '../components/Ad.jsx';import PowerUpsGuide from '../components/PowerUpsGuide.jsx';
L.Icon.Default.mergeOptions({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'});
const err=e=>(e?.code||e?.message||String(e)).replace('auth/','').replace(/-/g,' ');
export function Home(){const u=useUser();const items=[['⌖','Real World Map','Play in your own city'],['♧','Team Based','Hunt together, survive together'],['◷','Zone Shrinks','Keep moving to stay safe'],['⌁','Live Tracking','See the game unfold live'],['✦','Power-ups','Use smart advantages']];return <>
 <section className="hero"><div className="hero-art"/><div className="hero-copy"><p className="eyebrow">REAL WORLD LOCATION BASED GAME</p><h1>HAUNTERS</h1><p className="tagline">HUNT OR SURVIVE</p><p className="hero-subtitle">A real-world multiplayer survival experience.</p><div className="hero-actions"><Link className="btn" to={u?'/dashboard':'/login'}>Play Now</Link><Link className="btn ghost" to="/how-to-play">▶&nbsp; How To Play</Link></div></div></section><div className="feature-strip">{items.map(([i,t,d])=><div key={t}><b>{i}</b><strong>{t}</strong><span>{d}</span></div>)}</div><Ad/>
 </>;}
const P={
about:{title:'About Us',intro:'HAUNTERS is a real-world, location-based multiplayer survival game that turns your surroundings into the arena. Connect with friends, explore your city, and play a thrilling game built around movement, teamwork, and awareness.',image:'CITY / NIGHT / SURVIVE',cards:[['◉','Our Mission','Make real-world gaming fun, active, and safe.'],['◎','Our Vision','Build a global community of players.'],['◈','Our Values','Fair play, safety, and innovation.']]},
features:{title:'Game Features',features:[['⌖','Real World Map','Play on a live map centered on your location.'],['♟','Unique Roles','Play as a Civilian or a Haunter.'],['◷','Shrinking Zone','The safe zone contracts on a schedule.'],['⌁','Suggested Safe Path','Get an estimated route toward the zone centre.'],['♧','Smart Notifications','Receive alerts when a Haunter is nearby.'],['✦','Power-ups','Use abilities available in the active game.']],more:'Custom game settings, public and private games, leaderboards, XP, and achievements are shown only where supported by the current application.'},
privacy:{title:'Privacy Policy',updated:'Last updated: October 20, 2026',sections:[['Information We Collect','When you create an account, Firebase may process the email address, display name, and authentication information you provide. During a game, the app may process gameplay information and device location when you grant permission.'],['How We Use Information','We use this information to authenticate players, create and join games, show live game state to players in the same game, maintain leaderboards, and provide support.'],['Location Data','Location is used for the active game experience, including player positions, proximity indicators, and zone logic. GPS accuracy varies by device and environment. Review your device permissions before playing.'],['Data Security and Retention','Firebase services are configured by the project owner and process data under their applicable terms. This app does not promise that data is never retained or that security is guaranteed. Owner review is required for jurisdiction-specific retention and security details.'],['Third-Party Services','The app uses Firebase and OpenStreetMap tiles. Advertising is disabled unless the owner configures an advertising publisher and slot; any advertising cookies or consent requirements should be reviewed before activation.'],['Your Rights','Depending on your location, you may have rights to access, correct, or delete personal information. Contact the configured support address to ask a question or make a request; legal details require owner review.']]},
terms:{title:'Terms of Service',updated:'Last updated: October 20, 2026',sections:[['Acceptance of Terms','By using HAUNTERS, you agree to these Terms. If you do not agree, do not use the service. These terms should be reviewed for the operator’s jurisdiction.'],['Eligibility','Use the service only if you are permitted to do so under local law and can safely participate. Parents or guardians should assess whether the game is appropriate for younger players.'],['Game Rules and Fair Play','Use the assigned Game ID, follow the host’s settings, and play honestly. Do not spoof GPS, exploit bugs, harass players, or attempt to access another player’s account.'],['Prohibited Activities','Do not trespass, enter dangerous areas, distract yourself while walking or driving, or use the app to target people who have not joined your game.'],['Location Permissions','The game may request location access for live gameplay. You can deny permission, but some game features may not work. Suggested routes and proximity indicators are estimates.'],['Service Availability and Liability','The service depends on internet connectivity, device sensors, Firebase, maps, and other providers. Availability and accuracy are not guaranteed. You participate at your own risk; obtain legal review before publishing final terms.']]},
disclaimer:{title:'Disclaimer',sections:[['Location Accuracy','GPS accuracy varies with your device, signal, buildings, weather, and surroundings. Player positions, distance warnings, zones, and routes can be delayed or inaccurate.'],['Real-World Risks','Stay aware of traffic, people, terrain, weather, and local conditions. Never play while driving, trespass, or enter unsafe or restricted locations.'],['No Guarantee of Safety','Suggested routes are estimates and are not guaranteed to be safe. HAUNTERS does not replace your judgment, local rules, or emergency services.'],['Age and Permission','Follow applicable age restrictions and obtain a parent or guardian’s permission where required. Hosts should choose locations and settings responsibly.'],['Third-Party Links','External services and links may have their own terms, privacy practices, and availability. Review them independently.'],['Changes','This disclaimer may change as the app evolves. The date shown on this page identifies the current published version.']]},
how:{title:'How to Play'},
contact:{title:'Contact Us'}
};
const SectionList=({sections})=><div className="policy-sections">{sections.map(([t,b],i)=><section key={t}><span>{String(i+1).padStart(2,'0')}</span><div><h2>{t}</h2><p>{b}</p></div></section>)}</div>;
export function Info({slug}){const [active,setActive]=useState('civilian');const data=slug==='how-to-play'?P.how:P[slug]||{title:slug};useEffect(()=>{document.title=data.title+' — HAUNTERS';},[data.title]);
 const [s,setS]=useState({});const [sending,setSending]=useState(false);
 const sub=e=>{e.preventDefault();if(sending)return;const f=new FormData(e.currentTarget),name=String(f.get('name')).trim(),subject=String(f.get('subject')).trim(),category=String(f.get('category')).trim(),message=String(f.get('message')).trim();
  setSending(true);setS({});
  const body=`Name: ${name}\nCategory: ${category}\n\n${message}`;
  window.location.href=`mailto:${cfg.contact}?subject=${encodeURIComponent(`[HAUNTERS] ${subject}`)}&body=${encodeURIComponent(body)}`;
  setS({ok:'Your email app should open with this report addressed to the HAUNTERS support team. Please review it and press Send; this website cannot confirm delivery.'});};
 if(slug==='how-to-play')return <article className="public-page how-page"><h1>{data.title}</h1><div className="how-layout"><div><div className="tabs" role="tablist">{[['civilian','For Civilians'],['haunter','For Haunters']].map(([id,t])=><button key={id} role="tab" aria-selected={active===id} className={active===id?'active':''} onClick={()=>setActive(id)}>{t}</button>)}</div><ol className="steps">{(active==='civilian'?[['Join a Game','Enter the Game ID provided by the host.'],['Stay in the Safe Zone','The zone shrinks on the host’s schedule.'],['Avoid Haunters','Pay attention to proximity warnings and your surroundings.'],['Follow Safe Paths','Suggested routes are estimates, not guarantees of safety.'],['Survive till the End','Be the last civilian alive to win.']]:[['Join as a Haunter','Enter a Game ID provided by the host and wait for the game to begin.'],['Find Civilians','Use the live map and the game’s proximity indicators to locate civilians.'],['Watch Your Position','Follow the active zone and avoid unsafe real-world locations.'],['Play Fair','Do not spoof GPS, harass players, or target anyone outside the game.'],['Eliminate by the Rules','Use only the proximity and elimination rules implemented by the active game.']]).map(([t,b])=><li key={t}><b>{t}</b><span>{b}</span></li>)}</ol></div><div className="map-illustration"><div className="zone"/><i>⌖</i><em>SAFE ZONE</em><strong>●</strong></div></div><PowerUpsGuide/><Ad/></article>;
 if(slug==='features')return <article className="public-page"><h1>{data.title}</h1><p className="lead">Everything you need for a tense, real-world game of hunt or survive.</p><div className="feature-grid">{data.features.map(([i,t,b])=><div className="feature-card" key={t}><b>{i}</b><h2>{t}</h2><p>{b}</p></div>)}</div><div className="more-features"><h2>More Features</h2><p>{data.more}</p></div><Ad/></article>;
 if(data.sections)return <article className="public-page policy"><h1>{data.title}</h1>{data.updated&&<p className="updated">{data.updated}</p>}<SectionList sections={data.sections}/><Ad/></article>;
 if(slug==='about')return <article className="public-page"><h1>{data.title}</h1><div className="about-intro"><div><p className="lead">{data.intro}</p><p>Our game combines a shared map, role-based play, proximity alerts, and a shrinking safe zone. Whether you are hunting or surviving, keep the experience fair and stay aware of the real world.</p></div><div className="city-art">{data.image}</div></div><div className="mission-grid">{data.cards.map(([i,t,b])=><div key={t}><b>{i}</b><h2>{t}</h2><p>{b}</p></div>)}</div><Ad/></article>;
 if(slug==='contact')return <article className="public-page"><h1>{data.title}</h1><p className="lead">Report a bug, gameplay problem, account issue, or suggestion. We will help where we can.</p><div className="support-contact"><span>Support email</span><a href={`mailto:${cfg.contact}`}>{cfg.contact}</a></div><form className="card contact-form" onSubmit={sub}><div className="form-grid"><label>Name<input name="name" autoComplete="name" required/></label><label>Subject<input name="subject" required maxLength={120}/></label></div><label>Problem category<select name="category" defaultValue="Bug Report" required><option>Account/Login</option><option>Game Creation</option><option>Joining a Game</option><option>GPS/Location</option><option>Gameplay</option><option>Bug Report</option><option>Suggestion</option><option>Other</option></select></label><label>Message<textarea name="message" required minLength={10} maxLength={5000} rows={7} placeholder="Please include the Game ID or steps to reproduce when relevant."/><span className="field-hint">At least 10 characters.</span></label><button className="btn" type="submit" disabled={sending}>{sending?'Opening email app…':'Send Message'}</button>{s.ok&&<p className="form-status ok" role="status">{s.ok}</p>}{s.error&&<p className="form-status err" role="alert">{s.error}</p>}</form><p className="delivery-note">This form uses your device’s email application. No automatic email service is configured, and no message is sent until you confirm it in that application.</p><Ad/></article>;
 return <article className="public-page"><h1>{data.title}</h1><p className="lead">{slug==='faq'?'Is it free? Yes, subject to the limits of the configured services. GPS accuracy varies, so game events are approximate.':`Email us at ${cfg.contact}.`}</p><Ad/></article>;}
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
const firebaseError=(e,path)=>{const code=String(e?.code||'').toUpperCase();if(import.meta.env.DEV)console.warn('[Return to Game] Firebase read failed',{path,code:code||'UNKNOWN',message:e?.message||'No error message',authenticated:Boolean(auth?.currentUser)});if(code.includes('PERMISSION_DENIED'))return `Firebase permission denied for ${path}. Confirm the deployed Realtime Database rules allow the signed-in user to read this scoped path.`;if(code.includes('NETWORK')||code.includes('UNAVAILABLE')||code.includes('DISCONNECTED'))return 'Unable to reach Firebase. Check your connection and try again.';return `Could not check your game membership: ${e?.message||code||'unknown Firebase error'}`;};
export function Dashboard(){const u=useUser();const nv=useNavigate();const [g,setG]=useState([]);const [active,setActive]=useState({loading:true,game:null,message:''});const [returning,setReturning]=useState(false);
 useEffect(()=>{const stop=onValue(query(ref(db,'lobby'),limitToLast(30)),s=>{const v=s.val()||{};setG(Object.entries(v).filter(([,x])=>Date.now()-x.createdAt<3*3600e3&&x.open).map(([id,x])=>({id,...x})));});return stop;},[]);
 useEffect(()=>{let gameStop=()=>{};if(!auth?.currentUser||auth.currentUser.uid!==u.uid){setActive({loading:false,game:null,message:'Your session is no longer signed in.'});return()=>{};}const activePath=`users/${u.uid}/activeGameId`,activeRef=ref(db,activePath);const stop=onValue(activeRef,snap=>{
   gameStop();gameStop=()=>{};const id=snap.val();if(!id){setActive({loading:false,game:null,message:''});return;}
   gameStop=onValue(ref(db,`games/${id}`),gameSnap=>{const game=gameSnap.val(),meta=game?.meta,me=game?.players?.[u.uid];if(!meta||!me){remove(activeRef).catch(e=>{if(import.meta.env.DEV)console.warn('[Return to Game] stale pointer cleanup failed',{path:activePath,code:e?.code||'UNKNOWN'});});setActive({loading:false,game:null,message:meta?'You are no longer a member of this game.':'This game is no longer available.'});return;}
    const now=Date.now(),expired=meta.status==='playing'&&Number.isFinite(meta.startedAt)&&Number.isFinite(meta.duration)&&elapsed(meta,now)>=meta.duration*60,staleWaiting=meta.status==='waiting'&&Number.isFinite(meta.createdAt)&&now-meta.createdAt>6*3600e3;
    if((meta.status!=='waiting'&&meta.status!=='playing')||expired||staleWaiting){remove(activeRef).catch(e=>{if(import.meta.env.DEV)console.warn('[Return to Game] completed pointer cleanup failed',{path:activePath,code:e?.code||'UNKNOWN'});});setActive({loading:false,game:null,message:'This game has ended.'});return;}
    setActive({loading:false,game:{id,meta,player:me},message:me.alive===false?'You were eliminated — spectating remains available from the game link.':''});
   },e=>setActive({loading:false,game:null,message:firebaseError(e,`games/${id}`)}));
  },e=>setActive({loading:false,game:null,message:firebaseError(e,activePath)}));return()=>{stop();gameStop();};
 },[u.uid]);
 const returnToGame=async()=>{if(!active.game||returning)return;setReturning(true);
  try{const {id}=active.game,s=await get(ref(db,`games/${id}`)),game=s.val(),meta=game?.meta,me=game?.players?.[u.uid];
   const now=Date.now(),expired=meta?.status==='playing'&&Number.isFinite(meta.startedAt)&&Number.isFinite(meta.duration)&&elapsed(meta,now)>=meta.duration*60;
   const staleWaiting=meta?.status==='waiting'&&Number.isFinite(meta.createdAt)&&now-meta.createdAt>6*3600e3;
   if(!meta||!me)return setActive({loading:false,game:null,message:'This game is no longer available.'});
   if((meta.status==='playing'&&expired)||(meta.status==='waiting'&&staleWaiting))return setActive({loading:false,game:null,message:'This game has ended.'});
   if(meta.status!=='waiting'&&meta.status!=='playing')return setActive({loading:false,game:null,message:'This game has ended.'});
   if(me.alive===false)return setActive({loading:false,game:{id,meta,player:me},message:'You were eliminated — spectating remains available from the game link.'});
   nv('/game/'+id);
  }catch(x){setActive(o=>({...o,message:firebaseError(x,`games/${active.game.id}`)}));}finally{setReturning(false);}
 };
 return <><h1>Welcome, {u.displayName||'player'}</h1>{!u.emailVerified&&<p className="warn">Email not verified — check your inbox.</p>}
  <div className="dashboard-actions"><Link className="btn" to="/create">Create Game</Link> <Link className="btn ghost" to="/join">Join with ID</Link>
   {active.loading?<span className="active-game-status">Checking active games…</span>:active.game?<><button type="button" className="btn g" onClick={returnToGame} disabled={returning||active.game.player.alive===false}>{returning?'Opening…':'Return to Game'}</button>{active.message&&<span className="active-game-status">{active.message}</span>}</>:active.message&&<span className="active-game-status">{active.message}</span>}
  </div>
  <h2>Public games</h2>{!g.length&&<p>No public games right now. Create one!</p>}
  <div className="grid">{g.map(x=><div className="card" key={x.id}><b>{x.name}</b><br/>{x.radius} m · max {x.max}<br/><Link className="btn sm g" to={'/join?code='+x.id}>Join {x.id}</Link></div>)}</div></>;}
function Pick({c,set}){useMapEvents({click:e=>set({lat:e.latlng.lat,lng:e.latlng.lng})});return null;}
function Fly({c}){const m=useMap();useEffect(()=>{m.setView([c.lat,c.lng],m.getZoom()<13?14:m.getZoom());},[c.lat,c.lng]);return null;}
export function Create(){const u=useUser(),nv=useNavigate(),searchInput=useRef(null),searchingRef=useRef(false);const [c,setC]=useState({lat:20.59,lng:78.96});const [f,setF]=useState({name:'',radius:500,duration:30,haunters:1,max:8,pub:true,pass:'',shrinkMin:5});const [m,setM]=useState(''),[q,setQ]=useState(''),[searching,setSearching]=useState(false);
 useEffect(()=>{
  navigator.geolocation?.getCurrentPosition(
   p=>setC({lat:p.coords.latitude,lng:p.coords.longitude}),
   e=>{
    if(e.code===1)setM('Location permission denied. Click the map to choose the centre.');
    else if(e.code===3)setM('GPS timed out. Click the map or use Search to set the centre.');
    else setM('Location unavailable. Click the map or use Search to set the centre.');
   },
   {enableHighAccuracy:true,timeout:20000,maximumAge:10000}
  );
 },[]);
 const k=(n,v)=>setF(o=>({...o,[n]:v}));
 const search=async()=>{
  if(!q.trim()||searchingRef.current)return;
  console.debug('[HAUNTERS] map search handler executing');
  searchingRef.current=true;
  setSearching(true);setM('');
  try{
   const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q));
   if(!r.ok){setM(`Search HTTP error ${r.status}. Click the map instead.`);return;}
   const j=await r.json();
   j[0]?setC({lat:+j[0].lat,lng:+j[0].lon}):setM('No result found for "'+q+'".');
  }catch(err){
   setM('Search request failed. Check connection or click the map.');
  }finally{
   searchingRef.current=false;
   setSearching(false);
  }
 };
 const go=async e=>{e.preventDefault();setM('');
  if(f.name.trim().length<3)return setM('Name must be 3+ characters.');
  if(f.haunters>=f.max)return setM('Haunters must be fewer than max players.');
  try{let id;for(let i=0;i<8;i++){id=rid();if(!(await get(ref(db,`games/${id}/meta`))).exists())break;id=null;}
   if(!id)return setM('Could not find a free ID, try again.');
   const meta={name:f.name.trim(),host:u.uid,center:c,radius:+f.radius,duration:+f.duration,haunters:+f.haunters,max:+f.max,pub:f.pub,shrinkMin:+f.shrinkMin,status:'waiting',createdAt:Date.now(),pass:f.pass?await sha(f.pass+id):''};
   await set(ref(db,`games/${id}/meta`),meta);
   await set(ref(db,`games/${id}/players/${u.uid}`),{name:u.displayName||'Host',ready:true,alive:true,health:100});
   await set(ref(db,`users/${u.uid}/activeGameId`),id);
   if(f.pub)await set(ref(db,`lobby/${id}`),{name:meta.name,host:u.uid,radius:meta.radius,max:meta.max,createdAt:meta.createdAt,open:true});
   nv('/game/'+id);}catch(x){setM(err(x));}};
 const runSearch=e=>{e.preventDefault();e.stopPropagation();console.debug('[HAUNTERS] map search Enter/click event');search();};
 const submit=e=>{if(document.activeElement===searchInput.current){runSearch(e);return;}go(e);};
 return <form onSubmit={submit}><h1>Create Game</h1>
  <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
   <input ref={searchInput} type="search" enterKeyHint="search" inputMode="search" placeholder="Search place (Nominatim)" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13)runSearch(e);}} onSearch={runSearch} style={{margin:0}}/>
   <button type="button" className="btn sm ghost" onClick={runSearch} disabled={searching} style={{whiteSpace:'nowrap',flexShrink:0}}>{searching?'Searching…':'Search'}</button>
  </div>
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
  try{const s=await get(ref(db,`games/${id}/meta`));if(!s.exists())return setM('Game not found.');const meta=s.val();
   if(meta.status!=='waiting')return setM('This game has already started or ended.');
   if(Date.now()-meta.createdAt>6*3600e3)return setM('This game has expired.');
   if(meta.pass&&meta.pass!==await sha(pw+id))return setM('Wrong password.');
   await set(ref(db,`games/${id}/players/${u.uid}`),{name:u.displayName||'Player',ready:false,alive:true,health:100});await set(ref(db,`users/${u.uid}/activeGameId`),id);nv('/game/'+id);}catch(x){setM(err(x));}};
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
