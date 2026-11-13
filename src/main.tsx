import React from 'react';
import ReactDOM from 'react-dom/client';
import {applySettings} from './settings';
if (location.pathname.startsWith('/legacy')) history.replaceState(null,'','/'+location.search+location.hash);
  applySettings();
  Promise.all([import('./EcoLoopWeb'), import('./prototype.css')]).then(([{default: Prototype}]) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Prototype /></React.StrictMode>);
  });
