import { QualityCriterion } from '../types';
import { formatCriteriaAsJson } from '../ProjectUtils';
import { SettingsManager } from '../SettingsManager';

export interface PlaceholderContext {
    // Node-specific context
    node?: {
        title?: string;
        content?: string;
        isLeaf?: boolean;
        path?: string;
    };
    
    // Project context
    project?: {
        title?: string;
        language?: string;
        criteria?: QualityCriterion[];
    };
    
    // Generation context
    generation?: {
        count?: number;
        childLevelName?: string;
        generateCount?: string;
        draftOrFresh?: string;
        parentContent?: string;
        context?: string;
    };
    
    // Prompt-specific context
    prompt?: {
        userPrompt?: string;
        lastResponse?: string;
        editorAdvice?: string;
        originalPrompt?: string;
        response?: string;
        ratings?: unknown;
        instruction?: string;
        originalText?: string;
        detail?: string;
    };
    
    // Analysis context
    analysis?: {
        fileName?: string;
        textContent?: string;
        extractionRequest?: string;
        nodeTitle?: string;
        parentTitle?: string;
        childTitle?: string;
        factInOutline?: string;
        factInExpansion?: string;
        justification?: string;
        outlineContent?: string;
        description?: string;
        childrenContent?: string;
        parentContext?: string;
    };
    
    // UI context
    ui?: {
        nodeData?: string;
        startingNode?: string;
        selected?: string;
    };
    
    // Custom placeholders for specific contexts
    custom?: Record<string, string>;
    
    // Global placeholder overrides - these override the dynamic global providers
    globalOverrides?: Record<string, string>;
}

interface PlaceholderValue {
    value: string;
    description?: string;
}

type GlobalPlaceholderProvider = () => PlaceholderValue;
type ContextPlaceholderProvider = (context: PlaceholderContext) => PlaceholderValue;
type AsyncPlaceholderProvider = (context: PlaceholderContext, match: string) => Promise<PlaceholderValue>;

