/**
 * Persistence Utilities for eliminating duplication in ProjectPersistenceService
 */

import { IStorageService } from '../../StorageService';
import { IndexedDBService } from '../../IndexedDBService';
import { executeWithErrorHandling, ServiceResponseWithData } from './ServiceUtils';

interface StorageServices {
    storage: IStorageService;
    indexedDB: IndexedDBService | null;
}

interface PersistenceOperationOptions<T = unknown> {
    operation: string;
    fallbackValue?: T;
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
        indexedDB = storage.getIndexedDBService();
    }
    
    if (requireIndexedDB && !indexedDB) {
        throw new Error('IndexedDB service is not available but was required');
    }
    
    return { storage, indexedDB };
}

/**
 * Execute a persistence operation with standardized error handling
 */
async function executePersistenceOperation<T>(
    operation: () => Promise<T>,
    options: PersistenceOperationOptions<T>
): Promise<ServiceResponseWithData<T>> {
    return executeWithErrorHandling(
        operation,
        `Failed to ${options.operation}. Please try again.`
    );
}

/**
 * Execute a persistence operation that may need fallback values
 */
async function executePersistenceOperationWithFallback<T>(
    operation: () => Promise<T>,
    options: PersistenceOperationOptions<T>
): Promise<T> {
    const result = await executePersistenceOperation(operation, options);
    
    if (!result.success) {
        console.error(`Persistence operation failed: ${options.operation}`, result.message);
        if (options.fallbackValue !== undefined) {
            return options.fallbackValue;
        }
        throw new Error(result.message);
    }

    // `success` is the authoritative success signal (real failures are caught
    // upstream and set success=false). Many persistence operations legitimately
    // return no data because they resolve to void (e.g. saving or clearing
    // projects). Returning whatever the operation produced avoids fabricating a
    // false "succeeded but returned no data" error for those void operations.
    return result.data as T;
}


/**
 * Validate storage services are available
 */
function validateStorageServices(services: StorageServices, requireIndexedDB: boolean = true): void {
    if (requireIndexedDB && !services.indexedDB) {
        throw new Error('IndexedDB service is not available but was required');
    }
}

/**
 * Create a storage operation wrapper that handles common patterns
 */
function createStorageOperation<T>(
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
                requireIndexedDB,
                ...(fallbackValue !== undefined ? { fallbackValue } : {})
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

 