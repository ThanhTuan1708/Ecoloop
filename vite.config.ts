import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:4174' } },
  build: {
    chunkSizeWarningLimit: 1150,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const normalized = id.replaceAll('\\', '/');
          if (/node_modules\/(maplibre-gl|pmtiles|leaflet)\//.test(normalized)) return 'maps-engine';
          if (/node_modules\/thirdweb\//.test(normalized)) return 'thirdweb-sdk';
          if (/node_modules\/(viem|ox|abitype|@noble|@scure|webauthn-p256)/.test(normalized)) return 'web3';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return 'react';
        },
      },
    },
  },
});
