import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Render the application immediately. Authentication and course hydration
// are handled inside App so a fresh device without a session cannot be left
// with a blank page when the course API is unavailable or not yet reachable.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
