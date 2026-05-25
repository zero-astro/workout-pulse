/**
 * Main Entry Point - Renders the WorkoutPulse React application
 * Mounts the App component into the DOM root element with StrictMode enabled
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
