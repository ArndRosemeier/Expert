/**
 * Type definitions for the modal system
 */

import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
import { ProjectTemplate } from '../../../ProjectTemplate';

/**
 * Base modal configuration interface
 */
export interface ModalConfig {
    id: string;
    title?: string;
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
    closable?: boolean;
    backdrop?: boolean;
}

/**
 * Modal event types
 */
export interface ModalEvents {
    'modal:opening': { id: string; config: ModalConfig };
    'modal:opened': { id: string };
    'modal:closing': { id: string };
    'modal:closed': { id: string };
    'modal:action': { id: string; action: string; data?: any };
}

/**
 * Modal lifecycle hooks
 */
export interface ModalHooks {
    onOpen?: () => void | Promise<void>;
    onClose?: () => void | Promise<void>;
    onAction?: (action: string, data?: any) => void | Promise<void>;
}

/**
 * Base modal interface that all modals must implement
 */
export interface IModal {
    readonly id: string;
    readonly config: ModalConfig;
    
    open(): Promise<void>;
    close(): Promise<void>;
    render(): HTMLElement;
    destroy(): void;
}

/**
 * Generic modal content interface
 */
export interface GenericModalContent {
    content: string;
    actions?: ModalAction[];
}

/**
 * Modal action definition
 */
export interface ModalAction {
    id: string;
    label: string;
    type?: 'primary' | 'secondary' | 'outline' | 'danger';
    handler: () => void | Promise<void>;
}

/**
 * Export modal specific types
 */
export interface ExportModalConfig extends ModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
}

export type ExportScope = 'single' | 'hierarchy' | 'leaves';
export type ExportFormat = 'html' | 'markdown' | 'plain' | 'reimport';

/**
 * Settings modal specific types
 */
export interface SettingsModalConfig extends ModalConfig {
    activeTab?: SettingsTab;
}

export type SettingsTab = 'profiles' | 'models' | 'criteria' | 'prompts' | 'ai-logs';

/**
 * New project modal specific types
 */
export interface NewProjectModalConfig extends ModalConfig {
    templates: ProjectTemplate[];
    onCreate: (title: string, template: ProjectTemplate) => void;
}

/**
 * Context extraction modal specific types
 */
export interface ContextExtractionModalConfig extends ModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
}

/**
 * AI Log modal specific types
 */
export interface AILogModalConfig extends ModalConfig {
    searchQuery?: string;
    filterType?: 'all' | 'creator' | 'rater' | 'editor';
}

/**
 * Test modal specific types
 */
export interface TestModalConfig extends ModalConfig {
    content: string;
}

/**
 * Modal state management
 */
export interface ModalState {
    isOpen: boolean;
    isOpening: boolean;
    isClosing: boolean;
    data?: any;
}

/**
 * Modal registry entry
 */
export interface ModalRegistryEntry {
    modal: IModal;
    state: ModalState;
    element?: HTMLElement;
}

/**
 * Event emitter for modal system
 */
export interface ModalEventEmitter {
    emit<K extends keyof ModalEvents>(event: K, data: ModalEvents[K]): void;
    on<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void;
    off<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void;
} 