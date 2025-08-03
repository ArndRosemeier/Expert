/**
 * Type definitions for the modal system
 */

import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
// ProjectTemplate import removed - not used in this file

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

// Modal-specific config interfaces moved to individual modal files to avoid export conflicts
// Import them from their respective files if needed:
// - ExportModalConfig from './ExportModal'
// - SettingsModalConfig from './SettingsModal' 
// - NewProjectModalConfig from './NewProjectModal'
// - AILogModalConfig from './AILogModal'

/**
 * Context extraction modal specific types
 */
export interface ContextExtractionModalConfig extends ModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
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

/**
 * Configuration for prompt management
 */
export interface PromptManagementConfig {
    autoSave?: boolean;
    showDescriptions?: boolean;
    showPlaceholders?: boolean;
}

/**
 * Event types for prompt changes
 */
export interface PromptChangeEvent {
    promptKey: string;
    oldValue: string;
    newValue: string;
}

/**
 * Event types for criteria changes
 */
export interface CriteriaChangeEvent {
    criteria: any[];
}

/**
 * Event types for profile selection
 */
export interface ProfileSelectionEvent {
    profileName: string;
    profile: any | null;
}

/**
 * Event types for profile actions
 */
export interface ProfileActionEvent {
    action: 'created' | 'deleted' | 'exported' | 'imported' | 'renamed' | 'duplicated';
    profileName: string;
    data?: any;
}

/**
 * Settings change events
 */
export interface SettingsChangeEvent {
    type: 'profile' | 'models' | 'criteria' | 'iterations' | 'aiLogging' | 'debugGeneration';
    data: any;
}

/**
 * Service interfaces
 */
export interface IPromptManagementService {
    getPrompts(): any;
    updatePrompt(key: string, value: string): void;
    revertToDefaults(): Promise<void>;
    saveToStorage(): Promise<void>;
    reloadFromStorage(): void;
    onPromptChange(handler: (event: PromptChangeEvent) => void): void;
    onSave(handler: () => void): void;
    renderEditor(container: HTMLElement): void;
}

export interface ISettingsService {
    getProfileNames(): string[];
    getProfile(name: string): any | null;
    getLastUsedProfileName(): string | null;
    getLastUsedProfile(): any | null;
    createProfile(name: string): Promise<{ success: boolean; message: string }>;
    switchToProfile(profileName: string): Promise<any | null>;
    deleteProfile(profileName: string): Promise<{ success: boolean; message: string }>;
    exportProfile(profileName: string): { success: boolean; message: string };
    onChange(handler: (event: SettingsChangeEvent) => void): void;
}

/**
 * Component interfaces
 */
export interface ICriteriaEditor {
    getCriteria(): any[];
    setCriteria(criteria: any[]): void;
    addCriterion(criterion?: any): void;
    removeCriterion(index: number): void;
    resetToDefaults(): void;
    copyCriteria(): Promise<void>;
    pasteCriteria(): Promise<void>;
    onChange(handler: (event: CriteriaChangeEvent) => void): void;
}

export interface IProfileSelector {
    getSelectedProfileName(): string;
    setSelectedProfile(profileName: string): void;
    refresh(): void;
    onSelectionChange(handler: (event: ProfileSelectionEvent) => void): void;
    onAction(handler: (event: ProfileActionEvent) => void): void;
}

/**
 * Modal factory configuration
 */
export interface ModalFactoryConfig {
    settingsManager?: any;
    modelSelector?: any;
    projectManager?: any;
    eventEmitter?: any;
}

/**
 * Modal component configuration
 */
export interface ModalComponentConfig {
    container: HTMLElement;
    config?: any;
    dependencies?: any;
} 