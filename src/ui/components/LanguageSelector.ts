/**
 * Language selector component with flag emojis and custom text option
 */
interface LanguageSelectorOptions {
    currentLanguage: string;
    onLanguageChange: (language: string) => void;
    label?: string;
    description?: string;
}

interface LanguageOption {
    code: string;
    name: string;
    flag: string;
}

export class LanguageSelector {
    private container: HTMLElement;
    private options: LanguageSelectorOptions;
    private dropdown!: HTMLSelectElement;
    private customInput!: HTMLInputElement;
    private customContainer!: HTMLElement;

    // Common languages with Unicode flag emojis
    private static readonly LANGUAGES: LanguageOption[] = [
        { code: 'English', name: 'English', flag: '🇬🇧' },
        { code: 'Spanish', name: 'Spanish', flag: '🇪🇸' },
        { code: 'French', name: 'French', flag: '🇫🇷' },
        { code: 'German', name: 'German', flag: '🇩🇪' },
        { code: 'Italian', name: 'Italian', flag: '🇮🇹' },
        { code: 'Portuguese', name: 'Portuguese', flag: '🇵🇹' },
        { code: 'Russian', name: 'Russian', flag: '🇷🇺' },
        { code: 'Chinese', name: 'Chinese', flag: '🇨🇳' },
        { code: 'Japanese', name: 'Japanese', flag: '🇯🇵' },
        { code: 'Korean', name: 'Korean', flag: '🇰🇷' },
        { code: 'Arabic', name: 'Arabic', flag: '🇸🇦' },
        { code: 'Dutch', name: 'Dutch', flag: '🇳🇱' },
        { code: 'Polish', name: 'Polish', flag: '🇵🇱' },
        { code: 'Swedish', name: 'Swedish', flag: '🇸🇪' },
        { code: 'Norwegian', name: 'Norwegian', flag: '🇳🇴' },
        { code: 'Danish', name: 'Danish', flag: '🇩🇰' },
        { code: 'Finnish', name: 'Finnish', flag: '🇫🇮' },
        { code: 'Greek', name: 'Greek', flag: '🇬🇷' },
        { code: 'Turkish', name: 'Turkish', flag: '🇹🇷' },
        { code: 'Hindi', name: 'Hindi', flag: '🇮🇳' }
    ];

    constructor(container: HTMLElement, options: LanguageSelectorOptions) {
        this.container = container;
        this.options = options;
        this.createHTML();
        this.attachEventListeners();
        this.updateSelection();
    }

    private createHTML(): void {
        const languageOptions = LanguageSelector.LANGUAGES.map(lang => 
            `<option value="${lang.code}">${lang.flag} ${lang.name}</option>`
        ).join('');

        this.container.innerHTML = `
            <div class="language-selector">
                <select class="language-selector-dropdown">
                    ${languageOptions}
                    <option value="custom">Other (Custom)</option>
                </select>
                
                <div class="language-selector-custom" style="display: none;">
                    <input type="text" 
                           class="language-selector-custom-input" 
                           placeholder="Enter language name..."
                           maxlength="50">
                    <div class="language-selector-custom-hint">
                        Enter the language name as you want it to appear in prompts (e.g., "Mandarin", "Brazilian Portuguese", "British English")
                    </div>
                </div>
            </div>
        `;

        this.dropdown = this.container.querySelector('.language-selector-dropdown') as HTMLSelectElement;
        this.customContainer = this.container.querySelector('.language-selector-custom') as HTMLElement;
        this.customInput = this.container.querySelector('.language-selector-custom-input') as HTMLInputElement;
        
        this.addStyles();
    }

    private addStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            @font-face {
                font-family: 'Twemoji Country Flags';
                unicode-range: U+1F1E6-1F1FF;
                src: url('https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1.8/dist/TwemojiCountryFlags.woff2') format('woff2');
                font-display: swap;
            }
            
            .language-selector {
                margin-bottom: 1rem;
            }
            
