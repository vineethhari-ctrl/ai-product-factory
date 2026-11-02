import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * The stand-alone prototype viewer: one script and one stylesheet (dist-viewer/viewer.js and viewer.css). The server puts them,
 * with the project's definition, into a single HTML file (server/prototypeExport.ts). `npm run build:viewer` makes them.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  // A library build does not replace this; React needs it to leave out its development code.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: true,
    sourcemap: false,
    lib: { entry: path.resolve(import.meta.dirname, 'src/viewer/main.tsx'), formats: ['iife'], name: 'PrototypeViewer', fileName: () => 'viewer.js' },
    rollupOptions: { output: { assetFileNames: 'viewer[extname]' } },
  },
});