class PromptExpansionService {
    private globalProviders: Map<string, GlobalPlaceholderProvider> = new Map();
    private contextProviders: Map<string, ContextPlaceholderProvider> = new Map();
    private asyncProviders: Map<string, AsyncPlaceholderProvider> = new Map();
    private settingsManager: SettingsManager;
    
    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
        this.registerDefaultProviders();
    }
    
    /**
     * Register a global placeholder that's available everywhere
     */
    registerGlobalPlaceholder(name: string, provider: GlobalPlaceholderProvider): void {
        this.globalProviders.set(name, provider);
    }
    
    /**
     * Register a context-dependent placeholder
     */
    registerContextPlaceholder(name: string, provider: ContextPlaceholderProvider): void {
        this.contextProviders.set(name, provider);
    }
    
    /**
     * Register an async interactive placeholder (like input dialogs)
     */
    registerAsyncPlaceholder(name: string, provider: AsyncPlaceholderProvider): void {
        this.asyncProviders.set(name, provider);
    }
    
    /**
     * Main expansion method - replaces all placeholders in a template (synchronous version)
     */
    expandPrompt(template: string, context: PlaceholderContext = {}): string {
        let expanded = template;
        
        // Handle global placeholders (check overrides first)
        for (const [name, provider] of this.globalProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                // Check for override first
                const overrideValue = context.globalOverrides?.[name];
                const value = overrideValue !== undefined ? overrideValue : provider().value;
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), value);
            }
        }
        
        // Handle context placeholders
        for (const [name, provider] of this.contextProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                const result = provider(context);
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), result.value);
            }
        }
        
        // Handle custom placeholders
        if (context.custom) {
            for (const [name, value] of Object.entries(context.custom)) {
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), value);
            }
        }
        
        return expanded;
    }
    
    /**
     * Async expansion method - handles both regular and interactive placeholders
     */
    async expandPromptAsync(template: string, context: PlaceholderContext = {}): Promise<string> {
        let expanded = template;
        
        // Handle global placeholders (check overrides first)
        for (const [name, provider] of this.globalProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                // Check for override first
                const overrideValue = context.globalOverrides?.[name];
                const value = overrideValue !== undefined ? overrideValue : provider().value;
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), value);
            }
        }
        
        // Handle context placeholders
        for (const [name, provider] of this.contextProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                const result = provider(context);
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), result.value);
            }
        }
        
        // Handle custom placeholders
        if (context.custom) {
            for (const [name, value] of Object.entries(context.custom)) {
                expanded = expanded.replace(new RegExp(`\\{\\{${this.escapeRegex(name)}\\}\\}`, 'g'), value);
            }
        }
        
        // Handle async placeholders (like input dialogs)
        for (const [name, provider] of this.asyncProviders) {
            if (name === 'input') {
                // Handle {{input "Title with spaces"}}
                const quotedMatches = expanded.matchAll(/\{\{input\s+"([^"]+)"\}\}/g);
                for (const match of quotedMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        // Handle cancellation
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, '');
                    }
                }
                
                // Handle {{input Title}}
                const unquotedMatches = expanded.matchAll(/\{\{input\s+([^}"\s]+)\}\}/g);
                for (const match of unquotedMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        // Handle cancellation
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, '');
                    }
                }
                
                // Handle simple {{input}}
                const simpleMatches = expanded.matchAll(/\{\{input\}\}/g);
                for (const match of simpleMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        // Handle cancellation
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, '');
                    }
                }
            } else if (name === 'select') {
                // Handle {{select "Choose option" option1,option2,option3}}
                const selectMatches = expanded.matchAll(/\{\{select\s+"([^"]+)"\s+([^}]+)\}\}/g);
                for (const match of selectMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, '');
                    }
                }
            } else if (name === 'multiline') {
                // Handle {{multiline "Enter description"}}
                const multilineMatches = expanded.matchAll(/\{\{multiline\s+"([^"]+)"\}\}/g);
                for (const match of multilineMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, '');
                    }
                }
            } else if (name === 'confirm') {
                // Handle {{confirm "Are you sure?"}}
                const confirmMatches = expanded.matchAll(/\{\{confirm\s+"([^"]+)"\}\}/g);
                for (const match of confirmMatches) {
                    const fullMatch = match[0];
                    try {
                        const result = await provider(context, fullMatch);
                        expanded = expanded.replace(fullMatch, result.value);
                    } catch (error) {
                        if (error instanceof Error && error.message === 'USER_CANCELLED') {
                            throw error;
                        }
                        expanded = expanded.replace(fullMatch, 'no');
                    }
                }
            }
        }
        
        return expanded;
    }
    
    /**
     * Get all available placeholders with their descriptions
     */
    getAvailablePlaceholders(context: PlaceholderContext = {}): Record<string, string> {
        const placeholders: Record<string, string> = {};
        
        // Global placeholders
        for (const [name, provider] of this.globalProviders) {
            const result = provider();
            placeholders[name] = result.description!;
        }
        
        // Context placeholders
        for (const [name, provider] of this.contextProviders) {
            const result = provider(context);
            placeholders[name] = result.description!;
        }
        
        // Async placeholders
        for (const [name] of this.asyncProviders) {
            placeholders[name] = `Interactive placeholder: ${name} (shows input dialog)`;
        }
        
        return placeholders;
    }
    
    /**
     * Check if a template uses any undefined placeholders
     */
    validateTemplate(template: string, context: PlaceholderContext = {}): string[] {
        const errors: string[] = [];
        const placeholderRegex = /\{\{([^}]+)\}\}/g;
        const matches = template.matchAll(placeholderRegex);
        
        const availablePlaceholders = new Set([
            ...this.globalProviders.keys(),
            ...this.contextProviders.keys(),
            ...this.asyncProviders.keys(),
            ...Object.keys(context.custom!)
        ]);
        
        for (const match of matches) {
            const placeholderName = match[1];
            if (!placeholderName) continue;
            
            // Handle special input patterns
            if (placeholderName.startsWith('input')) {
                // Check for valid input patterns
                const isValidInput = 
                    placeholderName === 'input' || 
                    /^input\s+[^}"\s]+$/.test(placeholderName) ||
                    /^input\s+"[^"]+\"$/.test(placeholderName);
                
                if (!isValidInput) {
                    errors.push(`Invalid input placeholder: {{${placeholderName}}} - use {{input}}, {{input Title}}, or {{input "Title with spaces"}}`);
                }
                continue;
            }
            
            // Handle special select patterns
            if (placeholderName.startsWith('select')) {
                const isValidSelect = /^select\s+"[^"]+"\s+[^}]+$/.test(placeholderName);
                if (!isValidSelect) {
                    errors.push(`Invalid select placeholder: {{${placeholderName}}} - use {{select "Choose option" option1,option2,option3}}`);
                }
                continue;
            }
            
            // Handle special multiline patterns
            if (placeholderName.startsWith('multiline')) {
                const isValidMultiline = /^multiline\s+"[^"]+"$/.test(placeholderName);
                if (!isValidMultiline) {
                    errors.push(`Invalid multiline placeholder: {{${placeholderName}}} - use {{multiline "Enter description"}}`);
                }
                continue;
            }
            
            // Handle special confirm patterns
            if (placeholderName.startsWith('confirm')) {
                const isValidConfirm = /^confirm\s+"[^"]+"$/.test(placeholderName);
                if (!isValidConfirm) {
                    errors.push(`Invalid confirm placeholder: {{${placeholderName}}} - use {{confirm "Are you sure?"}}`);
                }
                continue;
            }
            
            // Handle special placeholders
            if (placeholderName === 'selected') {
                // Selected text is handled specially
                continue;
            }
            
            if (!availablePlaceholders.has(placeholderName)) {
                errors.push(`Unknown placeholder: {{${placeholderName}}}`);
            }
        }
        
        return errors;
    }
    
    /**
     * Get the current value of a specific placeholder for debugging
     */
    getPlaceholderValue(name: string, context: PlaceholderContext = {}): string {
        // Check global providers first
        const globalProvider = this.globalProviders.get(name);
        if (globalProvider) {
            return globalProvider().value;
        }
        
        // Check context providers
        const contextProvider = this.contextProviders.get(name);
        if (contextProvider) {
            return contextProvider(context).value;
        }
        
        // Check custom placeholders
        return context.custom![name]!;
    }
    
    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    
    private registerDefaultProviders(): void {
        // Global placeholders that are always available
        this.registerGlobalPlaceholder('current_date', () => ({
            value: new Date().toLocaleDateString(),
            description: 'Current date in local format'
        }));
        
        this.registerGlobalPlaceholder('current_time', () => ({
            value: new Date().toLocaleTimeString(),
            description: 'Current time in local format'
        }));
        
        this.registerGlobalPlaceholder('current_year', () => ({
            value: new Date().getFullYear().toString(),
            description: 'Current year'
        }));
        
        this.registerGlobalPlaceholder('current_datetime', () => ({
            value: new Date().toLocaleString(),
            description: 'Current date and time'
        }));
        
        this.registerGlobalPlaceholder('current_timestamp', () => ({
            value: new Date().toISOString(),
            description: 'Current timestamp in ISO format'
        }));
        
        this.registerGlobalPlaceholder('random_uuid', () => ({
            value: crypto.randomUUID(),
            description: 'Random UUID for unique identification'
        }));

        // Language placeholder - now global for consistency across all prompts
        this.registerGlobalPlaceholder('language', () => ({
            value: this.settingsManager.getLanguage(),
            description: 'Current project language setting'
        }));

        // Noise seed for creative naming inspiration
        this.registerGlobalPlaceholder('noise_names', () => ({
            value: this.generateNoiseNames(),
            description: 'Random glyphs and word-like patterns for creative naming inspiration'
        }));
        
        // Context-dependent placeholders
        this.registerContextPlaceholder('project_title', (context) => ({
            value: context.project!.title!,
            description: 'Current project title'
        }));
        
        this.registerContextPlaceholder('criteria', (context) => ({
            value: context.custom?.['criteria'] || formatCriteriaAsJson(context.project!.criteria!),
            description: 'Project quality criteria'
        }));
        
        // Advanced node placeholders
        this.registerContextPlaceholder('content', (context) => ({
            value: context.node!.content!,
            description: 'Current node content'
        }));
        
        this.registerContextPlaceholder('path', (context) => ({
            value: context.node!.path!,
            description: 'Hierarchical path to current node'
        }));
        
        this.registerContextPlaceholder('node_depth', () => ({
            value: '1', // TODO: Implement proper depth calculation
            description: 'Depth level of current node in hierarchy'
        }));
        
        this.registerContextPlaceholder('node_type', (context) => ({
            value: context.node!.isLeaf! ? 'leaf' : 'branch',
            description: 'Type of node: leaf (content) or branch (has children)'
        }));
        
        this.registerContextPlaceholder('content_length', (context) => ({
            value: context.node!.content!.length.toString(),
            description: 'Character count of current node content'
        }));
        
        this.registerContextPlaceholder('content_word_count', (context) => ({
            value: context.node!.content!.split(/\s+/).filter(w => w.length > 0).length.toString(),
            description: 'Word count of current node content'
        }));
        
        this.registerContextPlaceholder('title_length', (context) => ({
            value: context.node!.title!.length.toString(),
            description: 'Character count of current node title'
        }));

        // Generation context placeholders
        this.registerContextPlaceholder('context', (context) => ({
            value: context.generation!.context!,
            description: 'Compiled contextual information'
        }));
        
        this.registerContextPlaceholder('child_level_name', (context) => ({
            value: context.generation!.childLevelName!,
            description: 'Name of child level for branch nodes'
        }));
        
        this.registerContextPlaceholder('count', (context) => ({
            value: context.generation!.count!.toString(),
            description: 'Number of items to generate'
        }));
        
        this.registerContextPlaceholder('generate_count', (context) => ({
            value: context.generation!.generateCount || `exactly ${context.generation!.count!} entries`,
            description: 'Smart count instruction for generation'
        }));
        
        this.registerContextPlaceholder('draftorfresh', (context) => ({
            value: context.generation!.draftOrFresh!,
            description: 'Draft or fresh content instruction'
        }));
        
        this.registerContextPlaceholder('parent_content', (context) => ({
            value: context.generation!.parentContent!,
            description: 'Content of parent node'
        }));

        // Prompt-specific placeholders
        this.registerContextPlaceholder('prompt', (context) => ({
            value: context.custom?.['prompt'] || context.prompt!.userPrompt!,
            description: 'User prompt text'
        }));
        
        this.registerContextPlaceholder('lastResponse', (context) => ({
            value: context.custom?.['lastResponse'] || context.prompt!.lastResponse!,
            description: 'Previous AI response'
        }));
        
        this.registerContextPlaceholder('editorAdvice', (context) => ({
            value: context.custom?.['editorAdvice'] || context.prompt!.editorAdvice!,
            description: 'Editor advice for improvement'
        }));
        
        this.registerContextPlaceholder('originalPrompt', (context) => ({
            value: context.custom?.['originalPrompt'] || context.prompt!.originalPrompt!,
            description: 'Original user prompt'
        }));
        
        this.registerContextPlaceholder('response', (context) => ({
            value: context.custom?.['response'] || context.prompt!.response!,
            description: 'AI response text'
        }));
        
        this.registerContextPlaceholder('ratings', (context) => ({
            value: context.custom?.['ratings'] || JSON.stringify(context.prompt!.ratings!, null, 2),
            description: 'Response ratings data'
        }));
        
        this.registerContextPlaceholder('instruction', (context) => ({
            value: context.prompt!.instruction!,
            description: 'Processing instruction'
        }));
        
        this.registerContextPlaceholder('originalText', (context) => ({
            value: context.prompt!.originalText!,
            description: 'Original text to be processed'
        }));
        
        this.registerContextPlaceholder('detail', (context) => ({
            value: context.prompt!.detail!,
            description: 'Detailed instruction or description'
        }));

        // Analysis placeholders
        this.registerContextPlaceholder('file_name', (context) => ({
            value: context.analysis!.fileName!,
            description: 'Name of analyzed file'
        }));
        
        this.registerContextPlaceholder('text_content', (context) => ({
            value: context.analysis!.textContent!,
            description: 'Content of analyzed text'
        }));
        
        this.registerContextPlaceholder('extraction_request', (context) => ({
            value: context.analysis!.extractionRequest!,
            description: 'What to extract from content'
        }));
        
        this.registerContextPlaceholder('node_title', (context) => ({
            value: context.analysis!.nodeTitle || context.node!.title!,
            description: 'Title of analyzed node'
        }));
        
        this.registerContextPlaceholder('parent_title', (context) => ({
            value: context.analysis!.parentTitle!,
            description: 'Title of parent node'
        }));
        
        this.registerContextPlaceholder('child_title', (context) => ({
            value: context.analysis!.childTitle!,
            description: 'Title of child node'
        }));
        
        this.registerContextPlaceholder('fact_in_outline', (context) => ({
            value: context.analysis!.factInOutline!,
            description: 'Fact stated in outline'
        }));
        
        this.registerContextPlaceholder('fact_in_expansion', (context) => ({
            value: context.analysis!.factInExpansion!,
            description: 'Fact stated in expansion'
        }));
        
        this.registerContextPlaceholder('justification', (context) => ({
            value: context.analysis!.justification!,
            description: 'Justification for changes'
        }));
        
        this.registerContextPlaceholder('outline_content', (context) => ({
            value: context.analysis!.outlineContent!,
            description: 'Content of outline'
        }));
        
        this.registerContextPlaceholder('description', (context) => ({
            value: context.analysis!.description!,
            description: 'Project or content description'
        }));
        
        this.registerContextPlaceholder('children_content', (context) => ({
            value: context.analysis!.childrenContent!,
            description: 'Content of child nodes'
        }));
        
        this.registerContextPlaceholder('parent_context', (context) => ({
            value: context.analysis!.parentContext!,
            description: 'Context of parent node'
        }));

        // UI placeholders
        this.registerContextPlaceholder('node_data', (context) => ({
            value: context.ui!.nodeData!,
            description: 'Formatted node data for UI'
        }));
        
        this.registerContextPlaceholder('starting_node', (context) => ({
            value: context.ui!.startingNode!,
            description: 'Starting node for adventures'
        }));
        
        this.registerContextPlaceholder('selected', (context) => ({
            value: context.ui!.selected!,
            description: 'Currently selected text in UI'
        }));
        
        // Interactive placeholders - these can be easily extended
        this.registerAsyncPlaceholder('input', async (_context, match) => {
            // Extract title from different input patterns
            let title = 'Enter your input';
            
            // Check for quoted title: {{input "Title with spaces"}}
            const quotedMatch = match.match(/\{\{input\s+"([^"]+)"\}\}/);
            if (quotedMatch && quotedMatch[1]) {
                title = quotedMatch[1];
            } else {
                // Check for unquoted title: {{input Title}}
                const unquotedMatch = match.match(/\{\{input\s+([^}"\s]+)\}\}/);
                if (unquotedMatch && unquotedMatch[1]) {
                    title = unquotedMatch[1];
                }
                // For simple {{input}}, use default title
            }
            
            const userInput = await this.showInputModal(title);
            return {
                value: userInput,
                description: 'Interactive input dialog'
            };
        });
        
        // Future interactive placeholders - ready to be implemented
        this.registerAsyncPlaceholder('select', async (_context, match) => {
            // {{select "Choose option" option1,option2,option3}}
            const selectMatch = match.match(/\{\{select\s+"([^"]+)"\s+([^}]+)\}\}/);
            if (selectMatch && selectMatch[1] && selectMatch[2]) {
                const title = selectMatch[1];
                const options = selectMatch[2].split(',').map(opt => opt.trim());
                const selection = await this.showSelectModal(title, options);
                return {
                    value: selection,
                    description: 'Interactive selection dialog'
                };
            }
            return { value: '', description: 'Invalid select placeholder' };
        });
        
        this.registerAsyncPlaceholder('multiline', async (_context, match) => {
            // {{multiline "Enter description"}}
            const multilineMatch = match.match(/\{\{multiline\s+"([^"]+)"\}\}/);
            if (multilineMatch && multilineMatch[1]) {
                const title = multilineMatch[1];
                const text = await this.showTextAreaModal(title);
                return {
                    value: text,
                    description: 'Interactive multiline text dialog'
                };
            }
            return { value: '', description: 'Invalid multiline placeholder' };
        });
        
        this.registerAsyncPlaceholder('confirm', async (_context, match) => {
            // {{confirm "Are you sure?"}}
            const confirmMatch = match.match(/\{\{confirm\s+"([^"]+)"\}\}/);
            if (confirmMatch && confirmMatch[1]) {
                const message = confirmMatch[1];
                const result = await this.showConfirmModal(message);
                return {
                    value: result ? 'yes' : 'no',
                    description: 'Interactive confirmation dialog'
                };
            }
            return { value: 'no', description: 'Invalid confirm placeholder' };
        });
    }

    /**
     * Generate random glyphs and word-like patterns for creative naming inspiration
     */
    private generateNoiseNames(): string {
        const unicodeRanges: [string, string][] = [
            // Runic-like symbols
            ['ᚠ', 'ᚾ'], ['ᛁ', 'ᛟ'],
            // Geometric symbols
            ['◊', '◈'], ['△', '▲'], ['⟡', '⟢'],
            // Mathematical symbols
            ['∿', '≋'], ['⊱', '⊰'], ['∆', '∇'],
            // Ancient script inspired
            ['ψ', 'ω'], ['Θ', 'Φ'], ['₪', '℘']
        ];

        const consonantLike = ['th', 'kr', 'zn', 'vl', 'xr', 'qm', 'fy', 'gh', 'jw', 'bp'];
        const vowelLike = ['ae', 'ou', 'ia', 'ey', 'ai', 'uo', 'ea', 'yi'];

        // Generate 6-8 glyph sequences
        const glyphs: string[] = [];
        const numGlyphs = 6 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numGlyphs; i++) {
            const rangeIndex = Math.floor(Math.random() * unicodeRanges.length);
            const range = unicodeRanges[rangeIndex];
            if (range && range.length === 2) {
                const startCode = range[0].charCodeAt(0);
                const endCode = range[1].charCodeAt(0);
                const randomCode = startCode + Math.floor(Math.random() * (endCode - startCode + 1));
                glyphs.push(String.fromCharCode(randomCode));
            }
        }

        // Generate 4-6 word-like patterns
        const words: string[] = [];
        const numWords = 4 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numWords; i++) {
            const length = 3 + Math.floor(Math.random() * 4); // 3-6 characters
            let word = '';
            
            for (let j = 0; j < length; j++) {
                if (j % 2 === 0) {
                    // Consonant-like sound
                    word += consonantLike[Math.floor(Math.random() * consonantLike.length)];
                } else {
                    // Vowel-like sound
                    word += vowelLike[Math.floor(Math.random() * vowelLike.length)];
                }
            }
            words.push(word);
        }

        return `Use these lost glyphs for inspiration when creating names: ${glyphs.join(' ')}. Ancient word fragments recovered from inscriptions: ${words.join(', ')}. These are purely for creative inspiration - derive new names that echo their mysterious essence rather than using them directly.`;
    }
    
    /**
     * Show an input modal and return the user's input
     */
    private async showInputModal(title: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Import modal system dynamically to avoid circular dependencies
            void import('../ui/modals/index').then(({ showGenericModal }) => {
                let isResolved = false; // Prevent multiple resolutions
                
                const resolveOnce = (value: string) => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(value);
                    }
                };
                
                const rejectOnce = (error: Error) => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(error);
                    }
                };

                const modal = showGenericModal(
                    {
                        content: `
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">
                                    ${title}
                                </label>
                                <input type="text" id="user-input" 
                                       style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; transition: border-color 0.2s; box-sizing: border-box;" 
                                       placeholder="Enter your input..." autofocus>
                            </div>
                        `,
                        actions: [
                            {
                                id: 'cancel',
                                label: 'Cancel',
                                type: 'secondary',
                                handler: () => {
                                    rejectOnce(new Error('USER_CANCELLED'));
                                    void modal.close();
                                }
                            },
                            {
                                id: 'submit',
                                label: 'OK',
                                type: 'primary',
                                handler: () => {
                                    const input = document.getElementById('user-input') as HTMLInputElement;
                                    const value = input?.value?.trim() || '';
                                    if (value) {
                                        resolveOnce(value);
                                        void modal.close();
                                    } else {
                                        input?.focus();
                                    }
                                }
                            }
                        ]
                    },
                    {
                        title: 'Input Required',
                        maxWidth: '400px'
                    },
                    {
                        onOpen: () => {
                            void void setTimeout(() => {
                                const input = document.getElementById('user-input') as HTMLInputElement;
                                if (input) {
                                    input.addEventListener('keydown', (e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const value = input.value.trim();
                                            if (value) {
                                                resolveOnce(value);
                                                void modal.close();
                                            } else {
                                                input.focus();
                                            }
                                        } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            rejectOnce(new Error('USER_CANCELLED'));
                                            void modal.close();
                                        }
                                    });
                                    input.focus();
                                }
                            }, 100);
                        },
                        onClose: () => {
                            if (!isResolved) {
                                rejectOnce(new Error('USER_CANCELLED'));
                            }
                        }
                    }
                );
            }).catch(error => {
                reject(new Error(`Failed to load modal system: ${error.message}`));
            });
        });
    }
    
    /**
     * Show a selection modal and return the user's choice
     */
    private async showSelectModal(title: string, options: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            void import('../ui/modals/index').then(({ showGenericModal }) => {
                let isResolved = false;
                
                const resolveOnce = (value: string) => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(value);
                    }
                };
                
                const rejectOnce = (error: Error) => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(error);
                    }
                };

                const optionsHtml = options.map(option => 
                    `<option value="${option}">${option}</option>`
                ).join('');

                const modal = showGenericModal(
                    {
                        content: `
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">
                                    ${title}
                                </label>
                                <select id="user-select" 
                                        style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; box-sizing: border-box;">
                                    ${optionsHtml}
                                </select>
                            </div>
                        `,
                        actions: [
                            {
                                id: 'cancel',
                                label: 'Cancel',
                                type: 'secondary',
                                handler: () => {
                                    rejectOnce(new Error('USER_CANCELLED'));
                                    void modal.close();
                                }
                            },
                            {
                                id: 'submit',
                                label: 'OK',
                                type: 'primary',
                                handler: () => {
                                    const select = document.getElementById('user-select') as HTMLSelectElement;
                                    const value = select?.value || '';
                                    if (value) {
                                        resolveOnce(value);
                                        void modal.close();
                                    }
                                }
                            }
                        ]
                    },
                    {
                        title: 'Select Option',
                        maxWidth: '400px'
                    },
                    {
                        onOpen: () => {
                            void void setTimeout(() => {
                                const select = document.getElementById('user-select') as HTMLSelectElement;
                                if (select) {
                                    select.focus();
                                }
                            }, 100);
                        },
                        onClose: () => {
                            if (!isResolved) {
                                rejectOnce(new Error('USER_CANCELLED'));
                            }
                        }
                    }
                );
            }).catch(error => {
                reject(new Error(`Failed to load modal system: ${error.message}`));
            });
        });
    }
    
    /**
     * Show a textarea modal and return the user's input
     */
    private async showTextAreaModal(title: string): Promise<string> {
        return new Promise((resolve, reject) => {
            void import('../ui/modals/index').then(({ showGenericModal }) => {
                let isResolved = false;
                
                const resolveOnce = (value: string) => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(value);
                    }
                };
                
                const rejectOnce = (error: Error) => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(error);
                    }
                };

                const modal = showGenericModal(
                    {
                        content: `
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">
                                    ${title}
                                </label>
                                <textarea id="user-textarea" 
                                          style="width: 100%; height: 150px; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; resize: vertical; box-sizing: border-box; font-family: inherit;" 
                                          placeholder="Enter your text..."></textarea>
                            </div>
                        `,
                        actions: [
                            {
                                id: 'cancel',
                                label: 'Cancel',
                                type: 'secondary',
                                handler: () => {
                                    rejectOnce(new Error('USER_CANCELLED'));
                                    void modal.close();
                                }
                            },
                            {
                                id: 'submit',
                                label: 'OK',
                                type: 'primary',
                                handler: () => {
                                    const textarea = document.getElementById('user-textarea') as HTMLTextAreaElement;
                                    const value = textarea?.value?.trim() || '';
                                    if (value) {
                                        resolveOnce(value);
                                        void modal.close();
                                    } else {
                                        textarea?.focus();
                                    }
                                }
                            }
                        ]
                    },
                    {
                        title: 'Enter Text',
                        maxWidth: '500px'
                    },
                    {
                        onOpen: () => {
                            void void setTimeout(() => {
                                const textarea = document.getElementById('user-textarea') as HTMLTextAreaElement;
                                if (textarea) {
                                    textarea.focus();
                                }
                            }, 100);
                        },
                        onClose: () => {
                            if (!isResolved) {
                                rejectOnce(new Error('USER_CANCELLED'));
                            }
                        }
                    }
                );
            }).catch(error => {
                reject(new Error(`Failed to load modal system: ${error.message}`));
            });
        });
    }
    
    /**
     * Show a confirmation modal and return the user's choice
     */
    private async showConfirmModal(message: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            void import('../ui/modals/index').then(({ showGenericModal }) => {
                let isResolved = false;
                
                const resolveOnce = (value: boolean) => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(value);
                    }
                };

                const modal = showGenericModal(
                    {
                        content: `
                            <div style="margin-bottom: 1.5rem;">
                                <p style="font-size: 1rem; color: #374151; margin: 0;">
                                    ${message}
                                </p>
                            </div>
                        `,
                        actions: [
                            {
                                id: 'no',
                                label: 'No',
                                type: 'secondary',
                                handler: () => {
                                    resolveOnce(false);
                                    void modal.close();
                                }
                            },
                            {
                                id: 'yes',
                                label: 'Yes',
                                type: 'primary',
                                handler: () => {
                                    resolveOnce(true);
                                    void modal.close();
                                }
                            }
                        ]
                    },
                    {
                        title: 'Confirm',
                        maxWidth: '400px'
                    },
                    {
                        onClose: () => {
                            if (!isResolved) {
                                resolveOnce(false);
                            }
                        }
                    }
                );
            }).catch(error => {
                reject(new Error(`Failed to load modal system: ${error.message}`));
            });
        });
    }
}

// Global singleton instance
let promptExpansionService: PromptExpansionService;

export function createPromptExpansionService(settingsManager: SettingsManager): PromptExpansionService {
    if (!promptExpansionService) {
        promptExpansionService = new PromptExpansionService(settingsManager);
    }
    return promptExpansionService;
} 