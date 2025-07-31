// --- Type-Safe DOM Access ---
export function getElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        // Provide more context for debugging DOM issues
        const availableIds = Array.from(document.querySelectorAll('[id]'))
            .map(el => el.id)
            .filter(id => id)
            .sort();
        
        console.error('Available element IDs:', availableIds);
        throw new Error(`Could not find element with id: ${id}. Check console for available IDs.`);
    }
    return element as T;
}

// --- Safe DOM Access (returns null if not found) ---
export function getElementByIdSafe<T extends HTMLElement>(id: string): T | null {
    const element = document.getElementById(id);
    return element as T | null;
}

// --- DOM Elements (Lazy Access) ---
export const modalContainer = () => getElementById<HTMLElement>('modal-container');
export const modalContent = () => getElementById<HTMLElement>('modal-content');
export const testModalContainer = () => getElementById<HTMLElement>('test-modal-container');
export const testModalContent = () => getElementById<HTMLElement>('test-modal-content');

export const newProjectModalContainer = () => getElementById<HTMLElement>('new-project-modal-container');
export const newProjectModalContent = () => getElementById<HTMLElement>('new-project-modal-content');

// Validation function to be called after DOM is loaded
export function validateDOMElements() {
    const elements = [
        'main-app', 'settingsBtn', 'modal-container', 'modal-content', 
        'test-modal-container', 'test-modal-content', 
        'newProjectBtn', 'importProjectBtn', 'comprehensiveExportBtn', 'new-project-modal-container', 
        'new-project-modal-content'
    ];
    
    for (const id of elements) {
        if (!document.getElementById(id)) {
            throw new Error(`Could not find required DOM element with id: ${id}`);
        }
    }
} 