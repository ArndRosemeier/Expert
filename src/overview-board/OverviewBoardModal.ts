// Overview Board Modal - integrates analysis, rendering, and UI
import { BaseModal } from '../ui/modals/core/BaseModal';
import { createElement } from '../ui/modals/core/modal-utils';
import type { ModalConfig } from '../ui/modals/types/ModalTypes';
import type { DocumentNode } from '../DocumentNode';
import { OverviewAnalysisService } from './OverviewAnalysisService';
import { OverviewRenderer } from './rendering/OverviewRenderer';
import { DataConverter } from './utils/DataConverter';
import type { OverviewData } from './types/OverviewTypes';
import type { OverviewElement } from './types/GraphTypes';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

interface OverviewBoardModalConfig extends ModalConfig {
  selectedNode: DocumentNode;
  openRouterClient: OpenRouterClient;
  settingsManager: SettingsManager;
}

export class OverviewBoardModal extends BaseModal {
  private selectedNode: DocumentNode;
  private openRouterClient: OpenRouterClient;
  private settingsManager: SettingsManager;
  
  // Core services
  private analysisService: OverviewAnalysisService;
  private renderer?: OverviewRenderer;
  private dataConverter: DataConverter;
  
  // UI state
  private currentLayer: string | null = null;
  private isLoading: boolean = false;
  
  // UI elements
  private layerSelect?: HTMLSelectElement;
  private canvasContainer?: HTMLElement;
  private statusElement?: HTMLElement;
  private refreshButton?: HTMLButtonElement;
  private canvas?: HTMLCanvasElement;

  constructor(config: OverviewBoardModalConfig) {
    super({
      ...config,
      title: `Overview Board - ${config.selectedNode.title}`,
      id: 'overview-board-modal',
      width: '95vw',
      height: '90vh',
      closable: true
    });

    this.selectedNode = config.selectedNode;
    this.openRouterClient = config.openRouterClient;
    this.settingsManager = config.settingsManager;

    // Initialize services
    this.analysisService = new OverviewAnalysisService(
      this.openRouterClient,
      this.settingsManager
    );
    
    this.dataConverter = new DataConverter(DataConverter.createDefaultTheme());
  }

  /**
   * Render the modal content
   */
  public render(): HTMLElement {
    const container = createElement('div', {
      classes: ['overview-board-modal-container']
    });

    // Add styles
    this.addStyles(container);

    // Create sections
    const header = this.createHeader();
    const toolbar = this.createToolbar();
    const canvasSection = this.createCanvasSection();
    const footer = this.createFooter();

    container.appendChild(header);
    container.appendChild(toolbar);
    container.appendChild(canvasSection);
    container.appendChild(footer);

    // Initialize after DOM is ready
    setTimeout(() => {
      this.initializeRenderer();
      this.loadAvailableLayers();
    }, 0);

    return container;
  }

  /**
   * Create modal header
   */
  private createHeader(): HTMLElement {
    const header = createElement('div', {
      classes: ['modal-header']
    });

    const title = createElement('h2', {
      content: `Overview Board - ${this.selectedNode.title}`,
      classes: ['modal-title']
    });

    header.appendChild(title);

    return header;
  }

  /**
   * Create toolbar with layer selection and controls
   */
  private createToolbar(): HTMLElement {
    const toolbar = createElement('div', {
      classes: ['overview-toolbar']
    });

    // Layer selection
    const layerGroup = createElement('div', {
      classes: ['toolbar-group']
    });

    const layerLabel = createElement('label', {
      content: 'Layer:',
      classes: ['toolbar-label']
    });

    this.layerSelect = createElement('select', {
      classes: ['layer-select']
    }) as HTMLSelectElement;

    this.layerSelect.addEventListener('change', () => {
      this.handleLayerChange();
    });

    layerGroup.appendChild(layerLabel);
    layerGroup.appendChild(this.layerSelect);

    // Controls
    const controlsGroup = createElement('div', {
      classes: ['toolbar-group']
    });

    this.refreshButton = createElement('button', {
      content: '🔄 Refresh',
      classes: ['toolbar-button']
    }) as HTMLButtonElement;

    this.refreshButton.addEventListener('click', () => {
      this.handleRefresh();
    });

    const exportButton = createElement('button', {
      content: '📤 Export',
      classes: ['toolbar-button']
    });

    exportButton.addEventListener('click', () => {
      this.handleExport();
    });

    const clearCacheButton = createElement('button', {
      content: '🗑️ Clear Cache',
      classes: ['toolbar-button', 'clear-cache-button'],
      attributes: { title: 'Clear cached analysis for all layers' }
    });

    clearCacheButton.addEventListener('click', () => {
      this.handleClearCache();
    });

    controlsGroup.appendChild(this.refreshButton);
    controlsGroup.appendChild(exportButton);
    controlsGroup.appendChild(clearCacheButton);

    // Status
    this.statusElement = createElement('div', {
      classes: ['overview-status'],
      content: 'Loading...'
    });

    toolbar.appendChild(layerGroup);
    toolbar.appendChild(controlsGroup);
    toolbar.appendChild(this.statusElement);

    return toolbar;
  }

