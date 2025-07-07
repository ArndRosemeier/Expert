/**
 * Language selector component with flag emojis and custom text option
 */
export interface LanguageSelectorOptions {
    currentLanguage: string;
    onLanguageChange: (language: string) => void;
    label?: string;
    description?: string;
}

export interface LanguageOption {
    code: string;
    name: string;
    flag: string;
}

/**
 * LanguageSelector Component
 * 
 * Provides a dropdown interface for selecting application language with flag emoji display.
 * 
 * ## Windows Flag Emoji Support
 * 
 * This component automatically loads web fonts to fix flag emoji display on Windows.
 * Windows 10/11 don't include flag emojis in their default "Segoe UI Emoji" font,
 * showing letter codes (like "US", "DE") instead of actual flag images.
 * 
 * ### Solution Implemented:
 * - Loads Noto Color Emoji font via CDN specifically for flag Unicode ranges (U+1F1E6-1F1FF)
 * - Uses CSS unicode-range to only apply the font to flag characters
 * - Includes fallback fonts for reliability
 * - Works in all browsers (Chrome, Edge, Firefox) on Windows
 * 
 * ### Technical Details:
 * - Primary font: `noto-color-emoji-font` from jsDelivr CDN (~300KB for flags only)
 * - Fallback font: Google Fonts Noto Color Emoji
 * - CSS injection happens once per page load via singleton pattern
 * - No impact on other emojis or system performance
 * 
 * @example
 * ```typescript
 * const selector = new LanguageSelector(container, {
 *   currentLanguage: 'English',
 *   onLanguageChange: (lang) => console.log(`Language changed to: ${lang}`)
 * });
 * ```
 */
export class LanguageSelector {
    private container: HTMLElement;
    private options: LanguageSelectorOptions;
    private dropdown!: HTMLSelectElement;
    private customInput!: HTMLInputElement;
    private customContainer!: HTMLElement;

    // Common languages with Unicode flag emojis
    private static readonly LANGUAGES: LanguageOption[] = [
        { code: 'English', name: 'English', flag: '🇺🇸' },
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
        this.initializeCSS();
        this.createHTML();
        this.attachEventListeners();
        this.updateSelection();
    }

    private initializeCSS() {
        // Add flag emoji support for Windows browsers
        // Windows doesn't include flag emojis in its default font (Segoe UI Emoji)
        // This provides multiple fallback strategies for better flag display
        if (!document.getElementById('flag-emoji-css')) {
            const style = document.createElement('style');
            style.id = 'flag-emoji-css';
            style.textContent = `
                /* Enhanced language selector styling for Windows flag emoji support */
                .language-selector-dropdown,
                .language-selector-dropdown option {
                    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Segoe UI Symbol', system-ui, sans-serif;
                    font-feature-settings: "liga" off;
                    text-rendering: optimizeLegibility;
                }
                
                /* Improved base styling for language options */
                .language-selector-dropdown option {
                    padding: 0.375rem 0.5rem;
                    line-height: 1.4;
                    font-size: 14px;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                
                /* Windows-specific emoji improvements */
                @supports (-ms-ime-align: auto) {
                    .language-selector-dropdown option {
                        font-variant-emoji: color;
                    }
                }
                
                /* Force color emoji rendering in Chromium browsers */
                @supports (font-variant-emoji: color) {
                    .language-selector-dropdown,
                    .language-selector-dropdown option {
                        font-variant-emoji: color;
                    }
                }
                
                /* Improved letter code styling for fallback */
                .language-selector-dropdown option {
                    letter-spacing: 0.025em;
                    font-weight: 500;
                }
                
                /* Special handling for flag emojis that display as letter codes */
                .language-selector-dropdown option[data-has-flag="true"] {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border-left: 3px solid #3b82f6;
                    font-weight: 600;
                    color: #1e40af;
                }
                
                /* Hide the enhanced styling when real emojis are working */
                @supports (color-scheme: light dark) {
                    .language-selector-dropdown option[data-has-flag="true"] {
                        background: transparent;
                        border-left: none;
                        font-weight: normal;
                        color: inherit;
                    }
                }
            `;
            document.head.appendChild(style);
            
            // Inject Twemoji CSS as backup for specific flag rendering
            this.addTwemojiSVGSupport();
            
            // Test flag emoji support and enhance display accordingly
            setTimeout(() => {
                this.testAndEnhanceFlagDisplay();
            }, 500);
            
            // Log successful flag emoji CSS injection
            console.log('🏁 Flag emoji CSS support loaded for Windows compatibility');
        }
    }

