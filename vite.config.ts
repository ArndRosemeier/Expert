import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import checker from 'vite-plugin-checker';

function getVersionInfo() {
  try {
    // Get git commit hash (short)
    const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    
    // Get git branch name
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    
    // Get build timestamp
    const buildTime = new Date().toISOString();
    
    // Get package version
    const packageJson = JSON.parse(readFileSync(resolve('./package.json'), 'utf8'));
    const version = packageJson.version;
    
    return {
      version,
      gitHash,
      gitBranch,
      buildTime,
      buildNumber: `${version}-${gitHash}`,
      fullVersion: `${version}-${gitHash} (${gitBranch})`
    };
  } catch (error) {
    console.warn('Could not generate version info:', error.message);
    return {
      version: '1.0.0',
      gitHash: 'unknown',
      gitBranch: 'unknown',
      buildTime: new Date().toISOString(),
      buildNumber: '1.0.0-unknown',
      fullVersion: '1.0.0-unknown'
    };
  }
}

export default defineConfig(({ mode }) => {
  // Use specific base paths for different deployment targets
  let base = '/';
  if (mode === 'github') {
    base = '/Expert/';
  } else if (mode === 'domainfactory') {
    base = '/Expert/';  // domainfactory also serves from /Expert/ subdirectory
  }
  
  // Generate version info
  const versionInfo = getVersionInfo();
  console.log(`📦 Building version: ${versionInfo.fullVersion}`);
  console.log(`🕒 Build time: ${versionInfo.buildTime}`);
  
  return {
    base,
    plugins: [
      cssInjectedByJsPlugin(),
      checker({
        typescript: true,
        enableBuild: true,
        overlay: {
          initialIsOpen: false,
          position: 'br'
        }
      })
    ],
    define: {
      // Inject version info as compile-time constants
      __APP_VERSION__: JSON.stringify(versionInfo.version),
      __GIT_HASH__: JSON.stringify(versionInfo.gitHash),
      __GIT_BRANCH__: JSON.stringify(versionInfo.gitBranch),
      __BUILD_TIME__: JSON.stringify(versionInfo.buildTime),
      __BUILD_NUMBER__: JSON.stringify(versionInfo.buildNumber),
      __FULL_VERSION__: JSON.stringify(versionInfo.fullVersion)
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'esbuild',  // Enable JS minification
      cssMinify: false,  // Disable CSS minification to prevent style changes
      target: 'es2015',
      // Increase chunk size warning limit since we're splitting chunks better
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        },
        output: {
          // Add hash to filenames for cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          // Smart chunk splitting - split out large dependencies instead of grouping them
          manualChunks(id) {
            // Node modules go to vendor chunk
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            
            // Split out the largest problematic files individually
            if (id.includes('src/ui/modals/services/GenerationErrorService.ts')) {
              return 'generation-error';
            }
            
            if (id.includes('src/idea-board/IdeaBoard.ts')) {
              return 'idea-board';
            }
            
            if (id.includes('src/overview-board/OverviewBoardModal.ts')) {
              return 'overview-board';
            }
            
            // Split out large modal services
            if (id.includes('src/ui/modals/services/') && id.includes('Service.ts')) {
              return 'modal-services';
            }
            
            // Split out large modals
            if (id.includes('src/ui/modals/') && 
                (id.includes('LogicErrorDetectorModal.ts') || 
                 id.includes('LogicOutlineFixerModal.ts') ||
                 id.includes('RedundancyDetectorModal.ts') ||
                 id.includes('NodeInspectorModal.ts'))) {
              return 'large-modals';
            }
            
            // Let project-ui.ts and event-handlers.ts split naturally
            // Don't force them into specific chunks
          }
        }
      }
    },
    server: {
      port: 5173,
      host: true,
      // Force browser to not cache files during development
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      },
      hmr: {
        // Force HMR to always reload
        overlay: true
      }
    }
  };
}); 