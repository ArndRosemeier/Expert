/**
 * Service Utilities for reducing duplication in service response patterns
 */

export interface ServiceResponse {
    success: boolean;
    message: string;
}

export interface ServiceResponseWithData<T = any> extends ServiceResponse {
    data?: T;
}

export interface ValidationResult {
    isValid: boolean;
    message: string;
}

export interface AsyncOperationOptions {
    loadingMessage?: string;
    successMessage?: string;
    errorMessage?: string;
    retryCount?: number;
}

/**
 * Create a standard service response
 */
export function createServiceResponse(success: boolean, message: string): ServiceResponse {
    return { success, message };
}

/**
 * Create a service response with data
 */
export function createServiceResponseWithData<T>(success: boolean, message: string, data?: T): ServiceResponseWithData<T> {
    const response: ServiceResponseWithData<T> = { success, message };
    if (data !== undefined) {
        response.data = data;
    }
    return response;
}

/**
 * Standard validation for required string fields
 */
export function validateRequired(value: string | undefined | null, fieldName: string): ValidationResult {
    if (!value || value.trim() === '') {
        return {
            isValid: false,
            message: `Please provide a ${fieldName}.`
        };
    }
    return { isValid: true, message: '' };
}

/**
 * Standard validation for required selection
 */
export function validateSelection(value: string | undefined | null, itemType: string): ValidationResult {
    if (!value) {
        return {
            isValid: false,
            message: `Please select a ${itemType}.`
        };
    }
    return { isValid: true, message: '' };
}

/**
 * Wrapper for async operations with standard error handling
 */
export async function executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    errorMessage: string = 'Operation failed. Please try again.'
): Promise<ServiceResponseWithData<T>> {
    try {
        const result = await operation();
        return createServiceResponseWithData(true, 'Operation completed successfully', result);
    } catch (error) {
        console.error('Service operation failed:', error);
        return createServiceResponseWithData<T>(false, errorMessage);
    }
}

/**
 * Standard error responses for common scenarios
 */
export const StandardErrors = {
    profileNotSelected: (): ServiceResponse => 
        createServiceResponse(false, 'Please select a profile.'),
    
    fileNotSelected: (): ServiceResponse => 
        createServiceResponse(false, 'Please select a file.'),
    
    invalidFileFormat: (): ServiceResponse => 
        createServiceResponse(false, 'Please check the file format and try again.'),
    
    exportFailed: (): ServiceResponse => 
        createServiceResponse(false, 'Failed to export. Please try again.'),
    
    importFailed: (): ServiceResponse => 
        createServiceResponse(false, 'Failed to import. Please check the file format and try again.'),
    
    saveProfileFailed: (): ServiceResponse => 
        createServiceResponse(false, 'Failed to save profile. Please try again.'),
    
    deleteProfileFailed: (): ServiceResponse => 
        createServiceResponse(false, 'Failed to delete profile. Please try again.'),
    
    networkError: (): ServiceResponse => 
        createServiceResponse(false, 'Network error. Please check your connection and try again.'),
    
    unauthorized: (): ServiceResponse => 
        createServiceResponse(false, 'Authorization failed. Please check your API key.'),
    
    rateLimited: (): ServiceResponse => 
        createServiceResponse(false, 'Rate limit exceeded. Please wait and try again.')
};

/**
 * Standard success responses for common scenarios
 */
export const StandardSuccess = {
    profileExported: (profileName: string): ServiceResponse => 
        createServiceResponse(true, `Profile "${profileName}" exported successfully.`),
    
    profileImported: (profileName: string): ServiceResponse => 
        createServiceResponse(true, `Profile "${profileName}" imported successfully.`),
    
    profileSaved: (profileName: string): ServiceResponse => 
        createServiceResponse(true, `Profile "${profileName}" saved successfully.`),
    
    profileDeleted: (profileName: string): ServiceResponse => 
        createServiceResponse(true, `Profile "${profileName}" deleted successfully.`),
    
    settingsUpdated: (): ServiceResponse => 
        createServiceResponse(true, 'Settings updated successfully.'),
    
    operationCompleted: (): ServiceResponse => 
        createServiceResponse(true, 'Operation completed successfully.')
};

/**
 * Handle file operations with standard patterns
 */
export class FileOperationHelper {
    static validateFile(file: File | undefined | null, allowedExtensions?: string[]): ValidationResult {
        if (!file) {
            return { isValid: false, message: 'Please select a file.' };
        }
        
        if (allowedExtensions && allowedExtensions.length > 0) {
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!extension || !allowedExtensions.includes(extension)) {
                return { 
                    isValid: false, 
                    message: `Please select a file with one of these extensions: ${allowedExtensions.join(', ')}`
                };
            }
        }
        
        return { isValid: true, message: '' };
    }
    
    static async readFileAsText(file: File): Promise<ServiceResponseWithData<string>> {
        return executeWithErrorHandling(
            () => new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            }),
            'Failed to read file. Please try again.'
        );
    }
    
    static async readFileAsJSON<T>(file: File): Promise<ServiceResponseWithData<T>> {
        const textResult = await this.readFileAsText(file);
        if (!textResult.success) {
            return createServiceResponseWithData<T>(false, textResult.message);
        }
        
        try {
            const data = JSON.parse(textResult.data!) as T;
            return createServiceResponseWithData(true, 'File parsed successfully', data);
        } catch (error) {
            return createServiceResponseWithData<T>(false, 'Invalid JSON file format.');
        }
    }
}

/**
 * Event emitter helper for services
 */
export interface ServiceChangeEvent<T = any> {
    type: string;
    data?: T;
}

export class ServiceEventEmitter {
    private listeners: Map<string, Function[]> = new Map();
    
    on(eventType: string, callback: (event: ServiceChangeEvent) => void): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)!.push(callback);
    }
    
    off(eventType: string, callback: (event: ServiceChangeEvent) => void): void {
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event: ServiceChangeEvent): void {
        const callbacks = this.listeners.get(event.type);
        if (callbacks) {
            callbacks.forEach(callback => callback(event));
        }
    }
} 