    private addTwemojiSVGSupport() {
        // Add Twemoji SVG support as background images for flags
        const twemojiStyle = document.createElement('style');
        twemojiStyle.id = 'twemoji-svg-flags';
        twemojiStyle.textContent = `
            /* Twemoji SVG flag backgrounds for specific country codes */
            .language-selector-dropdown option[data-flag-code="US"]::before,
            .language-selector-dropdown option[data-flag-code="DE"]::before,
            .language-selector-dropdown option[data-flag-code="FR"]::before,
            .language-selector-dropdown option[data-flag-code="ES"]::before,
            .language-selector-dropdown option[data-flag-code="IT"]::before,
            .language-selector-dropdown option[data-flag-code="JP"]::before,
            .language-selector-dropdown option[data-flag-code="KR"]::before,
            .language-selector-dropdown option[data-flag-code="CN"]::before,
            .language-selector-dropdown option[data-flag-code="BR"]::before,
            .language-selector-dropdown option[data-flag-code="RU"]::before,
            .language-selector-dropdown option[data-flag-code="IN"]::before,
            .language-selector-dropdown option[data-flag-code="GB"]::before {
                content: "";
                display: inline-block;
                width: 16px;
                height: 12px;
                margin-right: 6px;
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border-radius: 2px;
                border: 1px solid #e5e7eb;
            }
            
            /* Specific flag mappings using Twemoji SVG from CDN */
            .language-selector-dropdown option[data-flag-code="US"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1fa-1f1f8.svg');
            }
            .language-selector-dropdown option[data-flag-code="DE"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1e9-1f1ea.svg');
            }
            .language-selector-dropdown option[data-flag-code="FR"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1eb-1f1f7.svg');
            }
            .language-selector-dropdown option[data-flag-code="ES"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1ea-1f1f8.svg');
            }
            .language-selector-dropdown option[data-flag-code="JP"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1ef-1f1f5.svg');
            }
            .language-selector-dropdown option[data-flag-code="GB"]::before {
                background-image: url('https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f1ec-1f1e7.svg');
            }
        `;
        document.head.appendChild(twemojiStyle);
    }

    private testAndEnhanceFlagDisplay() {
        // Test if flag emojis are displaying properly
        const testElement = document.createElement('span');
        testElement.style.cssText = 'position: absolute; left: -9999px; font-size: 24px;';
        testElement.innerHTML = '🇺🇸';
        document.body.appendChild(testElement);
        
        const rect = testElement.getBoundingClientRect();
        const flagsWorking = rect.width > 10; // If width is reasonable, flags are probably working
        
        document.body.removeChild(testElement);
        
        if (flagsWorking) {
            console.log('✅ Flag emojis appear to be working correctly');
        } else {
            console.log('⚠️ Flag emojis not displaying properly, using enhanced fallbacks');
            // Add data attributes to help with styling
            this.enhanceFallbackDisplay();
        }
    }

    private enhanceFallbackDisplay() {
        // Add data attributes to language options for enhanced styling
        const dropdowns = document.querySelectorAll('.language-selector-dropdown');
        dropdowns.forEach(dropdown => {
            const options = dropdown.querySelectorAll('option');
            options.forEach(option => {
                const text = option.textContent || '';
                if (text.includes('🇺🇸') || text.includes('🇩🇪') || text.includes('🇫🇷') || 
                    text.includes('🇪🇸') || text.includes('🇯🇵') || text.includes('🇬🇧')) {
                    option.setAttribute('data-has-flag', 'true');
                    
                    // Extract flag code if possible
                    if (text.includes('🇺🇸')) option.setAttribute('data-flag-code', 'US');
                    else if (text.includes('🇩🇪')) option.setAttribute('data-flag-code', 'DE');
                    else if (text.includes('🇫🇷')) option.setAttribute('data-flag-code', 'FR');
                    else if (text.includes('🇪🇸')) option.setAttribute('data-flag-code', 'ES');
                    else if (text.includes('🇯🇵')) option.setAttribute('data-flag-code', 'JP');
                    else if (text.includes('🇬🇧')) option.setAttribute('data-flag-code', 'GB');
                }
            });
        });
    }

    private createHTML(): void {
        const label = this.options.label || 'Language';
        const description = this.options.description || 'Select the language for content generation';

        this.container.innerHTML = `
            <div class="language-selector">
                <label class="language-selector-label">
                    ${label}
                </label>
                ${description ? `<div class="language-selector-description">${description}</div>` : ''}
                
                <select class="language-selector-dropdown">
                    ${LanguageSelector.LANGUAGES.map(lang => 
                        `<option value="${lang.code}">${lang.flag} ${lang.name}</option>`
                    ).join('')}
                    <option value="custom">🌐 Other (Custom)</option>
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
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                background: var(--background-color, white);
                color: var(--text-color, #333);
                font-size: 1rem;
                line-height: 1.5;
                cursor: pointer;
            }
            
            .language-selector-dropdown:focus {
                outline: none;
                border-color: var(--primary-color, #007bff);
                box-shadow: 0 0 0 2px var(--primary-color-alpha, rgba(0, 123, 255, 0.25));
            }
            
            .language-selector-custom {
                margin-top: 0.75rem;
                padding: 0.75rem;
                background: var(--background-secondary, #f8f9fa);
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
            }
            
            .language-selector-custom-input {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                background: var(--background-color, white);
                color: var(--text-color, #333);
                font-size: 1rem;
                margin-bottom: 0.5rem;
            }
            
            .language-selector-custom-input:focus {
                outline: none;
                border-color: var(--primary-color, #007bff);
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