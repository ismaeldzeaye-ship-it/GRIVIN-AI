import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'hmr-websocket-guard',
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: `
                if (typeof window !== 'undefined' && window.WebSocket) {
                  const OrigWS = window.WebSocket;
                  window.WebSocket = function(url, protocols) {
                    const u = String(url || '');
                    if (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr')) || u.includes('vite-hmr') || (!u.includes('derivws.com') && !u.includes('binance.com'))) {
                      const d = Object.create(window.WebSocket.prototype);
                      d.readyState = 1;
                      d.url = u;
                      d.send = function() {};
                      d.close = function() {};
                      d.addEventListener = function(t, fn) {
                        if (t === 'open') setTimeout(() => { try { fn({ type: 'open' }); } catch(_) {} }, 0);
                      };
                      d.removeEventListener = function() {};
                      d.dispatchEvent = function() { return false; };
                      return d;
                    }
                    return new OrigWS(url, protocols);
                  };
                  window.WebSocket.prototype = OrigWS.prototype;
                  window.WebSocket.CONNECTING = 0;
                  window.WebSocket.OPEN = 1;
                  window.WebSocket.CLOSING = 2;
                  window.WebSocket.CLOSED = 3;
                }
              `,
              injectTo: 'head-prepend'
            }
          ];
        }
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'GREVIN AI — Institutional Signals & SMC Engine',
          short_name: 'GREVIN AI',
          description: 'Institutional order flow, volume profile POC/VAH/VAL, smart money concepts, and real-time push alerts.',
          theme_color: '#050811',
          background_color: '#050811',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio preview environment
      hmr: false,
      watch: null,
    },
  };
});
