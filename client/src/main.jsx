import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// StrictMode is intentionally off: its dev-only double mount would open and close
// camera streams and peer connections twice, which makes WebRTC debugging confusing.
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
