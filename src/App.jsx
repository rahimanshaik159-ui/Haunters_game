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
 const [user,setUser]=useState(configured?undefined:null);const loc=useLocation();
 useEffect(()=>auth?onAuthStateChanged(auth,setUser):undefined,[]);
 useEffect(()=>{window.scrollTo(0,0);},[loc.pathname]);
 const inGame=loc.pathname.startsWith('/game/');
 return <Ctx.Provider value={user}>
  <header className="nav"><Link to="/" className="logo">HAUNTERS</Link>
   <nav>{nav.map(([p,t])=><NavLink key={p} to={p} end>{t}</NavLink>)}</nav>
   {user?<span><Link className="btn sm" to="/dashboard">Play</Link> <button className="btn sm ghost" onClick={()=>signOut(auth)}>Logout</button></span>:<Link className="btn sm ghost" to="/login">Login</Link>}</header>
  {!configured&&<div className="warn">Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.</div>}
  <main><Suspense fallback={<p className="c">Loading…</p>}><Routes>
   <Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/>
   <Route path="/dashboard" element={<Guard><Dashboard/></Guard>}/><Route path="/create" element={<Guard><Create/></Guard>}/>
   <Route path="/join" element={<Guard><Join/></Guard>}/><Route path="/account" element={<Guard><Account/></Guard>}/>
   <Route path="/game/:id" element={<Guard><Room/></Guard>}/><Route path="/leaderboard" element={<Leaderboard/>}/>
   {['about','how-to-play','features','contact','privacy','terms','disclaimer','cookies','guidelines','faq','report'].map(p=><Route key={p} path={'/'+p} element={<Info slug={p}/>}/>)}
   <Route path="*" element={<NotFound/>}/></Routes></Suspense></main>
  {!inGame&&<footer><Ad/><div className="fl">{['about','privacy','terms','disclaimer','cookies','guidelines','faq','report','contact'].map(p=><Link key={p} to={'/'+p}>{p}</Link>)}</div>
   <p>© {new Date().getFullYear()} HAUNTERS. Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.</p></footer>}
 </Ctx.Provider>;}
