import {createContext,useContext,useEffect,useState,lazy,Suspense} from 'react';
import {Routes,Route,Link,NavLink,Navigate,useLocation} from 'react-router-dom';
import {onAuthStateChanged,signOut} from 'firebase/auth';
import {auth,configured} from './services/firebase';
import {cfg} from './config';import Ad from './components/Ad.jsx';
import {Home,Info,NotFound,Login,Dashboard,Create,Join,Leaderboard,Account} from './pages/Pages.jsx';
const Room=lazy(()=>import('./pages/Room.jsx'));
const Ctx=createContext(null);export const useUser=()=>useContext(Ctx);
const nav=[['/','Home'],['/how-to-play','How to Play'],['/features','Features'],['/leaderboard','Leaderboard'],['/faq','FAQ'],['/contact','Contact']];
function Guard({children}){const u=useUser();if(u===undefined)return <p className="c">Loading…</p>;return u?children:<Navigate to="/login" replace/>;}
export default function App(){
 const [user,setUser]=useState(configured?undefined:null);const [menu,setMenu]=useState(false);const loc=useLocation();
 useEffect(()=>auth?onAuthStateChanged(auth,setUser):undefined,[]);
 useEffect(()=>{window.scrollTo(0,0);setMenu(false);},[loc.pathname]);
 const inGame=loc.pathname.startsWith('/game/');
 return <Ctx.Provider value={user}>
  <header className="nav"><Link to="/" className="logo">HAUNTERS</Link>
   <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>☰</button>
   <nav className={menu?'open':''}>{nav.map(([p,t])=><NavLink key={p} to={p} end>{t}</NavLink>)}</nav>
   <div className="nav-actions">{user?<><Link className="btn sm" to="/dashboard">Play Now</Link> <button className="btn sm ghost" onClick={()=>signOut(auth)}>Logout</button></>:<Link className="btn sm ghost" to="/login">Login</Link>}</div></header>
  {!configured&&<div className="warn">Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.</div>}
  <main className={inGame?'game-main':''}><Suspense fallback={<p className="c">Loading…</p>}><Routes>
   <Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/>
   <Route path="/dashboard" element={<Guard><Dashboard/></Guard>}/><Route path="/create" element={<Guard><Create/></Guard>}/>
   <Route path="/join" element={<Guard><Join/></Guard>}/><Route path="/account" element={<Guard><Account/></Guard>}/>
   <Route path="/game/:id" element={<Guard><Room/></Guard>}/><Route path="/leaderboard" element={<Leaderboard/>}/>
   {['about','how-to-play','features','contact','privacy','terms','disclaimer','cookies','guidelines','faq','report'].map(p=><Route key={p} path={'/'+p} element={<Info slug={p}/>}/>)}
   <Route path="*" element={<NotFound/>}/></Routes></Suspense></main>
  {!inGame&&<footer><div className="footer-inner"><div><Link to="/" className="logo">HAUNTERS</Link><p>HUNT OR SURVIVE<br/><span>Real-world multiplayer survival.</span></p></div><div><h3>Quick Links</h3><div className="fl">{[['/','Home'],['/how-to-play','How to Play'],['/features','Features'],['/leaderboard','Leaderboard'],['/contact','Contact']].map(([p,t])=><Link key={p} to={p}>{t}</Link>)}</div></div><div><h3>Support</h3><div className="fl">{[['/privacy','Privacy Policy'],['/terms','Terms of Service'],['/disclaimer','Disclaimer'],['/faq','FAQ']].map(([p,t])=><Link key={p} to={p}>{t}</Link>)}</div></div><div><h3>Follow Us</h3><div className="socials"><a href="https://instagram.com" aria-label="Instagram">◎</a><a href="https://youtube.com" aria-label="YouTube">▶</a><a href="https://x.com" aria-label="X">𝕏</a></div></div></div><Ad/>
   <p>© {new Date().getFullYear()} HAUNTERS. All rights reserved. · Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.</p></footer>}
 </Ctx.Provider>;}
