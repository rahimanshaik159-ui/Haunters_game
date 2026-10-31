
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages project sites set VITE_BASE=/repo-name/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'polyester-ridge-cells-macintosh.trycloudflare.com'
    ]
  }
});
