import {initializeApp} from 'firebase/app';import {getAuth} from 'firebase/auth';
import {getDatabase} from 'firebase/database';import {getFirestore} from 'firebase/firestore';
const e=import.meta.env;
export const configured=!!e.VITE_FIREBASE_API_KEY;
const app=configured?initializeApp({apiKey:e.VITE_FIREBASE_API_KEY,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN,databaseURL:e.VITE_FIREBASE_DATABASE_URL,projectId:e.VITE_FIREBASE_PROJECT_ID,storageBucket:e.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:e.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:e.VITE_FIREBASE_APP_ID}):null;
export const auth=app&&getAuth(app),db=app&&getDatabase(app),fs=app&&getFirestore(app);
