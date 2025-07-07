/**
 * Development utilities for better HMR experience
 * Only active in development mode
 */

// Version tracking for cache busting
let lastKnownVersion = '';

export function initDevUtils() {
    if (import.meta.env.PROD) return;
    
    console.log('🔧 Development utilities initialized');
    
    // Track version changes
    trackVersionChanges();
    
    // Add keyboard shortcuts for development
    addDevKeyboardShortcuts();
    
    // Monitor for stale modules
    monitorModuleUpdates();
    

}

function trackVersionChanges() {
    const currentVersion = (window as any).__BUILD_NUMBER__ || 'unknown';
    
    if (lastKnownVersion && lastKnownVersion !== currentVersion) {
        console.log('🔄 Version changed, forcing reload...', {
            old: lastKnownVersion,
            new: currentVersion
        });
        
        // Force a hard reload
        window.location.reload();
    }
    
    lastKnownVersion = currentVersion;
}

function addDevKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+R: Force hard reload
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            console.log('🔄 Force reloading...');
            window.location.reload();
        }
        
        // Ctrl+Shift+D: Clear all storage and reload
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            console.log('🧹 Clearing storage and reloading...');
            
            // Clear all storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Clear IndexedDB (if any)
            if ('indexedDB' in window) {
                indexedDB.databases().then(databases => {
                    databases.forEach(db => {
                        if (db.name) {
                            indexedDB.deleteDatabase(db.name);
                        }
                    });
                });
            }
            
            // Force reload
            setTimeout(() => window.location.reload(), 100);
        }
        
        // Ctrl+Shift+I: Show development info
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            showDevInfo();
        }
        
        // Ctrl+Shift+S: Silent reset settings to defaults
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            console.log('🔄 Resetting settings to defaults...');
            window.location.href = window.location.pathname + '?reset=true';
        }
        

    });
}

function monitorModuleUpdates() {
    // Check for updates every 5 seconds
    setInterval(() => {
        trackVersionChanges();
    }, 5000);
}

function showDevInfo() {
    const info = {
        version: (window as any).__FULL_VERSION__ || 'unknown',
        buildTime: (window as any).__BUILD_TIME__ || 'unknown',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        location: window.location.href,
        hasServiceWorker: 'serviceWorker' in navigator,
        cacheStatus: getCacheStatus()
    };
    
    console.group('🔍 Development Info');
    console.table(info);
    console.groupEnd();
    
    // Show in UI as well
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        color: #fff;
        padding: 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: monospace;
        font-size: 14px;
        max-width: 600px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    modal.innerHTML = `
        <h3>🔍 Development Info</h3>
        <pre>${JSON.stringify(info, null, 2)}</pre>
        <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button onclick="this.parentElement.parentElement.remove()" style="padding: 5px 10px;">Close</button>
            <button onclick="window.location.href = window.location.pathname + '?reset=true'" style="padding: 5px 10px; background: #f59e0b; color: white; border: none; border-radius: 3px;">Reset Settings</button>
            <button onclick="window.location.href = window.location.pathname + '?clean=true'" style="padding: 5px 10px; background: #dc2626; color: white; border: none; border-radius: 3px;">Clear All Data</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function getCacheStatus() {
    const performance = (window as any).performance;
    if (!performance || !performance.getEntriesByType) {
        return 'unknown';
    }
    
    const entries = performance.getEntriesByType('navigation');
    if (entries.length > 0) {
        const entry = entries[0] as any;
        return {
            type: entry.type,
            redirectCount: entry.redirectCount,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize
        };
    }
    
    return 'no-data';
}



// Auto-initialize if in development
if (import.meta.env.DEV) {
    document.addEventListener('DOMContentLoaded', initDevUtils);
} 