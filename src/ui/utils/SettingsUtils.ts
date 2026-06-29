/**
 * Settings Utilities for eliminating duplication in SettingsService
 */

import { createServiceResponse, executeWithErrorHandling, ServiceResponse } from './ServiceUtils';

interface ProfileValidationResult {
    isValid: boolean;
    errors: string[];
}

interface ProfileOperationContext {
    settingsManager: any;
    operation: string;
    profileName?: string;
    targetName?: string;
    sourceProfile?: any;
}

interface SettingsChangeEvent {
    type: 'profile' | 'models' | 'criteria' | 'iterations' | 'aiLogging' | 'debugGeneration';
    data: unknown;
}

/**
 * Validate profile name with comprehensive checks
 */
function validateProfileName(name: string, context: 'create' | 'rename' | 'duplicate' = 'create'): ProfileValidationResult {
    const errors: string[] = [];
    
    if (!name?.trim()) {
        const actionMap = {
            create: 'enter a name for the new profile',
            rename: 'enter a new name for the profile', 
            duplicate: 'enter a name for the duplicated profile'
        };
        errors.push(`Please ${actionMap[context]}.`);
    }
    
    return { isValid: errors.length === 0, errors };
}

/**
 * Check if profile exists with appropriate error message
 */
function validateProfileExists(settingsManager: any, profileName: string, shouldExist: boolean = true): ProfileValidationResult {
    const exists = Boolean(settingsManager.getProfile(profileName));
    const errors: string[] = [];
    
    if (shouldExist && !exists) {
        errors.push(`Profile "${profileName}" not found.`);
    } else if (!shouldExist && exists) {
        errors.push(`A profile named "${profileName}" already exists.`);
    }
    
    return { isValid: errors.length === 0, errors };
}

/**
 * Comprehensive profile validation for operations
 */
function validateProfileOperation(
    context: ProfileOperationContext
): ProfileValidationResult {
    const errors: string[] = [];
    
    // Validate source profile exists (for rename/duplicate operations)
    if (context.profileName) {
        const sourceValidation = validateProfileExists(context.settingsManager, context.profileName, true);
        if (!sourceValidation.isValid) {
            errors.push(...sourceValidation.errors);
        }
    }
    
    // Validate target name and uniqueness (for create/rename/duplicate operations)
    if (context.targetName) {
        const operationType = context.operation as 'create' | 'rename' | 'duplicate';
        const nameValidation = validateProfileName(context.targetName!, operationType);
        if (!nameValidation.isValid) {
            errors.push(...nameValidation.errors);
        }
        
        const uniquenessValidation = validateProfileExists(context.settingsManager, context.targetName, false);
        if (!uniquenessValidation.isValid) {
            errors.push(...uniquenessValidation.errors);
        }
    }
    
    return { isValid: errors.length === 0, errors };
}

/**
 * Execute a profile operation with standardized validation and error handling
 */
async function executeProfileOperation<T = void>(
    context: ProfileOperationContext,
    operation: () => Promise<T>,
    successMessage?: string
): Promise<ServiceResponse> {
    // Pre-validate the operation
    const validation = validateProfileOperation(context);
    if (!validation.isValid) {
        return createServiceResponse(false, validation.errors[0] || 'Validation failed');
    }
    
    const result = await executeWithErrorHandling(
        operation,
        `Failed to ${context.operation} profile. Please try again.`
    );
    
    if (result.success && successMessage) {
        return createServiceResponse(true, successMessage);
    }
    
    return createServiceResponse(result.success, result.message);
}

/**
 * Standard success messages for profile operations
 */
export const ProfileMessages = {
    created: (name: string, source?: string) => 
        `Profile "${name}" created and activated${source ? ` (copied from "${source}")` : ''}.`,
    
    duplicated: (newName: string, sourceName: string) => 
        `Profile "${newName}" created from "${sourceName}".`,
    
    renamed: (oldName: string, newName: string) => 
        `Profile renamed from "${oldName}" to "${newName}".`,
    
    deleted: (name: string) => 
        `Profile "${name}" deleted.`,
    
    saved: (name: string) => 
        `Profile "${name}" saved successfully.`,
    
    applied: (name: string) => 
        `Profile "${name}" applied successfully.`
};

