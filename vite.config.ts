import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // Use root path for domainfactory, GitHub Pages path for gh-pages
  const base = mode === 'github' ? '/Expert/' : '/';
  
  return {
    base,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2015',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['uuid']
          }
        }
      }
    },
    server: {
      port: 5173,
      host: true
    }
  };
}); 