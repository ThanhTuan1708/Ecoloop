import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], server: { proxy: { '/api': 'http://127.0.0.1:4174' } }, build: { rollupOptions: { output: { manualChunks(id) {
  if (!id.includes('node_modules')) return;
  if (/node_modules\/(viem|ox|abitype|@noble|@scure|webauthn-p256)/.test(id.replaceAll('\\', '/'))) return 'web3';
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id.replaceAll('\\', '/'))) return 'react';
} } } } });