  /**
   * Create canvas section
   */
  private createCanvasSection(): HTMLElement {
    this.canvasContainer = createElement('div', {
      classes: ['canvas-container']
    });

    this.canvas = createElement('canvas', {
      classes: ['overview-canvas']
    }) as HTMLCanvasElement;

    // Set canvas size
    this.canvas.width = 1200;
    this.canvas.height = 800;

    this.canvasContainer.appendChild(this.canvas);

    return this.canvasContainer;
  }

  /**
   * Create footer with help and actions
   */
  private createFooter(): HTMLElement {
    const footer = createElement('div', {
      classes: ['modal-footer']
    });

    const helpText = createElement('div', {
      classes: ['help-text'],
      content: 'Drag to move elements • Mouse wheel to zoom • Click to select • Double-click for details'
    });

    const elementInfo = createElement('div', {
      classes: ['element-info'],
      content: 'No element selected'
    });

    footer.appendChild(helpText);
    footer.appendChild(elementInfo);

    return footer;
  }

  /**
   * Initialize the renderer
   */
  private initializeRenderer(): void {
    if (!this.canvas) return;

    try {
      this.renderer = new OverviewRenderer(this.canvas);
      
      // Set up element interaction callback
      this.renderer.onElementDoubleClick = (element: OverviewElement) => {
        this.handleElementDoubleClick(element);
      };

      this.updateStatus('Ready - select a layer above to begin analysis');
      this.updateButtonStates();
    } catch (error) {
      console.error('Failed to initialize renderer:', error);
      this.updateStatus('Failed to initialize renderer');
    }
  }

  /**
   * Load available layers from selected node
   */
  private loadAvailableLayers(): void {
    if (!this.layerSelect) return;

    try {
      const layers = this.analysisService.getAvailableLayers(this.selectedNode);
      
      // Clear existing options
      this.layerSelect.innerHTML = '';

      // Add placeholder option
      const placeholderOption = createElement('option', {
        content: 'Select a layer to analyze...',
        attributes: { 
          value: '',
          disabled: 'true',
          selected: 'true'
        }
      });
      this.layerSelect.appendChild(placeholderOption);

      if (layers.length === 0) {
        const option = createElement('option', {
          content: 'No analyzable layers found',
          attributes: { disabled: 'true' }
        });
        this.layerSelect.appendChild(option);
        this.updateStatus('No analyzable layers found in selected node');
        return;
      }

      // Add layer options
      layers.forEach(layer => {
        const option = createElement('option', {
          content: `${layer.name} (${layer.nodes.length} nodes)`,
          attributes: { value: layer.name }
        });
        this.layerSelect!.appendChild(option);
      });

      // Set initial state - no layer selected
      this.currentLayer = null;
      this.updateStatus(`Found ${layers.length} layer${layers.length === 1 ? '' : 's'} to analyze. Select one above to begin.`);
      this.updateButtonStates();

    } catch (error) {
      console.error('Failed to load layers:', error);
      this.updateStatus('Failed to load layers');
    }
  }

  /**
   * Handle layer selection change
   */
  private handleLayerChange(): void {
    if (!this.layerSelect) return;
    
    const selectedLayer = this.layerSelect.value;
    
    if (!selectedLayer) {
      // Placeholder option selected - clear any existing visualization
      this.currentLayer = null;
      if (this.renderer) {
        this.renderer.clear();
      }
      this.updateStatus('Select a layer to analyze.');
      this.updateButtonStates();
      return;
    }
    
    if (selectedLayer !== this.currentLayer) {
      this.currentLayer = selectedLayer;
      this.updateButtonStates();
      this.analyzeCurrentLayer();
    }
  }

  /**
   * Handle refresh button click
   */
  private handleRefresh(): void {
    if (!this.currentLayer) {
      this.updateStatus('Please select a layer first.');
      return;
    }
    this.analyzeCurrentLayer();
  }

  /**
   * Handle export button click
   */
  private handleExport(): void {
    if (!this.currentLayer) {
      this.updateStatus('Please analyze a layer first before exporting.');
      return;
    }
    
    if (!this.canvas) return;

    try {
      // Export canvas as PNG
      const dataURL = this.canvas.toDataURL('image/png');
      const link = createElement('a', {
        attributes: {
          href: dataURL,
          download: `overview-board-${this.selectedNode.title}-${this.currentLayer}.png`
        }
      });

      document.body.appendChild(link);
      (link as HTMLAnchorElement).click();
      document.body.removeChild(link);

      this.updateStatus('Image exported');
    } catch (error) {
      console.error('Failed to export:', error);
      this.updateStatus('Failed to export image');
    }
  }

