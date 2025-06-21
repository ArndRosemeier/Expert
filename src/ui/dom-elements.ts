// --- Type-Safe DOM Access ---
export function getElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Could not find element with id: ${id}`);
    }
    return element as T;
}

// --- DOM Elements ---
export const mainAppContainer = getElementById<HTMLElement>('main-app');
export const settingsBtn = getElementById<HTMLButtonElement>('settingsBtn');
export const modalContainer = getElementById<HTMLElement>('modal-container');
export const modalContent = getElementById<HTMLElement>('modal-content');
export const testModalContainer = getElementById<HTMLElement>('test-modal-container');
export const testModalContent = getElementById<HTMLElement>('test-modal-content');
export const runTestsBtn = getElementById<HTMLButtonElement>('runTestsBtn');
export const newProjectBtn = getElementById<HTMLButtonElement>('newProjectBtn');
export const newProjectModalContainer = getElementById<HTMLElement>('new-project-modal-container');
export const newProjectModalContent = getElementById<HTMLElement>('new-project-modal-content');


if (!mainAppContainer || !settingsBtn || !modalContainer || !modalContent || !testModalContainer || !testModalContent || !runTestsBtn || !newProjectBtn || !newProjectModalContainer || !newProjectModalContent) {
    throw new Error('Could not find required DOM elements');
} 