/**
 * Standard profile operation patterns
 */
export const ProfileOperations = {
    /**
     * Create profile operation pattern
     */
    create: async (
        settingsManager: any,
        name: string,
        profileData: any,
        emitChange?: (event: SettingsChangeEvent) => void
    ): Promise<ServiceResponse> => {
        const context: ProfileOperationContext = {
            settingsManager,
            operation: 'create',
            targetName: name
        };
        
        return executeProfileOperation(
            context,
            async () => {
                await settingsManager.saveProfile(name, profileData);
                await settingsManager.setLastUsedProfile(name);
                
                if (emitChange) {
                    emitChange({
                        type: 'profile',
                        data: { action: 'created', profileName: name }
                    });
                }
            },
            ProfileMessages.created(name)
        );
    },
    
    /**
     * Duplicate profile operation pattern
     */
    duplicate: async (
        settingsManager: any,
        sourceName: string,
        targetName: string,
        emitChange?: (event: SettingsChangeEvent) => void
    ): Promise<ServiceResponse> => {
        const context: ProfileOperationContext = {
            settingsManager,
            operation: 'duplicate',
            profileName: sourceName,
            targetName: targetName
        };
        
        return executeProfileOperation(
            context,
            async () => {
                const sourceProfile = settingsManager.getProfile(sourceName);
                await settingsManager.saveProfile(targetName, { ...sourceProfile });
                
                if (emitChange) {
                    emitChange({
                        type: 'profile',
                        data: { action: 'duplicated', sourceProfileName: sourceName, newProfileName: targetName }
                    });
                }
            },
            ProfileMessages.duplicated(targetName, sourceName)
        );
    },
    
    /**
     * Rename profile operation pattern
     */
    rename: async (
        settingsManager: any,
        oldName: string,
        newName: string,
        emitChange?: (event: SettingsChangeEvent) => void
    ): Promise<ServiceResponse> => {
        const context: ProfileOperationContext = {
            settingsManager,
            operation: 'rename',
            profileName: oldName,
            targetName: newName
        };
        
        return executeProfileOperation(
            context,
            async () => {
                const profile = settingsManager.getProfile(oldName);
                await settingsManager.saveProfile(newName, profile);
                settingsManager.deleteProfile(oldName);
                
                // Update last used if it was the renamed profile
                if (settingsManager.getLastUsedProfileName?.() === oldName) {
                    await settingsManager.setLastUsedProfile(newName);
                }
                
                if (emitChange) {
                    emitChange({
                        type: 'profile',
                        data: { action: 'renamed', oldName, newName }
                    });
                }
            },
            ProfileMessages.renamed(oldName, newName)
        );
    }
};

/**
 * Profile data validation utilities
 */
export const ProfileValidation = {
    /**
     * Validate profile structure
     */
    validateStructure: (profile: unknown): ProfileValidationResult => {
        const errors: string[] = [];

        if (!profile || typeof profile !== 'object') {
            errors.push('Profile data is missing or invalid');
            return { isValid: false, errors };
        }

        const p = profile as any;

        if (!p.selectedModels || typeof p.selectedModels !== 'object') {
            errors.push('Selected models must be an object');
        }

        if (!Array.isArray(p.criteria)) {
            errors.push('Criteria must be an array');
        }

        if (typeof p.maxIterations !== 'number' || p.maxIterations < 1) {
            errors.push('Max iterations must be a positive number');
        }

        return { isValid: errors.length === 0, errors };
    },
    
    /**
     * Validate profile name format
     */
    validateNameFormat: (name: string): ProfileValidationResult => {
        const errors: string[] = [];
        
        if (name.length > 50) {
            errors.push('Profile name must be 50 characters or less');
        }
        
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
            errors.push('Profile name can only contain letters, numbers, spaces, hyphens, and underscores');
        }
        
        return { isValid: errors.length === 0, errors };
    }
}; 