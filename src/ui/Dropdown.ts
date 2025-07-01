export interface DropdownOptions {
    /** Minimum width of the dropdown */
    minWidth?: string;
    /** Maximum width of the dropdown */
    maxWidth?: string;
    /** Offset from the trigger element (default: 5px) */
    offset?: number;
    /** Custom CSS classes to add to the dropdown */
    className?: string;
    /** Whether to close on inside clicks (default: true) */
    closeOnInsideClick?: boolean;
    /** Custom z-index (default: 1000) */
    zIndex?: number;
}

export interface DropdownPosition {
    /** Position relative to trigger: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' */
    position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

/**
 * A reusable dropdown component that can be attached to any trigger element
 */
export class Dropdown {
    private dropdown: HTMLElement | null = null;
    private isOpen: boolean = false;
    private outsideClickHandler: ((e: Event) => void) | null = null;

    constructor(
        private triggerElement: HTMLElement,
        private content: string | HTMLElement,
        private options: DropdownOptions & DropdownPosition = {}
    ) {
        this.setupDefaultOptions();
    }

    private setupDefaultOptions(): void {
        this.options = {
            minWidth: '200px',
            maxWidth: '400px',
            offset: 5,
            closeOnInsideClick: true,
            zIndex: 1000,
            position: 'bottom-left',
            ...this.options
        };
    }

    /**
     * Open the dropdown
     */
    public open(): void {
        if (this.isOpen) {
            this.close();
        }

        this.createDropdown();
        this.positionDropdown();
        this.attachEventListeners();
        this.isOpen = true;
    }

    /**
     * Close the dropdown
     */
    public close(): void {
        if (this.dropdown) {
            this.dropdown.remove();
            this.dropdown = null;
        }

        if (this.outsideClickHandler) {
            document.removeEventListener('click', this.outsideClickHandler);
            this.outsideClickHandler = null;
        }

        this.isOpen = false;
    }

    /**
     * Toggle dropdown open/closed
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Check if dropdown is currently open
     */
    public get opened(): boolean {
        return this.isOpen;
    }

    /**
     * Update the dropdown content
     */
    public updateContent(content: string | HTMLElement): void {
        this.content = content;
        if (this.dropdown) {
            if (typeof content === 'string') {
                this.dropdown.innerHTML = content;
            } else {
                this.dropdown.innerHTML = '';
                this.dropdown.appendChild(content);
            }
        }
    }

    private createDropdown(): void {
        this.dropdown = document.createElement('div');
        this.dropdown.className = `dropdown-menu ${this.options.className || ''}`;
        
        // Apply styles
        this.applyStyles();

        // Set content
        if (typeof this.content === 'string') {
            this.dropdown.innerHTML = this.content;
        } else {
            this.dropdown.appendChild(this.content);
        }

        // Add to body
        document.body.appendChild(this.dropdown);
    }

    private applyStyles(): void {
        if (!this.dropdown) return;

        // Base styles
        Object.assign(this.dropdown.style, {
            position: 'absolute',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            zIndex: this.options.zIndex!.toString(),
            minWidth: this.options.minWidth!,
            maxWidth: this.options.maxWidth!,
            padding: '0.5rem',
            display: 'block'
        });

        // Ensure the styles are also available as CSS class
        this.ensureGlobalStyles();
    }

    private ensureGlobalStyles(): void {
        if (document.querySelector('#dropdown-global-styles')) return;

        const style = document.createElement('style');
        style.id = 'dropdown-global-styles';
        style.textContent = `
            .dropdown-menu {
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 0.875rem;
                line-height: 1.5;
                color: #374151;
            }
            
            .dropdown-menu * {
                box-sizing: border-box;
            }
            
            /* Hide scrollbars but allow scrolling if needed */
            .dropdown-menu {
                scrollbar-width: thin;
                scrollbar-color: #cbd5e0 transparent;
            }
            
            .dropdown-menu::-webkit-scrollbar {
                width: 6px;
            }
            
            .dropdown-menu::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .dropdown-menu::-webkit-scrollbar-thumb {
                background-color: #cbd5e0;
                border-radius: 3px;
            }
        `;
        
        document.head.appendChild(style);
    }

    private positionDropdown(): void {
        if (!this.dropdown) return;

        const triggerRect = this.triggerElement.getBoundingClientRect();
        const dropdownRect = this.dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        let top: number;
        let left: number;

        switch (this.options.position) {
            case 'bottom-left':
                top = triggerRect.bottom + scrollY + this.options.offset!;
                left = triggerRect.left + scrollX;
                break;
            case 'bottom-right':
                top = triggerRect.bottom + scrollY + this.options.offset!;
                left = triggerRect.right + scrollX - dropdownRect.width;
                break;
            case 'top-left':
                top = triggerRect.top + scrollY - dropdownRect.height - this.options.offset!;
                left = triggerRect.left + scrollX;
                break;
            case 'top-right':
                top = triggerRect.top + scrollY - dropdownRect.height - this.options.offset!;
                left = triggerRect.right + scrollX - dropdownRect.width;
                break;
            default:
                top = triggerRect.bottom + scrollY + this.options.offset!;
                left = triggerRect.left + scrollX;
        }

        // Adjust if dropdown would go off-screen
        if (left + dropdownRect.width > viewportWidth + scrollX) {
            left = viewportWidth + scrollX - dropdownRect.width - 10;
        }
        if (left < scrollX) {
            left = scrollX + 10;
        }

        if (top + dropdownRect.height > viewportHeight + scrollY) {
            // Try to position above the trigger instead
            top = triggerRect.top + scrollY - dropdownRect.height - this.options.offset!;
        }
        if (top < scrollY) {
            top = scrollY + 10;
        }

        this.dropdown.style.top = `${top}px`;
        this.dropdown.style.left = `${left}px`;
    }

    private attachEventListeners(): void {
        if (!this.dropdown) return;

        // Handle clicks inside dropdown
        if (this.options.closeOnInsideClick) {
            this.dropdown.addEventListener('click', (e) => {
                // Allow event to bubble up, then close
                setTimeout(() => this.close(), 0);
            });
        }

        // Handle outside clicks
        this.outsideClickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            if (this.dropdown && 
                !this.dropdown.contains(target) && 
                target !== this.triggerElement && 
                !this.triggerElement.contains(target)) {
                this.close();
            }
        };

        // Add the outside click listener after a short delay to prevent immediate closure
        setTimeout(() => {
            if (this.outsideClickHandler) {
                document.addEventListener('click', this.outsideClickHandler);
            }
        }, 10);
    }

    /**
     * Destroy the dropdown and clean up all event listeners
     */
    public destroy(): void {
        this.close();
    }
}

/**
 * Utility function to create a dropdown quickly
 */
export function createDropdown(
    triggerElement: HTMLElement,
    content: string | HTMLElement,
    options?: DropdownOptions & DropdownPosition
): Dropdown {
    return new Dropdown(triggerElement, content, options);
} 