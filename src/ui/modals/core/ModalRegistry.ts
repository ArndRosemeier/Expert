/**
 * Central registry for managing modal instances and state
 */

import { IModal, ModalRegistryEntry, ModalState, ModalEventEmitter, ModalEvents } from '../types/ModalTypes';

/**
 * Simple event emitter for modal events
 */
class SimpleEventEmitter implements ModalEventEmitter {
    private handlers: Map<keyof ModalEvents, ((data: any) => void)[]> = new Map();

    emit<K extends keyof ModalEvents>(event: K, data: ModalEvents[K]): void {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            eventHandlers.forEach(handler => { handler(data); });
        }
    }

    on<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event)!.push(handler as (data: any) => void);
    }

    off<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            const index = eventHandlers.indexOf(handler as (data: any) => void);
            if (index > -1) {
                eventHandlers.splice(index, 1);
            }
        }
    }
}

/**
 * Modal registry manages all modal instances
 */
export class ModalRegistry {
    private static instance: ModalRegistry;
    private modals: Map<string, ModalRegistryEntry> = new Map();
    private eventEmitter: ModalEventEmitter = new SimpleEventEmitter();
    private activeModals: string[] = [];

    private constructor() {}

    /**
     * Get the singleton instance
     */
    public static getInstance(): ModalRegistry {
        if (!ModalRegistry.instance) {
            ModalRegistry.instance = new ModalRegistry();
        }
        return ModalRegistry.instance;
    }

    /**
     * Register a modal instance
     */
    public register(modal: IModal): void {
        if (this.modals.has(modal.id)) {
            throw new Error(`Modal with id '${modal.id}' is already registered`);
        }

        const entry: ModalRegistryEntry = {
            modal,
            state: {
                isOpen: false,
                isOpening: false,
                isClosing: false
            }
        };

        this.modals.set(modal.id, entry);
    }

    /**
     * Unregister a modal instance
     */
    public unregister(modalId: string): void {
        const entry = this.modals.get(modalId);
        if (entry) {
            // Close modal if it's open
            if (entry.state.isOpen) {
                void entry.modal.close();
            }
            
            // Remove from active modals
            this.removeFromActive(modalId);
            
            // Clean up
            entry.modal.destroy();
            this.modals.delete(modalId);
        }
    }

    /**
     * Get a modal by id
     */
    public get(modalId: string): IModal | undefined {
        return this.modals.get(modalId)?.modal;
    }

    /**
     * Get modal state
     */
    public getState(modalId: string): ModalState | undefined {
        return this.modals.get(modalId)?.state;
    }

    /**
     * Update modal state
     */
    public updateState(modalId: string, state: Partial<ModalState>): void {
        const entry = this.modals.get(modalId);
        if (entry) {
            entry.state = { ...entry.state, ...state };
        }
    }

    /**
     * Open a modal by id
     */
    public async open(modalId: string): Promise<void> {
        const entry = this.modals.get(modalId);
        if (!entry) {
            throw new Error(`Modal with id '${modalId}' is not registered`);
        }

        // Check if another modal is already open and handle accordingly
        if (this.hasOpenModal() && !this.isModalOpen(modalId)) {
            // For now, close other modals. Later we could support modal stacking
            await this.closeAll();
        }

        // Update state
        this.updateState(modalId, { isOpening: true });
        this.eventEmitter.emit('modal:opening', { id: modalId, config: entry.modal.config });

        try {
            await entry.modal.open();
            this.updateState(modalId, { isOpen: true, isOpening: false });
            this.addToActive(modalId);
            this.eventEmitter.emit('modal:opened', { id: modalId });
        } catch (error) {
            this.updateState(modalId, { isOpening: false });
            throw error;
        }
    }

    /**
     * Close a modal by id
     */
    public async close(modalId: string): Promise<void> {
        const entry = this.modals.get(modalId);
        if (!entry?.state.isOpen) {
            return;
        }

        // Update state
        this.updateState(modalId, { isClosing: true });
        this.eventEmitter.emit('modal:closing', { id: modalId });

        try {
            await entry.modal.close();
            this.updateState(modalId, { isOpen: false, isClosing: false });
            this.removeFromActive(modalId);
            this.eventEmitter.emit('modal:closed', { id: modalId });
        } catch (error) {
            this.updateState(modalId, { isClosing: false });
            throw error;
        }
    }

    /**
     * Close all open modals
     */
    public async closeAll(): Promise<void> {
        const openModalIds = this.activeModals.slice(); // Copy array
        await Promise.all(openModalIds.map(async id => this.close(id)));
    }

    /**
     * Check if any modal is open
     */
    public hasOpenModal(): boolean {
        return this.activeModals.length > 0;
    }

    /**
     * Check if a specific modal is open
     */
    public isModalOpen(modalId: string): boolean {
        return this.activeModals.includes(modalId);
    }

    /**
     * Get all open modal ids
     */
    public getOpenModals(): string[] {
        return [...this.activeModals];
    }

    /**
     * Get the currently active (top) modal
     */
    public getActiveModal(): IModal | undefined {
        const activeId = this.activeModals[this.activeModals.length - 1];
        return activeId ? this.get(activeId) : undefined;
    }

    /**
     * Emit a modal action event
     */
    public emitAction(modalId: string, action: string, data?: unknown): void {
        this.eventEmitter.emit('modal:action', { id: modalId, action, data });
    }

    /**
     * Subscribe to modal events
     */
    public on<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void {
        this.eventEmitter.on(event, handler);
    }

    /**
     * Unsubscribe from modal events
     */
    public off<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void {
        this.eventEmitter.off(event, handler);
    }

    /**
     * Get all registered modal ids
     */
    public getAllModalIds(): string[] {
        return Array.from(this.modals.keys());
    }

    /**
     * Clear all modals (for cleanup/testing)
     */
    public clear(): void {
        void this.closeAll();
        this.modals.forEach(entry => { entry.modal.destroy(); });
        this.modals.clear();
        this.activeModals = [];
    }

    private addToActive(modalId: string): void {
        if (!this.activeModals.includes(modalId)) {
            this.activeModals.push(modalId);
        }
    }

    private removeFromActive(modalId: string): void {
        const index = this.activeModals.indexOf(modalId);
        if (index > -1) {
            this.activeModals.splice(index, 1);
        }
    }
}

/**
 * Convenience function to get the modal registry instance
 */
export function getModalRegistry(): ModalRegistry {
    return ModalRegistry.getInstance();
} 