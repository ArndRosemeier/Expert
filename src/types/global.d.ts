// Global constants injected by Vite at build time
declare const __APP_VERSION__: string;
declare const __GIT_HASH__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_NUMBER__: string;
declare const __FULL_VERSION__: string;

// Vite environment variables
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 