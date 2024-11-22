import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',  // This makes it accessible from any IP
    port: 5173
  }
})