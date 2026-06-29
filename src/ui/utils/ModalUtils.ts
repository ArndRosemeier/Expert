/**
 * Utility functions for creating common modal UI elements
 */

interface PanelConfig {
    width?: string;
    minWidth?: string;
    maxWidth?: string;
    background?: string;
    borderRight?: string;
    flexDirection?: string;
    position?: string;
    transition?: string;
    overflow?: string;
    height?: string;
    minHeight?: string;
}

/**
 * Creates a standardized left panel for modals with tree/list content
 */
export function createLeftPanel(config: Partial<PanelConfig> = {}): HTMLDivElement {
    const defaultConfig: PanelConfig = {
        width: '25%',
        minWidth: '18em',
        maxWidth: '22em',
        background: '#fff',
        borderRight: '1.5px solid #e5e7eb',
        flexDirection: 'column',
        position: 'relative',
        transition: 'width 0.3s',
        overflow: 'hidden',
        height: '100%',
        minHeight: '0'
    };

    return createPanelWithConfig(defaultConfig, config);
}


/**
 * Internal utility to create a panel with merged configuration
 */
function createPanelWithConfig(defaultConfig: PanelConfig, userConfig: Partial<PanelConfig>): HTMLDivElement {
    const panel = document.createElement('div');
    const finalConfig = { ...defaultConfig, ...userConfig };

    panel.style.width = finalConfig.width!;
    panel.style.minWidth = finalConfig.minWidth ?? '';
    panel.style.maxWidth = finalConfig.maxWidth ?? '';
    panel.style.background = finalConfig.background!;
    panel.style.borderRight = finalConfig.borderRight ?? '';
    panel.style.display = 'flex';
    panel.style.flexDirection = finalConfig.flexDirection!;
    panel.style.position = finalConfig.position!;
    panel.style.transition = finalConfig.transition ?? '';
    panel.style.overflow = finalConfig.overflow!;
    panel.style.height = finalConfig.height!;
    panel.style.minHeight = finalConfig.minHeight!;

    return panel;
}

 