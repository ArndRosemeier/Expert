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
        level?: number;
        template?: string[];
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
        lengthHint?: string;
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
    expandPrompt(template: string, context: PlaceholderContext = {}, overrideLanguage?: string | null): string {
        let expanded = template;
        
        // If overrideLanguage is provided, inject it into the context
        if (overrideLanguage !== undefined && overrideLanguage !== null) {
            context = {
                ...context,
                project: {
                    ...context.project,
                    language: overrideLanguage
                }
            };
        }
        
        // Dice-roll selection: {{selectonefrom a;b;c}} -> one random option.
        expanded = this.expandSelectOneFrom(expanded);
        
        // Handle global placeholders (check overrides first)
        for (const [name, provider] of this.globalProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                // Check for override first
                const overrideValue = context.globalOverrides?.[name];
                const value = overrideValue ?? provider().value;
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
    async expandPromptAsync(template: string, context: PlaceholderContext = {}, overrideLanguage?: string | null): Promise<string> {
        let expanded = template;
        
        // If overrideLanguage is provided, inject it into the context
        if (overrideLanguage !== undefined && overrideLanguage !== null) {
            context = {
                ...context,
                project: {
                    ...context.project,
                    language: overrideLanguage
                }
            };
        }
        
        // Dice-roll selection: {{selectonefrom a;b;c}} -> one random option.
        expanded = this.expandSelectOneFrom(expanded);
        
        // Handle global placeholders (check overrides first)
        for (const [name, provider] of this.globalProviders) {
            const placeholder = `{{${name}}}`;
            if (expanded.includes(placeholder)) {
                // Check for override first
                const overrideValue = context.globalOverrides?.[name];
                const value = overrideValue ?? provider().value;
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
        
        // Argument-based dice-roll selection
        placeholders['selectonefrom a;b;c'] = 'Roll a die and return one of the listed options. Separate with semicolons (or commas when no semicolon is present), e.g. {{selectonefrom sword;axe;bow}}.';
        
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
            
            // Handle dice-roll selection: {{selectonefrom a;b;c}} (or comma-separated)
            if (placeholderName.startsWith('selectonefrom')) {
                const isValidSelectOneFrom = /^selectonefrom\s+\S[^}]*$/.test(placeholderName);
                if (!isValidSelectOneFrom) {
                    errors.push(`Invalid selectonefrom placeholder: {{${placeholderName}}} - use {{selectonefrom a;b;c}} (semicolons, or commas when no semicolon is present)`);
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

    /**
     * Expand every {{selectonefrom a;b;c}} occurrence by rolling a die and
     * returning one of the listed options. Semicolon is the separator; when the
     * argument list contains no semicolon, commas are accepted instead (friendlier
     * for simple lists). Whitespace around each option is trimmed and empty
     * options are ignored. Re-rolls on every expansion (like {{noise_names}}).
     *
     * Public so callers that inject raw text (e.g. RPG Lite's adventure/prefix
     * context) can support the placeholder without running the full expansion.
     */
    expandSelectOneFrom(template: string): string {
        return template.replace(/\{\{selectonefrom\s+([^}]*)\}\}/gi, (_full: string, rawArgs: string): string => {
            const separator = rawArgs.includes(';') ? ';' : ',';
            const options = rawArgs.split(separator).map(option => option.trim()).filter(option => option.length > 0);
            if (options.length === 0) {
                return '';
            }
            const index = Math.floor(Math.random() * options.length);
            return options[index]!;
        });
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

        // Language placeholder - use context provider to access project language
        this.registerContextPlaceholder('language', (context) => ({
            value: context?.project?.language ?? this.settingsManager.getLanguage(),
            description: 'Current project language setting'
        }));

        // Noise seed for creative naming inspiration
        this.registerGlobalPlaceholder('noise_names', () => ({
            value: this.generateNoiseNames(),
            description: 'Random naming inspiration patterns to help avoid common/clichéd names. Use these as creative springboards for unique character names - avoid using numbers, hyphens, or apostrophes in actual names.'
        }));

        // Noise seed for creative OPENING inspiration (structure/atmosphere/entry point).
        // Concrete random seeds nudge the model out of default "attractor" openings.
        this.registerGlobalPlaceholder('noise_opening', () => ({
            value: this.generateOpeningEntropy(),
            description: 'Random opening inspiration (a structural entry strategy, concrete givens like time/weather/sense/complication, and an oblique nudge) to push scene openings away from clichéd defaults. Apply only where it fits the established setting.'
        }));
        
        // Context-dependent placeholders
        this.registerContextPlaceholder('project_title', (context) => ({
            value: context.project!.title!,
            description: 'Current project title'
        }));
        
        this.registerContextPlaceholder('criteria', (context) => ({
            value: context.custom?.['criteria'] ?? formatCriteriaAsJson(context.project!.criteria!),
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

        this.registerContextPlaceholder('level_name', (context) => ({
            value: this.getNodeLevelLabel(context),
            description: "Name of the current node's template layer (e.g. Book, Act, Chapter), with any trailing count removed"
        }));

        this.registerContextPlaceholder('output_kind', (context) => {
            const levelLabel = this.getNodeLevelLabel(context);
            const isLeaf = context.node?.isLeaf === true;
            const value = isLeaf ? 'PROSE' : `${levelLabel.toUpperCase()} OUTLINE`;
            return {
                value,
                description: "What this node produces: 'PROSE' for leaf nodes, or '<LEVEL> OUTLINE' (e.g. CHAPTER OUTLINE) for branch nodes"
            };
        });
        
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
            value: context.generation!.generateCount ?? `exactly ${context.generation!.count!} entries`,
            description: 'Smart count instruction for generation'
        }));
        
        this.registerContextPlaceholder('child_count', (context) => ({
            value: this.getChildCountInstruction(context),
            description: 'Smart count instruction for child section creation'
        }));
        
        this.registerContextPlaceholder('draftorfresh', (context) => ({
            value: context.generation!.draftOrFresh!,
            description: 'Draft or fresh content instruction'
        }));

        // Optional fuzzy output-length hint. Expands to '' when no length is
        // configured for the node's layer, so prompts can always include it.
        this.registerContextPlaceholder('length_hint', (context) => ({
            value: context.generation?.lengthHint ?? '',
            description: 'Optional fuzzy output-length guideline (paragraphs) for this layer; empty when unset'
        }));
        
        this.registerContextPlaceholder('parent_content', (context) => ({
            value: context.generation!.parentContent!,
            description: 'Content of parent node'
        }));

        // Prompt-specific placeholders
        this.registerContextPlaceholder('prompt', (context) => ({
            value: context.custom?.['prompt'] ?? context.prompt!.userPrompt!,
            description: 'User prompt text'
        }));
        
        this.registerContextPlaceholder('lastResponse', (context) => ({
            value: context.custom?.['lastResponse'] ?? context.prompt!.lastResponse!,
            description: 'Previous AI response'
        }));
        
        this.registerContextPlaceholder('editorAdvice', (context) => ({
            value: context.custom?.['editorAdvice'] ?? context.prompt!.editorAdvice!,
            description: 'Editor advice for improvement'
        }));
        
        this.registerContextPlaceholder('originalPrompt', (context) => ({
            value: context.custom?.['originalPrompt'] ?? context.prompt!.originalPrompt!,
            description: 'Original user prompt'
        }));
        
        this.registerContextPlaceholder('response', (context) => ({
            value: context.custom?.['response'] ?? context.prompt!.response!,
            description: 'AI response text'
        }));
        
        this.registerContextPlaceholder('ratings', (context) => ({
            value: context.custom?.['ratings'] ?? JSON.stringify(context.prompt!.ratings!, null, 2),
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
            value: context.analysis!.nodeTitle ?? context.node!.title!,
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
            if (quotedMatch?.[1]) {
                title = quotedMatch[1];
            } else {
                // Check for unquoted title: {{input Title}}
                const unquotedMatch = match.match(/\{\{input\s+([^}"\s]+)\}\}/);
                if (unquotedMatch?.[1]) {
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
            if (selectMatch?.[1] && selectMatch[2]) {
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
            if (multilineMatch?.[1]) {
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
            if (confirmMatch?.[1]) {
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
     * Generate random pronounceable names for creative naming inspiration
     */
    private generateNoiseNames(): string {
        const strategies = [
            this.celticNamingStrategy(),
            this.norseNamingStrategy(),
            this.softConsonantStrategy(),
            this.hardConsonantStrategy(),
            this.flowingVowelStrategy(),
            this.genreFantasyStrategy(),
            this.genreSciFiStrategy(),
            this.syllablePatternStrategy(),
            this.culturalBlendStrategy(),
            this.uncommonRealNamesStrategy()
        ];
        
        // Randomly select 1-2 strategies (30% chance for 2 strategies)
        const selectedCount = Math.random() < 0.3 ? 2 : 1;
        const selected: string[] = [];
        const usedIndices = new Set<number>();
        
        while (selected.length < selectedCount && usedIndices.size < strategies.length) {
            const index = Math.floor(Math.random() * strategies.length);
            if (!usedIndices.has(index)) {
                const strategy = strategies[index];
                if (strategy) {
                    usedIndices.add(index);
                    selected.push(strategy);
                }
            }
        }
        
        return selected.join('\n\n');
    }

    /**
     * Build a random "entropy seed" block for scene OPENINGS. Unlike a vague
     * "be creative" instruction, this injects concrete, randomly-chosen tokens
     * (a structural entry strategy, a few concrete givens, an oblique nudge) that
     * the model conditions on, moving the completion between distribution modes
     * rather than merely jittering within the default one.
     */
    private generateOpeningEntropy(): string {
        const strategies = [
            'In medias res — begin mid-action, already in motion, and let the situation explain itself.',
            'Dialogue-first — open on a line already being spoken, before any scene-setting.',
            'Aftermath — open just after something has happened; the scene is the consequences, not the event.',
            'Interruption — open at the moment a normal routine is broken by something unexpected.',
            'Environmental — open on the place itself, letting one charged detail carry the mood before anyone acts.',
            'Mundane-derailed — open on something small and ordinary that quietly goes wrong.',
            'Sensory cold-open — open inside a single vivid sensation and widen out from it.',
            'Off-center — open on a peripheral character, object, or event rather than the obvious focal point.',
            'Arrival — open at the instant of crossing a threshold into somewhere new.',
            'Countdown — open with something already ticking toward a deadline or consequence.'
        ];
        const times = [
            'just before dawn', 'high noon', 'the long light of late afternoon', 'dusk',
            'deep night', 'the small hours', 'an overcast midday', 'first light'
        ];
        const weathers = [
            'cold drizzle', 'dry heat', 'a rising wind', 'still and heavy air', 'thin fog',
            'the wet calm after rain', 'unseasonable cold', 'oppressive humidity', 'a hard clear frost', 'distant thunder'
        ];
        const senses = [
            'smell', 'sound', 'temperature', 'texture', 'taste',
            'the quality of the light', 'an absence of an expected sound'
        ];
        const complications = [
            'something nearby is already broken or malfunctioning',
            'two people nearby are mid-argument',
            'something expected is conspicuously missing',
            'someone is waiting, impatient',
            'a small task has just failed',
            'an unfamiliar figure is watching',
            'a minor rule is being broken in plain sight',
            'something is running late'
        ];
        const constraints = [
            'withhold the obvious — reveal the central fact sideways rather than stating it',
            'let one concrete detail contradict what the player would expect',
            'begin with something incomplete or unfinished',
            'anchor the scene to one specific object and return to it',
            'name something that would normally go unmentioned'
        ];

        const strategy = this.shuffle(strategies)[0]!;
        const time = this.shuffle(times)[0]!;
        const weather = this.shuffle(weathers)[0]!;
        const sense = this.shuffle(senses)[0]!;
        const complication = this.shuffle(complications)[0]!;
        const constraint = this.shuffle(constraints)[0]!;

        // Include a random subset of concrete givens so the block varies each run.
        const givens: string[] = [];
        if (Math.random() < 0.8) givens.push(`Time: ${time}`);
        if (Math.random() < 0.7) givens.push(`Weather / atmosphere: ${weather}`);
        if (Math.random() < 0.7) givens.push(`Foreground this sense: ${sense}`);
        if (Math.random() < 0.7) givens.push(`Already in progress: ${complication}`);
        if (givens.length === 0) givens.push(`Time: ${time}`);

        const lines = [
            '🎲 ENTROPY SEEDS (random inspiration to break away from the default/obvious opening — apply ONLY where they fit the established setting; never bend the setting to force a seed):',
            `- Opening approach: ${strategy}`,
            ...givens.map(g => `- ${g}`),
            `- Oblique nudge: ${constraint}`
        ];
        return lines.join('\n');
    }

    private celticNamingStrategy(): string {
        const starts = ['Bra-', 'Mor-', 'Tal-', 'Car-', 'Rhi-', 'Bran-', 'Cel-', 'Mael-'];
        const ends = ['-wen', '-oc', '-is', '-on', '-eth', '-yn'];
        const shuffled = this.shuffle([...starts]).slice(0, 3);
        const endShuffled = this.shuffle([...ends]).slice(0, 2);
        
        return `🎲 Celtic Pattern Generator (GENERATE NEW - Don't use fragments shown):
Syllable Starts: ${shuffled.join(', ')}
Syllable Ends: ${endShuffled.join(', ')}
Rules: soft consonants (b,c,m,w,r) + flowing vowels (a,e,i,o) + Welsh endings
→ CREATE YOUR OWN combinations using these phonetic rules, NOT the fragments above`;
    }

    private norseNamingStrategy(): string {
        const starts = ['Vig-', 'Hraf-', 'Sol-', 'Bjor-', 'As-', 'Hal-', 'Thor-', 'Sig-'];
        const ends = ['-dis', '-veig', '-orn', '-rid', '-mund', '-run'];
        const shuffled = this.shuffle([...starts]).slice(0, 3);
        const endShuffled = this.shuffle([...ends]).slice(0, 2);
        
        return `🎲 Norse Pattern Generator (GENERATE NEW - Don't use fragments shown):
Syllable Starts: ${shuffled.join(', ')}
Syllable Ends: ${endShuffled.join(', ')}
Rules: strong consonants (v,h,b,k,t) + compact vowels + Nordic endings
→ CREATE YOUR OWN combinations using these phonetic rules, NOT the fragments above`;
    }

    private softConsonantStrategy(): string {
        const consonants = ['l', 'm', 'n', 'r', 's'];
        const vowels = ['a', 'e', 'i'];
        const shuffledC = this.shuffle([...consonants]).slice(0, 3);
        const shuffledV = this.shuffle([...vowels]).slice(0, 2);
        
        return `🎲 Soft Flow Pattern (GENERATE NEW - Don't use components shown):
Soft Consonants: ${shuffledC.join(', ')}
Open Vowels: ${shuffledV.join(', ')}
Structure: 2-3 syllables with gentle sounds
→ MIX these phonemes into NEW lyrical names, don't copy directly`;
    }

    private hardConsonantStrategy(): string {
        const clusters = ['kr-', 'th-', 'br-', 'gr-', 'dr-', 'str-', 'bl-'];
        const ends = ['-on', '-or', '-ar', '-en', '-ax', '-ix'];
        const shuffledC = this.shuffle([...clusters]).slice(0, 3);
        const shuffledE = this.shuffle([...ends]).slice(0, 2);
        
        return `🎲 Strong Cluster Pattern (GENERATE NEW - Don't use fragments shown):
Opening Clusters: ${shuffledC.join(', ')}
Firm Endings: ${shuffledE.join(', ')}
Rules: bold consonant start + short vowel + decisive ending
→ COMBINE into NEW powerful names, not using fragments above`;
    }

    private flowingVowelStrategy(): string {
        const vowelPairs = ['ae-', 'ea-', 'ia-', 'io-', 'ei-', 'ai-'];
        const softCons = ['l', 'r', 'n', 'm', 's'];
        const shuffledV = this.shuffle([...vowelPairs]).slice(0, 3);
        const shuffledC = this.shuffle([...softCons]).slice(0, 2);
        
        return `🎲 Vowel Harmony Pattern (GENERATE NEW - Don't use components shown):
Vowel Sequences: ${shuffledV.join(', ')}
Soft Bridges: ${shuffledC.join(', ')}
Rules: multiple vowels flow together with gentle consonant bridges
→ WEAVE these sounds into NEW ethereal names, don't reuse fragments`;
    }

    private genreFantasyStrategy(): string {
        const unique = ['x', 'y', 'z', 'th', 'ae', 'k'];
        const vowels = ['a', 'e', 'i', 'o'];
        const shuffledU = this.shuffle([...unique]).slice(0, 3);
        const shuffledV = this.shuffle([...vowels]).slice(0, 2);
        
        return `🎲 Fantasy Style Pattern (GENERATE NEW - Don't use components shown):
Exotic Sounds: ${shuffledU.join(', ')}
Core Vowels: ${shuffledV.join(', ')}
Structure: 2-3 syllables, pronounceable but distinctive
→ INVENT fresh fantasy names using these phonetic elements creatively`;
    }

    private genreSciFiStrategy(): string {
        const tech = ['x', 'z', 'k', 'v', 'j'];
        const crisp = ['yn', 'ex', 'ax', 'ix', 'on'];
        const shuffledT = this.shuffle([...tech]).slice(0, 3);
        const shuffledC = this.shuffle([...crisp]).slice(0, 2);
        
        return `🎲 Sci-Fi Pattern (GENERATE NEW - Don't use components shown):
Tech Sounds: ${shuffledT.join(', ')}
Crisp Syllables: ${shuffledC.join(', ')}
Rules: short (1-2 syllables), sharp consonants, futuristic feel
→ FORGE NEW sci-fi names from these sound elements, not the examples`;
    }

    private syllablePatternStrategy(): string {
        const cStart = ['K', 'M', 'T', 'S', 'R', 'B', 'D'];
        const cMid = ['r', 'd', 'l', 'n', 't'];
        const vowels = ['a', 'e', 'i', 'o'];
        const shuffledS = this.shuffle([...cStart]).slice(0, 3);
        const shuffledM = this.shuffle([...cMid]).slice(0, 2);
        const shuffledV = this.shuffle([...vowels]).slice(0, 2);
        
        return `🎲 Syllable Structure Pattern (GENERATE NEW - Don't use components shown):
Start Consonants: ${shuffledS.join(', ')}
Middle Consonants: ${shuffledM.join(', ')}
Vowels: ${shuffledV.join(', ')}
Template: [C][V][C]-[V]-[C][V][C]
→ BUILD NEW balanced names following this rhythm, not using exact letters above`;
    }

    private culturalBlendStrategy(): string {
        const roots = ['Latin', 'Greek', 'Arabic', 'Celtic', 'Nordic', 'Slavic'];
        const shuffled = this.shuffle([...roots]).slice(0, 2);
        
        return `🎲 Cultural Fusion Pattern (GENERATE NEW):
Blend These: ${shuffled.join(' + ')}
Rules: 2-3 syllables, natural flow, international feel
→ FUSE phonetic elements from these traditions into NEW cohesive names`;
    }

    private uncommonRealNamesStrategy(): string {
        const cultures = ['Scandinavian', 'Greek', 'Arabic', 'Celtic', 'Slavic', 'Hebrew'];
        const shuffled = this.shuffle([...cultures]).slice(0, 2);
        
        return `🎲 Authentic Name Pattern (GENERATE NEW):
Source Cultures: ${shuffled.join(', ')}
Rules: lesser-known authentic names, clear pronunciation, grounded feel
→ RESEARCH and use real but uncommon names from these traditions`;
    }
    
    private shuffle<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = result[i];
            if (temp !== undefined && result[j] !== undefined) {
                result[i] = result[j]!;
                result[j] = temp;
            }
        }
        return result;
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

    /**
     * Get the clean name of the current node's template layer (e.g. "Chapter"),
     * stripping any trailing count like "Chapter 4" -> "Chapter".
     */
    private getNodeLevelLabel(context: PlaceholderContext): string {
        const template = context.node?.template;
        const level = context.node?.level;
        if (!template || typeof level !== 'number') {
            return 'section';
        }
        const raw = template[level];
        if (!raw) {
            return 'section';
        }
        const cleaned = String(raw).replace(/\s+\d+\s*$/, '').trim();
        return cleaned.length > 0 ? cleaned : String(raw);
    }

    /**
     * Get child count instruction based on template definition for the level below current node
     */
    private getChildCountInstruction(context: PlaceholderContext): string {
        // Minimal text as requested: either "some" or "exactly X"
        // Try to infer child count from the next level name (e.g., "Chapter 4")
        const template = context.node?.template;
        const level = context.node?.level;
        if (!template || typeof level !== 'number') {
            return 'some';
        }
        const childLevelIndex = level + 1;
        const childLevelName = template[childLevelIndex];
        if (!childLevelName) {
            return 'some';
        }
        const nameToParse: string = String(childLevelName);
        const match = nameToParse.match(/\b(\d+)\b/);
        if (!match) {
            return 'some';
        }
        const count = parseInt(match[1]!, 10);
        if (!Number.isFinite(count) || count <= 0) {
            return 'some';
        }
        return `exactly ${count}`;
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