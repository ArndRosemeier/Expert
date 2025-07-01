/**
 * Service for accessing application version information.
 * Version data is injected at build time by Vite.
 */
export class VersionService {
  /**
   * Get the semantic version from package.json (e.g., "1.0.0")
   */
  static getVersion(): string {
    return __APP_VERSION__;
  }

  /**
   * Get the short git commit hash (e.g., "a1b2c3d")
   */
  static getGitHash(): string {
    return __GIT_HASH__;
  }

  /**
   * Get the git branch name (e.g., "master", "develop")
   */
  static getGitBranch(): string {
    return __GIT_BRANCH__;
  }

  /**
   * Get the build timestamp in ISO format
   */
  static getBuildTime(): string {
    return __BUILD_TIME__;
  }

  /**
   * Get the build timestamp as a Date object
   */
  static getBuildDate(): Date {
    return new Date(__BUILD_TIME__);
  }

  /**
   * Get the build number (version + git hash, e.g., "1.0.0-a1b2c3d")
   */
  static getBuildNumber(): string {
    return __BUILD_NUMBER__;
  }

  /**
   * Get the full version string (e.g., "1.0.0-a1b2c3d (master)")
   */
  static getFullVersion(): string {
    return __FULL_VERSION__;
  }

  /**
   * Get a formatted build info string for display
   */
  static getBuildInfo(): string {
    const buildDate = this.getBuildDate();
    const formattedDate = buildDate.toLocaleDateString() + ' ' + buildDate.toLocaleTimeString();
    return `${this.getFullVersion()} - Built: ${formattedDate}`;
  }

  /**
   * Get version info as an object
   */
  static getVersionInfo(): {
    version: string;
    gitHash: string;
    gitBranch: string;
    buildTime: string;
    buildNumber: string;
    fullVersion: string;
  } {
    return {
      version: this.getVersion(),
      gitHash: this.getGitHash(),
      gitBranch: this.getGitBranch(),
      buildTime: this.getBuildTime(),
      buildNumber: this.getBuildNumber(),
      fullVersion: this.getFullVersion()
    };
  }

  /**
   * Log version info to console (useful for debugging)
   */
  static logVersionInfo(): void {
    console.log('🚀 Application Version Info:');
    console.log(`   Version: ${this.getVersion()}`);
    console.log(`   Git Hash: ${this.getGitHash()}`);
    console.log(`   Git Branch: ${this.getGitBranch()}`);
    console.log(`   Build Time: ${this.getBuildTime()}`);
    console.log(`   Full Version: ${this.getFullVersion()}`);
  }
} 