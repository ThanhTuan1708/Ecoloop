import React from 'react';
import ReactDOM from 'react-dom/client';
if (location.pathname.startsWith('/legacy')) history.replaceState(null,'','/'+location.search+location.hash);
  document.title = 'EcoLoop — Gom điều cũ, gieo điều xanh';
  Promise.all([import('./EcoLoopWeb'), import('./prototype.css')]).then(([{default: Prototype}]) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Prototype /></React.StrictMode>);
  });
