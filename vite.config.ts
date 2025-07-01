import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  // Use root path for domainfactory, GitHub Pages path for gh-pages
  const base = mode === 'github' ? '/Expert/' : '/';
  
  // Generate version info
  const versionInfo = getVersionInfo();
  console.log(`📦 Building version: ${versionInfo.fullVersion}`);
  console.log(`🕒 Build time: ${versionInfo.buildTime}`);
  
  return {
    base,
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