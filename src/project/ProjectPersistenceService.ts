import { DocumentNode } from '../DocumentNode';
import { ProjectTemplate } from '../ProjectTemplate';

import { StorageService, IStorageService } from '../StorageService';
import { IndexedDBService } from '../IndexedDBService';
import { ProjectDependencies, LoadResult, ProjectRecord } from './types/ProjectTypes';
import * as state from '../state';
import { STORAGE_KEYS } from '../constants';
import { AssertFlatTemplateCopy } from '../ProjectUtils';

/**
 * ProjectPersistenceService handles all project serialization, storage, and loading operations.
 * Manages the conversion between in-memory project data and persistent storage formats.
 */
export class ProjectPersistenceService {

    private static readonly ACTIVE_PROJECT_STORAGE_KEY = STORAGE_KEYS.ACTIVE_PROJECT;
    private static storageService: Promise<IStorageService> | null = null;

    /**
     * Gets the storage service instance
     */
    private static async getStorageService(): Promise<IStorageService> {
        if (!ProjectPersistenceService.storageService) {
            ProjectPersistenceService.storageService = StorageService.getInstance();
        }
        return ProjectPersistenceService.storageService;
    }

    /**
     * Gets the IndexedDB service if using IndexedDB, null otherwise
     */
    private static async getIndexedDBService(): Promise<IndexedDBService | null> {
        const storage = await ProjectPersistenceService.getStorageService();
        if (storage.isIndexedDB()) {
            // Access the IndexedDB service from the storage instance
            const service = await StorageService.getInstance();
            if (service.isIndexedDB()) {
                // Return the IndexedDB service for direct project operations
                return (service as any).indexedDBService;
            }
        }
        return null;
    }

    /**
     * Serializes a project to a JSON string.
     * @param project The project to serialize.
     * @returns A JSON string representing the project.
     */
    public static save(project: any): string {
        // A custom replacer can be used if we need to handle complex objects,
        // but for now, the default serialization should be sufficient.
        return JSON.stringify(project, null, 2);
    }

    /**
     * Saves a project's current state to storage.
     * @param project The project to save.
     */
    public static async saveToStorage(_project: any): Promise<void> {
        try {
            await ProjectPersistenceService.saveAllProjectsToStorage();
        } catch (error) {
            console.error("Failed to save project to storage:", error);
            throw new Error(`Failed to save project to storage. Some changes may not be persisted.`);
        }
    }

