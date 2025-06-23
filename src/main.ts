import { initialize } from './event-handlers';
import { setupEventListeners } from './ui/project-ui';

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    // Clear all storage using the new storage service
    (async () => {
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

document.addEventListener('DOMContentLoaded', async () => {
    await initialize();
    setupEventListeners();
}); 