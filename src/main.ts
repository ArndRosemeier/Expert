import { AppKeyService } from './keys/AppKeyService.js';

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    // Clear all storage using the new storage service
    void (async () => {
        try {
            const { StorageService } = await import('./StorageService');
            const storage = await StorageService.getInstance();
            await storage.clear();
    
    // Redirect to the same page without the query parameter
    window.location.href = window.location.pathname;
        } catch (error) {
            console.error('Failed to clear storage:', error);
            alert('Failed to clear application data. Please try again or contact support.');
        }
    })();
}

document.addEventListener('DOMContentLoaded', () => {
    void (async () => {
        // Check for valid application key before starting the app
        console.log('🔑 Expert Application starting - checking key validation...');
        
        const appKeyService = AppKeyService.getInstance();
        
        try {
            // Check if we have a valid key stored in IndexedDB at keyValue/expert_app_key
            const hasValidKey = await appKeyService.checkAppAccess();
            
            if (hasValidKey) {
                // Valid key found - start the app normally
                console.log('✅ Valid key found in keyValue/expert_app_key - starting application');
                await startApplication();
            } else {
                // No valid key - AppKeyService will handle showing the validation modal
                // The modal will call startApplication() once a valid key is provided
                console.log('⏳ Waiting for valid key validation...');
            }
        } catch (error) {
            console.error('❌ Error during key validation:', error);
            alert('Failed to validate application key. Please refresh the page and try again.');
        }
    })();
});

/**
 * Start the main application after key validation is complete
 */
async function startApplication(): Promise<void> {
    console.log('🚀 Initializing Expert application...');
    
    try {
        const { initialize } = await import('./event-handlers');
        const { setupEventListeners } = await import('./ui/project-ui');
        
        await initialize();
        setupEventListeners();
        
        console.log('✅ Expert application started successfully');
    } catch (error) {
        console.error('❌ Failed to start application:', error);
        alert('Failed to start the application. Please refresh the page and try again.');
    }
}

// Expose startApplication to global scope so AppKeyService can call it
(window as any).startApplication = startApplication; 