    /**
     * Clears all projects from storage.
     */
    public static async clearAllProjectsFromStorage(): Promise<void> {
        try {
            const storage = await ProjectPersistenceService.getStorageService();
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                // Clear all projects from IndexedDB
                await indexedDB.clear('projects');
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            // Clear active project references
            await storage.delete(ProjectPersistenceService.ACTIVE_PROJECT_STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear projects from storage:', error);
            throw error;
        }
    }

    /**
     * Saves all projects and active project ID to storage.
     */
    private static async saveAllProjectsToStorage(): Promise<void> {
        const projects = state.getProjects();
        const activeProject = state.getActiveProject();
        
        try {
            const storage = await ProjectPersistenceService.getStorageService();
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                // Use IndexedDB for efficient project storage
                for (const project of projects) {
                    const projectRecord: ProjectRecord = {
                        id: project.rootNode.id,
                        title: project.projectTitle,
                        templateName: project.template.name,
                        createdAt: new Date(), // Could store actual creation date
                        lastModified: new Date(),
                        data: ProjectPersistenceService.save(project)
                    };
                    await indexedDB.set('projects', project.rootNode.id, projectRecord);
                }
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            // Save active project ID
            if (activeProject) {
                await storage.set(ProjectPersistenceService.ACTIVE_PROJECT_STORAGE_KEY, activeProject.rootNode.id);
            }
        } catch (error) {
            console.error('Failed to save projects to storage:', error);
            throw error;
        }
    }

    /**
     * Loads all projects from IndexedDB storage.
     * @param dependencies The dependencies needed to reconstruct projects.
     * @returns Promise containing projects and active project ID.
     */
    public static async loadAllProjectsFromStorage(_dependencies: ProjectDependencies): Promise<LoadResult> {
        
        try {
            const storage = await ProjectPersistenceService.getStorageService();
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                // Load from IndexedDB
                const projectRecords = await indexedDB.getAll<ProjectRecord>('projects');
                const activeProjectId = await storage.get<string>(ProjectPersistenceService.ACTIVE_PROJECT_STORAGE_KEY);
            
                if (projectRecords && Object.keys(projectRecords).length > 0) {
                    // Return the raw data - the caller will need to create ProjectManager instances
                    return { 
                        projects: Object.values(projectRecords),
                        activeProjectId: activeProjectId || null 
                    };
                }
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            return { projects: [], activeProjectId: null };
        } catch (error) {
            console.error("Failed to load projects from storage:", error);
            return { projects: [], activeProjectId: null };
        }
    }

    /**
     * Parses a JSON string and returns the plain object representation.
     * The caller (ProjectManager) will handle creating the actual instance.
     * @param json The JSON string representing a saved project.
     * @returns Plain object representation of the project.
     */
    public static parseProjectData(json: string): any {
        const plainObject = JSON.parse(json);
        
        // Re-create the template instance
        const template = new ProjectTemplate(
            plainObject.template.name,
            plainObject.template.hierarchyLevels,
            plainObject.template.scaffoldingDocuments
        );
        
        return {
            projectTitle: plainObject.projectTitle,
            template: template,
            rootNode: ProjectPersistenceService.rehydrateNode(plainObject.rootNode)
        };
    }

    /**
     * Creates a ProjectManager instance from parsed data.
     * This method will be called by ProjectManager to avoid circular dependency.
     * @param parsedData The parsed project data.
     * @param dependencies The dependencies needed to reconstruct the project.
     * @param ProjectManagerClass The ProjectManager class constructor.
     * @returns A new instance of ProjectManager.
     */
    public static createProjectFromData(parsedData: any, dependencies: ProjectDependencies, ProjectManagerClass: any): any {
        const { loopOrchestrator, settingsManager, openRouterClient } = dependencies;
        
        // Create the project manager instance
        const project = new ProjectManagerClass(
            parsedData.projectTitle, 
            parsedData.template, 
            loopOrchestrator, 
            settingsManager, 
            openRouterClient
        );
        
        // The rootNode is created in the constructor, but we need to overwrite it
        // with the hydrated version of our saved node tree.
        project.rootNode = parsedData.rootNode;
        
        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(project);
        
        return project;
    }

    /**
     * Recursively reconstructs DocumentNode instances from plain objects.
     * @param plainNode The plain object representation of a node.
     * @returns A DocumentNode instance.
     */
    public static rehydrateNode(plainNode: any): DocumentNode {
        // Create a new node instance to get access to class methods
        const node = new DocumentNode(plainNode.level, plainNode.title, plainNode.parentId, plainNode.template);
        
        // We assign to _content directly to avoid clearing the summary on load,
        // as we assume the saved state is consistent.
        node['_content'] = plainNode.content || '';

        // Overwrite the other plain properties from the saved data
        Object.assign(node, {
            id: plainNode.id,
            context: plainNode.context || plainNode.summary || '', // Handle legacy summary field
            generationPrompt: plainNode.generationPrompt || null,
            generationHistory: plainNode.generationHistory || [],
            generationSessions: plainNode.generationSessions || [],

            creatorModel: plainNode.creatorModel || null, // Handle creator model field
            children: [], // Reset children, as they will be rehydrated recursively
        });

        // Recursively rehydrate and add children
        if (plainNode.children && plainNode.children.length > 0) {
            node.children = plainNode.children.map((child: any) => ProjectPersistenceService.rehydrateNode(child));
        }

        return node;
    }

    /**
     * Creates a backup of the current storage state.
     * @returns Promise containing the backup data.
     */
    public static async createBackup(): Promise<{ projects: ProjectRecord[], activeProjectId: string | null }> {
        try {
            const storage = await ProjectPersistenceService.getStorageService();
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                const projectRecords = await indexedDB.getAll<ProjectRecord>('projects');
                const activeProjectId = await storage.get<string>(ProjectPersistenceService.ACTIVE_PROJECT_STORAGE_KEY);
                
                return {
                    projects: Object.values(projectRecords || {}),
                    activeProjectId: activeProjectId || null
                };
            }
            
            return { projects: [], activeProjectId: null };
        } catch (error) {
            console.error('Failed to create backup:', error);
            throw error;
        }
    }

