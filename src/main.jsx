import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import 'leaflet/dist/leaflet.css';import './styles/app.css';import './styles/powerups.css';import App from './App.jsx';
createRoot(document.getElementById('root')).render(<BrowserRouter basename={import.meta.env.BASE_URL}><App/></BrowserRouter>);
