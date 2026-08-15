import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      // Dev-only CORS workaround so the app can be exercised in a desktop
      // browser too. On a real Android build, native Capacitor Http is used
      // instead (see src/lib/http.ts) and this proxy is not involved at all.
      '/nvidia-genai': {
        target: 'https://ai.api.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nvidia-genai/, ''),
      },
      '/nvidia-nvcf': {
        target: 'https://api.nvcf.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nvidia-nvcf/, ''),
      },
    },
  },
})