  /**
   * Handle cache clearing
   */
  private async handleClearCache(): Promise<void> {
    try {
      const cacheInfo = this.analysisService.getCacheInfo(this.selectedNode);
      
      if (cacheInfo.length === 0) {
        alert('No cached analysis found for this node');
        return;
      }

      const confirmMessage = `Clear ${cacheInfo.length} cached analysis result(s)?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      this.setLoading(true);
      this.updateStatus('Clearing cache...');
      
      await this.analysisService.clearCache(this.selectedNode);
      
      // Clear current visualization if any
      if (this.renderer) {
        this.renderer.clear();
      }
      
      // Reset current layer and update UI
      this.currentLayer = null;
      this.updateButtonStates();
      this.updateStatus('Cache cleared successfully');
      
    } catch (error) {
      console.error('Failed to clear cache:', error);
      this.updateStatus('Failed to clear cache');
      alert('Failed to clear cache. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Analyze the current layer
   */
  private async analyzeCurrentLayer(): Promise<void> {
    if (!this.currentLayer || this.isLoading) return;
    
    this.setLoading(true);

    try {
      this.updateStatus('Analyzing layer...');
      
      const result = await this.analysisService.analyzeLayer({
        layerName: this.currentLayer,
        nodes: this.analysisService.getAvailableLayers(this.selectedNode)
          .find(layer => layer.name === this.currentLayer)?.nodes || []
      }, this.selectedNode);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Analysis failed');
      }

      this.displayOverviewBoard(result.data);
      
      const cacheIndicator = result.fromCache ? ' (cached)' : '';
      this.updateStatus(`Analysis complete: ${result.data.events.size} events, ${result.data.characters.size} characters, ${result.data.places.size} places${cacheIndicator}`);

    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('Analysis failed:', error);
      
      // Show detailed error message to user - don't mask it
      if (errorMessage.includes('CACHE CORRUPTION') || errorMessage.includes('SERIALIZATION ERROR')) {
        // Critical corruption errors - show full details and suggest cache clear
        this.updateStatus(`CRITICAL ERROR: ${errorMessage}`);
        setTimeout(() => {
          alert(`CRITICAL ERROR DETECTED:\n\n${errorMessage}\n\nRecommendation: Clear cache and try again.`);
        }, 100);
      } else {
        // Regular analysis errors
        this.updateStatus(`Analysis failed: ${errorMessage}`);
      }
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Display the overview board visualization - PROPAGATE errors instead of masking them
   */
  private displayOverviewBoard(data: OverviewData): void {
    if (!this.renderer) {
      throw new Error('❌ CRITICAL: No renderer available for Overview Board visualization');
    }
    
    if (!this.canvas) {
      throw new Error('❌ CRITICAL: No canvas available for Overview Board visualization');
    }

    // Clear existing visualization
    this.renderer.clear();

    // Get exact cloud coordinates from renderer to ensure perfect alignment
    const cloudCenters = this.renderer.getCloudCenters();
    const cloudRadius = this.renderer.getCloudRadius();

    // Convert data to visual elements using renderer's exact coordinates
    const { elements, connections } = this.dataConverter.convertToVisualElementsWithCoords(
      data, 
      cloudCenters,
      cloudRadius
    );

    // Add to renderer
    this.renderer.addElements(elements);
    this.renderer.addConnections(connections);
  }

  /**
   * Handle element double-click
   */
  private handleElementDoubleClick(element: OverviewElement): void {
    const details = element.getDescription();
    alert(`${element.getDisplayName()}\n\n${details}`); // TODO: Replace with proper details modal
  }

  /**
   * Update status text
   */
  private updateStatus(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
  }

  /**
   * Update button states based on current layer and data
   */
  private updateButtonStates(): void {
    const hasLayer = !!this.currentLayer;
    
    if (this.refreshButton) {
      this.refreshButton.style.opacity = hasLayer ? '1' : '0.5';
      this.refreshButton.title = hasLayer ? 'Refresh analysis' : 'Select a layer first';
    }
  }

  /**
   * Set loading state
   */
  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    
    if (this.refreshButton) {
      this.refreshButton.disabled = loading;
      this.refreshButton.textContent = loading ? '⏳ Loading...' : '🔄 Refresh';
    }

    if (this.layerSelect) {
      this.layerSelect.disabled = loading;
    }
  }

  /**
   * Clean up resources
   */
  public override destroy(): void {
    if (this.renderer) {
      this.renderer.destroy();
    }
    super.destroy();
  }

  /**
   * Add CSS styles
   */
  private addStyles(container: HTMLElement): void {
    const style = createElement('style', {
      content: `
        .overview-board-modal-container {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .modal-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .overview-toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .toolbar-label {
          font-weight: 500;
          color: #374151;
          font-size: 0.875rem;
        }

        .layer-select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
          background: white;
          min-width: 200px;
        }

        .toolbar-button {
          padding: 0.5rem 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
          font-weight: 500;
        }

        .toolbar-button:hover {
          background: #2563eb;
        }

        .toolbar-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .overview-status {
          margin-left: auto;
          font-size: 0.875rem;
          color: #6b7280;
          font-style: italic;
        }

        .canvas-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #f3f4f6;
          overflow: hidden;
        }

        .overview-canvas {
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .modal-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
          font-size: 0.875rem;
        }

        .help-text {
          color: #6b7280;
        }

        .element-info {
          color: #374151;
          font-weight: 500;
        }
      `
    });

    container.appendChild(style);
  }
} 