            .language-selector-label {
                display: block;
                font-weight: 600;
                margin-bottom: 0.5rem;
                color: var(--text-color, #333);
            }
            
            .language-selector-description {
                font-size: 0.9rem;
                color: var(--text-secondary, #666);
                margin-bottom: 0.75rem;
                line-height: 1.4;
            }
            
            .language-selector-dropdown {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */
                border-radius: 4px;
                background: var(--background-color, white);
                color: var(--text-color, #333);
                font-size: 1rem;
                line-height: 1.5;
                cursor: pointer;
                font-family: 'Twemoji Country Flags', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .language-selector-dropdown:focus {
                outline: none;
                border-color: var(--primary-500); /* Updated from legacy --primary-color */
                box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(0, 123, 255, 0.25));
            }
            
            .language-selector-custom {
                margin-top: 0.75rem;
                padding: 0.75rem;
                background: var(--background-secondary, #f8f9fa);
                border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */
                border-radius: 4px;
            }
            
            .language-selector-custom-input {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */
                border-radius: 4px;
                background: var(--background-color, white);
                color: var(--text-color, #333);
                font-size: 1rem;
                margin-bottom: 0.5rem;
            }
            
            .language-selector-custom-input:focus {
                outline: none;
                border-color: var(--primary-500); /* Updated from legacy --primary-color */
                box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(0, 123, 255, 0.25));
            }
            
            .language-selector-custom-hint {
                font-size: 0.8rem;
                color: var(--text-secondary, #666);
                line-height: 1.4;
            }
        `;
        
        // Only add the style if it doesn't already exist
        if (!document.querySelector('style[data-language-selector]')) {
            style.setAttribute('data-language-selector', 'true');
            document.head.appendChild(style);
        }
    }

    private attachEventListeners(): void {
        this.dropdown.addEventListener('change', () => {
            const value = this.dropdown.value;
            
            if (value === 'custom') {
                this.customContainer.style.display = 'block';
                this.customInput.focus();
                // Don't trigger onChange yet - wait for custom input
            } else {
                this.customContainer.style.display = 'none';
                this.options.onLanguageChange(value);
            }
        });

        this.customInput.addEventListener('input', () => {
            const customValue = this.customInput.value.trim();
            if (customValue) {
                this.options.onLanguageChange(customValue);
            }
        });

        // Handle Enter key in custom input
        this.customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const customValue = this.customInput.value.trim();
                if (customValue) {
                    this.options.onLanguageChange(customValue);
                }
            }
        });

        // Listen for external language changes (from project switching)
        this.container.addEventListener('externalLanguageChange', (e: Event) => {
            const customEvent = e as CustomEvent<{ language: string }>;
            const newLanguage = customEvent.detail.language;
            this.setLanguage(newLanguage);
        });
    }

    /**
     * Update the selector to reflect the current language
     */
    private updateSelection(): void {
        const currentLanguage = this.options.currentLanguage;
        
        // Check if current language is in the predefined list
        const predefinedLanguage = LanguageSelector.LANGUAGES.find(
            lang => lang.code.toLowerCase() === currentLanguage.toLowerCase()
        );
        
        if (predefinedLanguage) {
            this.dropdown.value = predefinedLanguage.code;
            this.customContainer.style.display = 'none';
        } else {
            // It's a custom language
            this.dropdown.value = 'custom';
            this.customContainer.style.display = 'block';
            this.customInput.value = currentLanguage;
        }
    }

    /**
     * Update the current language (useful when language changes externally)
     */
    public setLanguage(language: string): void {
        this.options.currentLanguage = language;
        this.updateSelection();
    }

    /**
     * Get the currently selected language
     */
    public getCurrentLanguage(): string {
        if (this.dropdown.value === 'custom') {
            return this.customInput.value.trim() || 'English';
        }
        return this.dropdown.value;
    }

    /**
     * Check if the selector is showing a custom language input
     */
    public isCustomLanguage(): boolean {
        return this.dropdown.value === 'custom';
    }

    /**
     * Focus the appropriate input
     */
    public focus(): void {
        if (this.isCustomLanguage()) {
            this.customInput.focus();
        } else {
            this.dropdown.focus();
        }
    }

    /**
     * Destroy the component and clean up
     */
    public destroy(): void {
        this.container.innerHTML = '';
    }
} 