/**
 * Event Manager - Systematic solution for robust event handling
 * 
 * This system provides:
 * 1. Persistent event delegation that survives DOM replacements
 * 2. Automatic cleanup tracking to prevent memory leaks
 * 3. Event listener recovery after DOM changes
 * 4. Centralized event management patterns
 */

type EventHandler = (event: Event) => void;
type EventCleanup = () => void;

interface DelegatedEventInfo {
    container: HTMLElement;
    eventType: string;
    selector: string;
    handler: EventHandler;
    cleanup?: EventCleanup;
}

interface DirectEventInfo {
    element: HTMLElement;
    eventType: string;
    handler: EventHandler;
    cleanup: EventCleanup;
    reattachable: boolean;
    elementSelector: string | undefined; // For reattaching after DOM changes
}

export class EventManager {
    private static instance: EventManager | null = null;
    private delegatedEvents: DelegatedEventInfo[] = [];
    private directEvents: DirectEventInfo[] = [];
    private cleanupQueue: EventCleanup[] = [];
    private observer: MutationObserver;

    private constructor() {
        // Set up DOM mutation observer to detect when elements are replaced
        this.observer = new MutationObserver((mutations) => {
            this.handleDOMChanges(mutations);
        });
        
        // Start observing changes to the main content area
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            this.observer.observe(mainContent, {
                childList: true,
                subtree: true
            });
        }
    }

    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    /**
     * Add event delegation - survives DOM replacements
     * Best for buttons, form controls, etc. inside frequently replaced containers
     */
    public addDelegatedEvent(
        container: HTMLElement | string,
        eventType: string,
        selector: string,
        handler: EventHandler
    ): EventCleanup {
        const containerElement = typeof container === 'string' 
            ? document.getElementById(container) 
            : container;
            
        if (!containerElement) {
            console.warn(`EventManager: Container not found for delegated event: ${container}`);
            return () => {};
        }

        const delegatedHandler = (event: Event) => {
            const target = event.target as HTMLElement;
            const matchedElement = target.closest(selector);
            if (matchedElement && containerElement.contains(matchedElement)) {
                // Set the matched element as the currentTarget for the handler
                Object.defineProperty(event, 'currentTarget', {
                    value: matchedElement,
                    enumerable: true
                });
                handler(event);
            }
        };

        containerElement.addEventListener(eventType, delegatedHandler);

        const eventInfo: DelegatedEventInfo = {
            container: containerElement,
            eventType,
            selector,
            handler: delegatedHandler
        };

        this.delegatedEvents.push(eventInfo);

        const cleanup = () => {
            containerElement.removeEventListener(eventType, delegatedHandler);
            const index = this.delegatedEvents.indexOf(eventInfo);
            if (index > -1) {
                this.delegatedEvents.splice(index, 1);
            }
        };

        eventInfo.cleanup = cleanup;
        return cleanup;
    }

    /**
     * Add direct event listener with automatic cleanup tracking
     * Use for elements that don't get replaced frequently
     */
    public addDirectEvent(
        element: HTMLElement | string,
        eventType: string,
        handler: EventHandler,
        options: {
            reattachable?: boolean;
            elementSelector?: string;
        } = {}
    ): EventCleanup {
        const targetElement = typeof element === 'string' 
            ? document.getElementById(element) 
            : element;
            
        if (!targetElement) {
            console.warn(`EventManager: Element not found for direct event: ${element}`);
            return () => {};
        }

        targetElement.addEventListener(eventType, handler);

        const cleanup = () => {
            targetElement.removeEventListener(eventType, handler);
        };

        const eventInfo: DirectEventInfo = {
            element: targetElement,
            eventType,
            handler,
            cleanup,
            reattachable: options.reattachable || false,
            elementSelector: options.elementSelector || undefined
        };

        this.directEvents.push(eventInfo);
        this.cleanupQueue.push(() => {
            const index = this.directEvents.indexOf(eventInfo);
            if (index > -1) {
                this.directEvents.splice(index, 1);
            }
        });

        return cleanup;
    }

    /**
     * Safe button content update that preserves event listeners
     */
    public updateButtonContent(
        buttonId: string,
        content: string,
        options: {
            disabled?: boolean;
            className?: string;
        } = {}
    ): void {
        const button = document.getElementById(buttonId) as HTMLButtonElement;
        if (!button) return;

        // Update content without replacing the element
        button.innerHTML = content;
        
        if (options.disabled !== undefined) {
            button.disabled = options.disabled;
        }
        
        if (options.className) {
            button.className = options.className;
        }
    }

    /**
     * Safe DOM replacement that preserves event delegation
     * Use this instead of innerHTML when possible
     */
    public replaceContent(
        container: HTMLElement | string,
        htmlContent: string,
        options: {
            preserveClasses?: boolean;
            beforeReplace?: () => void;
            afterReplace?: () => void;
        } = {}
    ): void {
        const containerElement = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerElement) return;

        options.beforeReplace?.();

        // Store original classes if needed
        const originalClasses = options.preserveClasses 
            ? Array.from(containerElement.classList) 
            : [];

        // Replace content
        containerElement.innerHTML = htmlContent;

        // Restore classes if needed
        if (options.preserveClasses && originalClasses.length > 0) {
            containerElement.classList.add(...originalClasses);
        }

        options.afterReplace?.();
    }

    /**
     * Batch cleanup for multiple event listeners
     */
    public createCleanupBatch(): {
        add: (cleanup: EventCleanup) => void;
        cleanup: () => void;
    } {
        const cleanups: EventCleanup[] = [];

        return {
            add: (cleanup: EventCleanup) => {
                cleanups.push(cleanup);
            },
            cleanup: () => {
                cleanups.forEach(fn => fn());
                cleanups.length = 0;
            }
        };
    }

    /**
     * Handle DOM changes and reattach listeners if needed
     */
    private handleDOMChanges(mutations: MutationRecord[]): void {
        let needsReattachment = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check if any of our tracked elements were removed
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        this.handleElementRemoved(element);
                        needsReattachment = true;
                    }
                });
            }
        }

        if (needsReattachment) {
            this.reattachMissingListeners();
        }
    }

    /**
     * Handle element removal and cleanup
     */
    private handleElementRemoved(_removedElement: HTMLElement): void {
        // Clean up direct events for removed elements
        this.directEvents = this.directEvents.filter(eventInfo => {
            if (!document.contains(eventInfo.element)) {
                eventInfo.cleanup();
                return false;
            }
            return true;
        });
    }

    /**
     * Reattach listeners that can be reattached
     */
    private reattachMissingListeners(): void {
        this.directEvents.forEach(eventInfo => {
            if (eventInfo.reattachable && 
                eventInfo.elementSelector && 
                !document.contains(eventInfo.element)) {
                
                const newElement = document.querySelector(eventInfo.elementSelector) as HTMLElement;
                if (newElement) {
                    // Update the event info with the new element
                    eventInfo.element = newElement;
                    newElement.addEventListener(eventInfo.eventType, eventInfo.handler);
                }
            }
        });
    }

    /**
     * Global cleanup - call this when shutting down
     */
    public cleanup(): void {
        // Clean up delegated events
        this.delegatedEvents.forEach(eventInfo => {
            eventInfo.cleanup?.();
        });
        this.delegatedEvents = [];

        // Clean up direct events
        this.directEvents.forEach(eventInfo => {
            eventInfo.cleanup();
        });
        this.directEvents = [];

        // Run cleanup queue
        this.cleanupQueue.forEach(cleanup => cleanup());
        this.cleanupQueue = [];

        // Stop observing
        this.observer?.disconnect();
    }

    /**
     * Debug information
     */
    public getDebugInfo(): {
        delegatedEvents: number;
        directEvents: number;
        cleanupQueue: number;
    } {
        return {
            delegatedEvents: this.delegatedEvents.length,
            directEvents: this.directEvents.length,
            cleanupQueue: this.cleanupQueue.length
        };
    }
}

// Convenience functions for common patterns
export const eventManager = EventManager.getInstance();

/**
 * Safe wrapper for getElementById with event listener support
 */
export function getElementWithEvents(id: string): HTMLElement | null {
    return document.getElementById(id);
}

/**
 * Utility to check if an element still exists in the DOM
 */
export function isElementAttached(element: HTMLElement): boolean {
    return document.contains(element);
} 