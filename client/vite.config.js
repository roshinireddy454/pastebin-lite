import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs separately on :3000; proxy API and paste-view routes to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/p': 'http://localhost:3000',
    },
  },
});
