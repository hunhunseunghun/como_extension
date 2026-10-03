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
    // dist/popup은 팝업 빌드만 쓰므로 매번 비운다. 비우지 않으면 이전 빌드의 해시 파일이 계속 쌓인다.
    emptyOutDir: true,
    rollupOptions: {
      external: ['chrome'],
    },
    reportCompressedSize: true,
    sourcemap: false, // 소스맵 제거
    minify: 'esbuild', // 압축 적용
  },
});
