/**
 * DOM Utilities for reducing createElement duplication across modals
 */

interface CreateElementOptions {
    classes?: string[] | undefined;
    content?: string | undefined;
    id?: string | undefined;
    attributes?: Record<string, string> | undefined;
}

interface ButtonOptions extends CreateElementOptions {
    type?: 'primary' | 'secondary' | 'danger' | 'success';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
}

interface ListOptions {
    items: string[];
    classes?: string[];
    itemClasses?: string[];
}

/**
 * Enhanced createElement with consistent options
 */
function createElement(tag: string, options: CreateElementOptions = {}): HTMLElement {
    const element = document.createElement(tag);
    
    if (options.classes) {
        element.classList.add(...options.classes);
    }
    
    if (options.content) {
        element.textContent = options.content;
    }
    
    if (options.id) {
        element.id = options.id;
    }
    
    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
    
    return element;
}

/**
 * Create a standardized button with common patterns
 */
export function createButton(content: string, options: ButtonOptions = {}): HTMLButtonElement {
    const elementOptions: CreateElementOptions = {
        content: options.loading ? 'Loading...' : content,
        classes: ['btn', ...(options.classes || [])]
    };
    
    if (options.id) elementOptions.id = options.id;
    if (options.attributes) elementOptions.attributes = options.attributes;
    
    const button = createElement('button', elementOptions) as HTMLButtonElement;
    
    // Add type-specific classes
    if (options.type) {
        button.classList.add(options.type);
    }
    
    if (options.disabled || options.loading) {
        button.disabled = true;
    }
    
    if (options.onClick) {
        button.addEventListener('click', options.onClick);
    }
    
    return button;
}

/**
 * Create a list with items
 */
export function createList(options: ListOptions): HTMLUListElement {
    const list = createElement('ul', {
        classes: options.classes
    }) as HTMLUListElement;
    
    options.items.forEach(item => {
        const listItem = createElement('li', {
            content: item,
            classes: options.itemClasses
        });
        list.appendChild(listItem);
    });
    
    return list;
}


/**
 * Create a button container with multiple buttons
 */
export function createButtonContainer(buttons: HTMLButtonElement[]): HTMLElement {
    const container = createElement('div', {
        classes: ['button-container']
    });
    
    buttons.forEach(button => container.appendChild(button));
    
    return container;
}

/**
 * Create a warning/note section
 */
export function createWarning(message: string, type: 'warning' | 'info' | 'success' | 'error' = 'warning'): HTMLElement {
    const iconMap = {
        warning: '⚠️',
        info: 'ℹ️',
        success: '✅',
        error: '❌'
    };
    
    return createElement('p', {
        content: `${iconMap[type]} ${message}`,
        classes: [`${type}-text`, 'note']
    });
}

/**
 * Manage button loading states
 */
export class ButtonStateManager {
    private originalContent: Map<HTMLButtonElement, string> = new Map();
    
    setLoading(button: HTMLButtonElement, loadingText: string = 'Loading...'): void {
        if (!this.originalContent.has(button)) {
            this.originalContent.set(button, button.textContent || '');
        }
        
        button.disabled = true;
        button.textContent = loadingText;
    }
    
    clearLoading(button: HTMLButtonElement): void {
        const originalContent = this.originalContent.get(button);
        if (originalContent) {
            button.textContent = originalContent;
            this.originalContent.delete(button);
        }
        button.disabled = false;
    }
    
    clearAll(): void {
        this.originalContent.forEach((content, button) => {
            button.textContent = content;
            button.disabled = false;
        });
        this.originalContent.clear();
    }
} 