    /**
     * Restores projects from a backup.
     * @param backup The backup data to restore.
     * @param dependencies The dependencies needed to reconstruct projects.
     */
    public static async restoreFromBackup(
        backup: { projects: ProjectRecord[], activeProjectId: string | null },
        _dependencies: ProjectDependencies
    ): Promise<void> {
        try {
            // Clear existing data
            await ProjectPersistenceService.clearAllProjectsFromStorage();
            
            const storage = await ProjectPersistenceService.getStorageService();
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                // Restore projects
                for (const projectRecord of backup.projects) {
                    await indexedDB.set('projects', projectRecord.id, projectRecord);
                }
                
                // Restore active project
                if (backup.activeProjectId) {
                    await storage.set(ProjectPersistenceService.ACTIVE_PROJECT_STORAGE_KEY, backup.activeProjectId);
                }
            }
        } catch (error) {
            console.error('Failed to restore from backup:', error);
            throw error;
        }
    }

    /**
     * Gets storage statistics.
     * @returns Promise containing storage usage information.
     */
    public static async getStorageStats(): Promise<{
        projectCount: number;
        totalSize: number;
        lastModified: Date | null;
    }> {
        try {
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                const projectRecords = await indexedDB.getAll<ProjectRecord>('projects');
                const projects = Object.values(projectRecords || {});
                
                const totalSize = projects.reduce((size, project) => size + project.data.length, 0);
                const lastModified = projects.length > 0 
                    ? new Date(Math.max(...projects.map(p => p.lastModified.getTime())))
                    : null;
                
                return {
                    projectCount: projects.length,
                    totalSize,
                    lastModified
                };
            }
            
            return { projectCount: 0, totalSize: 0, lastModified: null };
        } catch (error) {
            console.error('Failed to get storage stats:', error);
            return { projectCount: 0, totalSize: 0, lastModified: null };
        }
    }

    /**
     * Exports a project to a downloadable JSON file.
     * @param projectId The ID of the project to export.
     * @returns The project data as a JSON string.
     */
    public static async exportProject(projectId: string): Promise<string> {
        try {
            const indexedDB = await ProjectPersistenceService.getIndexedDBService();
            
            if (indexedDB) {
                const projectRecord = await indexedDB.get<ProjectRecord>('projects', projectId);
                if (projectRecord) {
                    return projectRecord.data;
                }
            }
            
            throw new Error(`Project with ID ${projectId} not found`);
        } catch (error) {
            console.error('Failed to export project:', error);
            throw error;
        }
    }

    /**
     * Imports a project from JSON data.
     * @param projectData The JSON string containing project data.
     * @param dependencies The dependencies needed to reconstruct the project.
     * @param ProjectManagerClass The ProjectManager class constructor.
     * @returns The imported project instance.
     */
    public static async importProject(projectData: string, dependencies: ProjectDependencies, ProjectManagerClass: any): Promise<any> {
        try {
            const parsedData = ProjectPersistenceService.parseProjectData(projectData);
            const project = ProjectPersistenceService.createProjectFromData(parsedData, dependencies, ProjectManagerClass);
            
            // Generate a new ID to avoid conflicts
            const originalId = project.rootNode.id;
            project.rootNode.id = `imported_${Date.now()}_${originalId}`;
            
            // Ensure all nodes share the same template reference
            AssertFlatTemplateCopy(project);
            
            // Save to storage
            await ProjectPersistenceService.saveToStorage(project);
            
            return project;
        } catch (error) {
            console.error('Failed to import project:', error);
            throw error;
        }
    }
} 