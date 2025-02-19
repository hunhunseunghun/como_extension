import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, 'src');

const outDir = resolve(rootDir, '..', '..', 'dist', 'popup');
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@root': rootDir,
      '@src': srcDir,
      '@': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      external: ['chrome'],
    },
    reportCompressedSize: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
