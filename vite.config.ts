import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { copyFileSync, existsSync } from 'fs'

// Plugin: copiază sql-wasm.wasm din node_modules în public/ la fiecare build
// Astfel WASM-ul este servit local (fără CDN extern) și rămâne sincronizat cu versiunea npm
const copySqlWasm = {
  name: 'copy-sql-wasm',
  buildStart() {
    const src = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')
    const dest = path.resolve(__dirname, 'public/sql-wasm.wasm')
    if (existsSync(src)) {
      copyFileSync(src, dest)
      console.log('✅ sql-wasm.wasm copiat în public/')
    } else {
      console.warn('⚠️ node_modules/sql.js/dist/sql-wasm.wasm nu există - se folosește fișierul existent')
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    copySqlWasm,
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['*.db', '192.png', '512.png', 'sql-wasm.wasm'],
      manifest: {
        name: 'CARapp Petroșani',
        short_name: 'CARapp',
        description: 'Casa de Ajutor Reciproc - Gestiune membri și împrumuturi',
        theme_color: '#0f172a',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: '/192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,sv