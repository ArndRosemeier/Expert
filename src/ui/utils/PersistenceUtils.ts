/**
 * Persistence Utilities for eliminating duplication in ProjectPersistenceService
 */

import { IStorageService } from '../../StorageService';
import { IndexedDBService } from '../../IndexedDBService';
import { executeWithErrorHandling, ServiceResponseWithData, createServiceResponse } from './ServiceUtils';

export interface StorageServices {
    storage: IStorageService;
    indexedDB: IndexedDBService | null;
}

export interface PersistenceOperationOptions {
    operation: string;
    fallbackValue?: any;
    requireIndexedDB?: boolean;
}

/**
 * Get storage services with consistent error handling
 */
export async function getStorageServices(requireIndexedDB: boolean = true): Promise<StorageServices> {
    const { StorageService } = await import('../../StorageService');
    
    const storage = await StorageService.getInstance();
    
    let indexedDB: IndexedDBService | null = null;
    if (storage.isIndexedDB()) {
        // Access the IndexedDB service from the storage instance
        const service = await StorageService.getInstance();
        if (service.isIndexedDB()) {
            indexedDB = (service as any).indexedDBService;
        }
    }
    
    if (requireIndexedDB && !indexedDB) {
        throw new Error('IndexedDB service is not available but was required');
    }
    
    return { storage, indexedDB };
}

/**
 * Execute a persistence operation with standardized error handling
 */
export async function executePersistenceOperation<T>(
    operation: () => Promise<T>,
    options: PersistenceOperationOptions
): Promise<ServiceResponseWithData<T>> {
    return executeWithErrorHandling(
        operation,
        `Failed to ${options.operation}. Please try again.`
    );
}

/**
 * Execute a persistence operation that may need fallback values
 */
export async function executePersistenceOperationWithFallback<T>(
    operation: () => Promise<T>,
    options: PersistenceOperationOptions
): Promise<T> {
    const result = await executePersistenceOperation(operation, options);
    
    if (!result.success) {
        console.error(`Persistence operation failed: ${options.operation}`, result.message);
        if (options.fallbackValue !== undefined) {
            return options.fallbackValue;
        }
        throw new Error(result.message);
    }
    
    return result.data!;
}

/**
 * Standard error logging for persistence operations
 */
export function logPersistenceError(operation: string, error: any): void {
    console.error(`Failed to ${operation}:`, error);
}

/**
 * Validate storage services are available
 */
export function validateStorageServices(services: StorageServices, requireIndexedDB: boolean = true): void {
    if (!services.storage) {
        throw new Error('Storage service is not available');
    }
    
    if (requireIndexedDB && !services.indexedDB) {
        throw new Error('IndexedDB service is not available but was required');
    }
}

/**
 * Create a storage operation wrapper that handles common patterns
 */
export function createStorageOperation<T>(
    operationName: string,
    requireIndexedDB: boolean = true
) {
    return async (operation: (services: StorageServices) => Promise<T>, fallbackValue?: T): Promise<T> => {
        return executePersistenceOperationWithFallback(
            async () => {
                const services = await getStorageServices(requireIndexedDB);
                validateStorageServices(services, requireIndexedDB);
                return operation(services);
            },
            {
                operation: operationName,
                fallbackValue,
                requireIndexedDB
            }
        );
    };
}

/**
 * Common storage operation patterns
 */
export const StorageOperations = {
    /**
     * Save multiple projects pattern
     */
    saveProjects: createStorageOperation('save projects to storage'),
    
    /**
     * Load all projects pattern
     */
    loadProjects: createStorageOperation('load projects from storage'),
    
    /**
     * Backup operation pattern
     */
    createBackup: createStorageOperation('create backup'),
    
    /**
     * Restore operation pattern  
     */
    restoreBackup: createStorageOperation('restore from backup'),
    
    /**
     * Get storage stats pattern
     */
    getStats: createStorageOperation('get storage stats', true),
    
    /**
     * Export project pattern
     */
    exportProject: createStorageOperation('export project'),
    
    /**
     * Import project pattern
     */
    importProject: createStorageOperation('import project'),
    
    /**
     * Clear projects pattern
     */
    clearProjects: createStorageOperation('clear all projects')
};

/**
 * Standard fallback values for common operations
 */
export const PersistenceFallbacks = {
    emptyProjectList: { projects: [], activeProjectId: null },
    emptyStats: { projectCount: 0, totalSize: 0, lastModified: null },
    emptyString: '',
    defaultValue: null
}; 