import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './app.css';
import { initializeConfiguration } from './chain';
import { errorMessage } from './errors';
const root = ReactDOM.createRoot(document.getElementById('root')!);
async function start() {
  root.render(<div className="boot-screen" role="status">Đang kết nối EcoLoop…</div>);
  try {
    await initializeConfiguration();
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch (error) {
    root.render(<div className="boot-screen"><h1>Chưa kết nối được EcoLoop</h1><p role="alert">{errorMessage(error)}</p><button className="primary" onClick={start}>Thử lại</button></div>);
  }
}
start();
