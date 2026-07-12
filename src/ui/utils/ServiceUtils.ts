/**
 * Service Utilities for reducing duplication in service response patterns
 */

export interface ServiceResponse {
    success: boolean;
    message: string;
}

export interface ServiceResponseWithData<T = unknown> extends ServiceResponse {
    data?: T;
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
function createServiceResponseWithData<T>(success: boolean, message: string, data?: T): ServiceResponseWithData<T> {
    const response: ServiceResponseWithData<T> = { success, message };
    if (data !== undefined) {
        response.data = data;
    }
    return response;
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





 