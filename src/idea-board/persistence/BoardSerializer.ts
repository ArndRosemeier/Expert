import type { IdeaBoardState, ElementData } from '../types/BoardTypes';
import type { IStorageService } from '../../StorageService';

export class BoardSerializer {
  private static readonly STORAGE_KEY_PREFIX = 'idea_board_';
  private static readonly BOARD_LIST_KEY = 'idea_board_list';
  private static readonly VERSION = '1.0.0';
  private static storageService: IStorageService | null = null;

  /**
   * Get the storage service instance
   */
  private static async getStorageService(): Promise<IStorageService> {
    if (!this.storageService) {
      const { StorageService } = await import('../../StorageService');
      this.storageService = await StorageService.getInstance();
    }
    return this.storageService;
  }

  /**
   * Save board state to IndexedDB
   */
  static async save(boardState: IdeaBoardState): Promise<void> {
    try {
      const storage = await this.getStorageService();
      
      const serializedState = {
        ...boardState,
        metadata: {
          ...boardState.metadata,
          version: this.VERSION
        }
      };
      
      await storage.set(this.STORAGE_KEY_PREFIX + boardState.id, serializedState);
      
      // Also save to list of board IDs
      await this.saveBoardIdToList(boardState.id);
      
      console.log(`💾 Idea board saved: ${boardState.name} (${boardState.id})`);
    } catch (error) {
      console.error('Failed to save idea board:', error);
      throw new Error('Failed to save idea board to storage');
    }
  }

  /**
   * Load board state from IndexedDB
   */
  static async load(boardId: string): Promise<IdeaBoardState | null> {
    try {
      const storage = await this.getStorageService();
      const boardState = await storage.get<IdeaBoardState>(this.STORAGE_KEY_PREFIX + boardId);
      
      if (!boardState) {
        return null;
      }
      
      // Version migration would go here if needed
      if (boardState.metadata.version !== this.VERSION) {
        console.warn(`Board version mismatch: ${boardState.metadata.version} vs ${this.VERSION}`);
      }
      
      console.log(`📂 Idea board loaded: ${boardState.name} (${boardId})`);
      return boardState;
    } catch (error) {
      console.error('Failed to load idea board:', error);
      return null;
    }
  }

  /**
   * Delete board from IndexedDB
   */
  static async delete(boardId: string): Promise<boolean> {
    try {
      const storage = await this.getStorageService();
      await storage.delete(this.STORAGE_KEY_PREFIX + boardId);
      await this.removeBoardIdFromList(boardId);
      console.log(`🗑️ Idea board deleted: ${boardId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete idea board:', error);
      return false;
    }
  }

  /**
   * List all saved board IDs
   */
  static async listBoardIds(): Promise<string[]> {
    try {
      const storage = await this.getStorageService();
      const boardIds = await storage.get<string[]>(this.BOARD_LIST_KEY);
      return boardIds || [];
    } catch (error) {
      console.error('Failed to load board list:', error);
      return [];
    }
  }

  /**
   * Get board metadata without loading full board
   */
  static async getBoardMetadata(boardId: string): Promise<{ id: string; name: string; lastModified: Date } | null> {
    try {
      const storage = await this.getStorageService();
      const boardState = await storage.get<IdeaBoardState>(this.STORAGE_KEY_PREFIX + boardId);
      
      if (!boardState) {
        return null;
      }
      
      return {
        id: boardState.id,
        name: boardState.name,
        lastModified: boardState.lastModified
      };
    } catch (error) {
      console.error('Failed to load board metadata:', error);
      return null;
    }
  }

  /**
   * Generate a deterministic board ID based on project ID and name
   */
  static generateBoardId(name: string, projectId?: string): string {
    const baseString = name; // Use only the name for global boards
    // Create a simple hash-like string from the base string
    let hash = 0;
    for (let i = 0; i < baseString.length; i++) {
      const char = baseString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `board_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Find or create a board by name and project ID
   */
  static async findOrCreateBoard(name: string, projectId?: string): Promise<IdeaBoardState> {
    const boardId = this.generateBoardId(name);
    
    // Try to load existing board
    const existingBoard = await this.load(boardId);
    if (existingBoard) {
      console.log(`📂 Found existing board: ${name} (${boardId})`);
      return existingBoard;
    }
    
    // Create new board with deterministic ID
    console.log(`🆕 Creating new board: ${name} (${boardId})`);
    const newBoard = this.createNewBoardState(name);
    newBoard.id = boardId; // Override the random ID with our deterministic one
    
    // Save the new board immediately
    await this.save(newBoard);
    
    return newBoard;
  }

  /**
   * Create a new empty board state
   */
  static createNewBoardState(name: string, projectId?: string): IdeaBoardState {
    const boardId = `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const boardState: IdeaBoardState = {
      id: boardId,
      name: name,
      created: new Date(),
      lastModified: new Date(),
      viewport: {
        x: 0,
        y: 0,
        zoom: 1.0
      },
      elements: [],
      connections: [],
      metadata: {
        version: this.VERSION,
        totalElements: 0
      }
    };
    
    if (projectId !== undefined) {
      boardState.projectId = projectId;
    }
    
    return boardState;
  }

  /**
   * Auto-save board state
   */
  static async autoSave(boardState: IdeaBoardState): Promise<void> {
    boardState.lastModified = new Date();
    await this.save(boardState);
  }

  /**
   * Export board to JSON file
   */
  static exportToJson(boardState: IdeaBoardState): string {
    return JSON.stringify(boardState, null, 2);
  }

  /**
   * Import board from JSON
   */
  static importFromJson(jsonString: string): IdeaBoardState {
    try {
      const boardState = JSON.parse(jsonString) as IdeaBoardState;
      
      // Generate new ID to avoid conflicts
      boardState.id = `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      boardState.lastModified = new Date();
      
      return boardState;
    } catch (error) {
      console.error('Failed to import board from JSON:', error);
      throw new Error('Invalid board JSON format');
    }
  }

  /**
   * Helper to save board ID to the list
   */
  private static async saveBoardIdToList(boardId: string): Promise<void> {
    const storage = await this.getStorageService();
    const existingIds = await this.listBoardIds();
    if (!existingIds.includes(boardId)) {
      existingIds.push(boardId);
      await storage.set(this.BOARD_LIST_KEY, existingIds);
    }
  }

  /**
   * Helper to remove board ID from the list
   */
  private static async removeBoardIdFromList(boardId: string): Promise<void> {
    const storage = await this.getStorageService();
    const existingIds = await this.listBoardIds();
    const filteredIds = existingIds.filter(id => id !== boardId);
    await storage.set(this.BOARD_LIST_KEY, filteredIds);
  }
} 