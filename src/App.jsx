import {createContext,useContext,useEffect,useState,lazy,Suspense} from 'react';
import {Routes,Route,Link,NavLink,Navigate,useLocation} from 'react-router-dom';
import {onAuthStateChanged,signOut} from 'firebase/auth';
import {auth,configured} from './services/firebase';
import {cfg} from './config';import Ad from './components/Ad.jsx';
import {Home,Info,NotFound,Login,Dashboard,Create,Join,Leaderboard,Account} from './pages/Pages.jsx';
const Room=lazy(()=>import('./pages/Room.jsx'));
const Ctx=createContext(null);export const useUser=()=>useContext(Ctx);
const ThemeCtx=createContext(null);export const useTheme=()=>useContext(ThemeCtx);
const nav=[['/','Home'],['/how-to-play','How to Play'],['/features','Features'],['/leaderboard','Leaderboard'],['/faq','FAQ'],['/contact','Contact']];
const getInitialTheme=()=>{try{const saved=localStorage.getItem('haunters-theme');if(saved==='light'||saved==='dark')return saved;}catch{}return window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark';};
function ThemeIcon({theme}){return theme==='dark'?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.1A8.4 8.4 0 0 1 8.9 3.3 8.5 8.5 0 1 0 20.7 15.1Z"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;}
function Guard({children}){const u=useUser();if(u===undefined)return <p className="c">Loading…</p>;return u?children:<Navigate to="/login" replace/>;}
export default function App(){
 const [user,setUser]=useState(configured?undefined:null);const [menu,setMenu]=useState(false);const [theme,setTheme]=useState(getInitialTheme);const loc=useLocation();
 useEffect(()=>auth?onAuthStateChanged(auth,setUser):undefined,[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('haunters-theme',theme);}catch{}},[theme]);
 useEffect(()=>{window.scrollTo(0,0);setMenu(false);},[loc.pathname]);
 const inGame=loc.pathname.startsWith('/game/');
 const toggleTheme=()=>setTheme(value=>value==='dark'?'light':'dark');const themeLabel=theme==='dark'?'Switch to light mode':'Switch to dark mode';
 const ThemeToggle=({mobile=false})=><button type="button" className={`theme-toggle${mobile?' mobile-theme-toggle':''}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}><ThemeIcon theme={theme}/><span>{mobile?themeLabel:theme==='dark'?'Light':'Dark'}</span></button>;
 return <ThemeCtx.Provider value={{theme,toggleTheme}}><Ctx.Provider value={user}>
  <header className="nav"><Link to="/" className="logo">HAUNTERS</Link>
   <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>☰</button>
   <nav className={menu?'open':''}>{nav.map(([p,t])=><NavLink key={p} to={p} end>{t}</NavLink>)}<div className="mobile-menu-account">{user?<><Link className="mobile-menu-action" to="/dashboard">Dashboard</Link><button className="mobile-menu-action" onClick={()=>{setMenu(false);signOut(auth);}}>Logout</button></>:<Link className="mobile-menu-action login" to="/login">Login</Link>}</div></nav>
   <div className="nav-actions"><ThemeToggle/>{user?<><Link className="btn sm" to="/dashboard">Play Now</Link> <button className="btn sm ghost" onClick={()=>signOut(auth)}>Logout</button></>:<Link className="btn sm ghost" to="/login">Login</Link>}</div>
   <div className={`mobile-nav-tools${menu?' open':''}`}><ThemeToggle mobile/></div></header>
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
 </Ctx.Provider></ThemeCtx.Provider>;}
