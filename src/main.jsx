import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Imports your main application logic
import './index.css'; // Imports the compiled Tailwind CSS

// The entry point where the application is mounted to the DOM.
// This matches the <div id="root"> in index.html.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);