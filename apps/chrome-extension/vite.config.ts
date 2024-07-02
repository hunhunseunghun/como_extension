import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, 'src');
const outDir = resolve(rootDir, 'dist');

export default defineConfig({
  plugins: [react()],
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
    lib: {
      formats: ['iife'],
      entry: resolve(rootDir, 'src/background/index.js'),
      name: 'BackgroundScript',
      fileName: 'background',
    },
    emptyOutDir: false,
    rollupOptions: {
      external: ['chrome'],
    },
    reportCompressedSize: true,
  },
  server: {
    hmr: true,
  },
});
