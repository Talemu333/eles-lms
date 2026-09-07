import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Prevent stale/corrupted browser data from stopping the React app before it renders.
try {
  const raw = localStorage.getItem('els_lms_data_v11');
  if (raw) JSON.parse(raw);
} catch (error) {
  localStorage.removeItem('els_lms_data_v11');
  sessionStorage.removeItem('els_current');
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
