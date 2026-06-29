/**
 * Component for editing quality criteria
 */

import { QualityCriterion, LLMCriterion, MetricCriterion, MetricType, isMetricCriterion } from '../../../types';
import { DEFAULT_CRITERIA } from '../../../SettingsManager';
import { getAllMetricDefinitions, getMetricDefinition } from '../../../quality/metrics/MetricRegistry';
import { createElement, autoResizeTextarea } from '../core/modal-utils';

export interface CriteriaChangeEvent {
    criteria: QualityCriterion[];
}

export class CriteriaEditor {
    private container: HTMLElement;
    private criteria: QualityCriterion[] = [];
    private changeHandlers: ((event: CriteriaChangeEvent) => void)[] = [];

    constructor(container: HTMLElement) {
        this.container = container;
        this.initializeStyles();
        void this.render();
    }

    /**
     * Gets the current criteria
     */
    public getCriteria(): QualityCriterion[] {
        return this.extractCriteriaFromUI();
    }

    /**
     * Sets the criteria and re-renders
     */
    public setCriteria(criteria: QualityCriterion[]): void {
        this.criteria = this.migrateCriteriaFormat(criteria);
        void this.render();
        this.emitChange();
    }

    /**
     * Adds a new criterion
     */
    public addCriterion(criterion?: Partial<LLMCriterion>): void {
        const newCriterion: LLMCriterion = {
            kind: 'llm',
            name: "New Criterion...",
            goal: 8,
            description: "",
            outline: true,
            leaf: true,
            ...criterion
        };

        const criteriaList = this.container.querySelector('.criteria-list') as HTMLElement;
        const newElement = this.createCriterionElement(newCriterion);
        criteriaList.appendChild(newElement);

        // Focus the new criterion for editing
        const textarea = newElement.querySelector('textarea');
        if (textarea) {
            textarea.style.display = 'block';
            textarea.focus();
            autoResizeTextarea(textarea);
            const textDisplay = newElement.querySelector('.criterion-text-display') as HTMLElement;
            if (textDisplay) {
                textDisplay.style.display = 'none';
            }
        }

        this.emitChange();
    }

    /**
     * Adds a new deterministic metric criterion, defaulting to the first
     * registered metric type with its default parameters.
     */
    public addMetric(): void {
        const definitions = getAllMetricDefinitions();
        const first = definitions[0];
        if (!first) {
            throw new Error('No metric definitions are registered.');
        }
        const newMetric = this.buildDefaultMetric(first.type);

        const criteriaList = this.container.querySelector('.criteria-list') as HTMLElement;
        criteriaList.appendChild(this.createMetricCriterionElement(newMetric));
        this.emitChange();
    }

    /**
     * Builds a metric criterion populated with the registry defaults for the
     * given metric type.
     */
    private buildDefaultMetric(metricType: MetricType): MetricCriterion {
        const definition = getMetricDefinition(metricType);
        const params = JSON.parse(JSON.stringify(definition.defaultParams));
        const metric = {
            kind: 'metric',
            name: definition.label,
            metricType,
            params,
            weight: 2,
            enabled: true,
            description: definition.label,
            goal: 8,
            outline: true,
            leaf: true
        } as MetricCriterion;
        return metric;
    }

    /**
     * Removes a criterion by index
     */
    public removeCriterion(index: number): void {
        const criteriaList = this.container.querySelector('.criteria-list') as HTMLElement;
        const criterionElements = criteriaList.querySelectorAll('.criterion');
        if (index >= 0 && index < criterionElements.length && criterionElements[index]) {
            criterionElements[index].remove();
            this.emitChange();
        }
    }

    /**
     * Resets to default criteria
     */
    public resetToDefaults(): void {
        if (confirm("This will replace your current criteria list with the application defaults. Are you sure?")) {
            this.setCriteria([...DEFAULT_CRITERIA]);
        }
    }

    /**
     * Copies criteria to clipboard
     */
    public async copyCriteria(): Promise<void> {
        const criteria = this.extractCriteriaFromUI();
        if (criteria.length > 0) {
            try {
                await navigator.clipboard.writeText(JSON.stringify(criteria, null, 2));
                alert('Criteria copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy criteria: ', err);
                alert('Failed to copy criteria. See console for details.');
            }
        } else {
            alert('No criteria to copy.');
        }
    }

    /**
     * Pastes criteria from clipboard
     */
    public async pasteCriteria(): Promise<void> {
        try {
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text);
            if (this.isCriteriaArray(parsed)) {
                if (confirm('Are you sure you want to replace your current criteria with the content from your clipboard?')) {
                    this.setCriteria(parsed);
                }
            } else {
                alert('Clipboard content is not valid criteria data.');
            }
        } catch (err) {
            console.error('Failed to paste criteria: ', err);
            alert('Failed to read from clipboard or parse data. See console for details.');
        }
    }

    /**
     * Registers a change handler
     */
    public onChange(handler: (event: CriteriaChangeEvent) => void): void {
        this.changeHandlers.push(handler);
    }

    /**
     * Removes a change handler
     */
    public offChange(handler: (event: CriteriaChangeEvent) => void): void {
        const index = this.changeHandlers.indexOf(handler);
        if (index > -1) {
            this.changeHandlers.splice(index, 1);
        }
    }

    /**
     * Validates criteria data
     */
    public validateCriteria(criteria: QualityCriterion[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!Array.isArray(criteria)) {
            errors.push('Criteria must be an array');
            return { valid: false, errors };
        }

        criteria.forEach((criterion, index) => {
            if (!criterion.name || criterion.name.trim() === '') {
                errors.push(`Criterion ${index + 1}: Name is required`);
            }

            if (typeof criterion.goal !== 'number' || criterion.goal < 1 || criterion.goal > 10) {
                errors.push(`Criterion ${index + 1}: Goal must be between 1 and 10`);
            }

            if (criterion.outline === false && criterion.leaf === false) {
                errors.push(`Criterion ${index + 1}: Must be enabled for at least outline or leaf nodes`);
            }
        });

        return { valid: errors.length === 0, errors };
    }

    /**
     * Renders the criteria editor
     */
    private render(): void {
        this.container.innerHTML = '';

        // Actions bar
        const actionsBar = createElement('div', {
            classes: ['criteria-actions']
        });

        const addButton = createElement('button', {
            classes: ['btn-primary'],
            content: 'Add Criterion'
        });
        addButton.addEventListener('click', () => { this.addCriterion(); });

        const addMetricButton = createElement('button', {
            classes: ['btn-primary'],
            content: 'Add Metric'
        });
        addMetricButton.addEventListener('click', () => { this.addMetric(); });

        const defaultsButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Reset to Defaults'
        });
        defaultsButton.addEventListener('click', () => { this.resetToDefaults(); });

        const copyButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Copy All'
        });
        copyButton.addEventListener('click', async () => this.copyCriteria());

        const pasteButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Paste'
        });
        pasteButton.addEventListener('click', async () => this.pasteCriteria());

        actionsBar.appendChild(addButton);
        actionsBar.appendChild(addMetricButton);
        actionsBar.appendChild(defaultsButton);
        actionsBar.appendChild(copyButton);
        actionsBar.appendChild(pasteButton);

        // Criteria list
        const criteriaList = createElement('div', {
            classes: ['criteria-list']
        });

        // Add event delegation for remove buttons
        criteriaList.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('remove-criterion-btn')) {
                (e.target as HTMLElement).closest('.criterion')?.remove();
                this.emitChange();
            }
        });

        // Add event delegation for input changes
        criteriaList.addEventListener('input', () => {
            this.emitChange();
        });

        criteriaList.addEventListener('change', () => {
            this.emitChange();
        });

        this.container.appendChild(actionsBar);
        this.container.appendChild(criteriaList);

        // Render existing criteria
        this.criteria.forEach(criterion => {
            if (isMetricCriterion(criterion)) {
                criteriaList.appendChild(this.createMetricCriterionElement(criterion));
                return;
            }
            const element = this.createCriterionElement(criterion);
            criteriaList.appendChild(element);
            const textarea = element.querySelector('textarea');
            if (textarea) {
                autoResizeTextarea(textarea);
            }
        });
    }

    /**
     * Creates a criterion element
     */
    private createCriterionElement(criterion: QualityCriterion): HTMLElement {
        const div = createElement('div', {
            classes: ['criterion']
        });

        // Combine name and description for full text editing
        const fullText = criterion.description 
            ? `${criterion.name}. ${criterion.description}`
            : criterion.name;

        const textarea = createElement('textarea', {
            attributes: {
                placeholder: "e.g., 'Clarity and conciseness'",
                value: fullText
            }
        }) as HTMLTextAreaElement;

        textarea.addEventListener('input', (e) => {
            autoResizeTextarea(e.target as HTMLTextAreaElement);
        });
        
        textarea.addEventListener('focus', function() { 
            this.selectionStart = this.selectionEnd = this.value.length; 
        });

        const goalInput = createElement('input', {
            attributes: {
                type: 'number',
                min: '1',
                max: '10',
                value: criterion.goal.toString(),
                title: 'Goal (1-10)'
            }
        }) as HTMLInputElement;

        // Create checkboxes for outline and leaf
        const outlineCheckbox = createElement('input', {
            classes: ['outline-checkbox'],
            attributes: {
                type: 'checkbox',
                title: 'Use for outline/branch nodes'
            }
        }) as HTMLInputElement;
        outlineCheckbox.checked = criterion.outline !== false; // Default to true if undefined

        const leafCheckbox = createElement('input', {
            classes: ['leaf-checkbox'],
            attributes: {
                type: 'checkbox',
                title: 'Use for leaf nodes'
            }
        }) as HTMLInputElement;
        leafCheckbox.checked = criterion.leaf !== false; // Default to true if undefined
        
        const removeBtn = createElement('button', {
            classes: ['remove-criterion-btn'],
            innerHTML: '&times;',
            attributes: {
                title: 'Remove criterion'
            }
        });

        const textDisplay = createElement('div', {
            classes: ['criterion-text-display']
        });

        const textareaContainer = createElement('div', {
            attributes: {
                style: 'flex-grow: 1; position: relative;'
            }
        });

        // Store the full text in a data attribute to ensure we never lose it
        div.setAttribute('data-full-text', fullText);

        const updateDisplay = (text: string) => {
            textDisplay.textContent = text.split('.')[0] + (text.includes('.') && text.split('.')[0] !== text ? '.' : '');
        };
        
        updateDisplay(fullText);
        textarea.value = fullText;
        textarea.style.display = 'none';

        textDisplay.addEventListener('click', () => {
            // When editing starts, ensure textarea has the full text (name + description)
            const storedFullText = div.getAttribute('data-full-text') || fullText;
            textarea.value = storedFullText;
            textDisplay.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
            autoResizeTextarea(textarea);
        });

        textarea.addEventListener('blur', () => {
            // When editing ends, store the full text and update display
            div.setAttribute('data-full-text', textarea.value);
            textarea.style.display = 'none';
            textDisplay.style.display = 'block';
            updateDisplay(textarea.value);
        });
        
        textareaContainer.appendChild(textDisplay);
        textareaContainer.appendChild(textarea);
        
        div.appendChild(textareaContainer);
        div.appendChild(goalInput);
        div.appendChild(outlineCheckbox);
        div.appendChild(leafCheckbox);
        div.appendChild(removeBtn);

        return div;
    }

    /**
     * Creates a DOM element for editing a deterministic metric criterion. The
     * parameter controls are generated from the metric definition's paramSchema
     * so new metrics are editable without changing this component.
     */
    private createMetricCriterionElement(criterion: MetricCriterion): HTMLElement {
        const div = createElement('div', { classes: ['criterion', 'metric-criterion'] });
        div.setAttribute('data-description', criterion.description);

        const header = createElement('div', { classes: ['metric-header'] });

        const nameInput = createElement('input', {
            classes: ['metric-name'],
            attributes: { type: 'text', value: criterion.name, placeholder: 'Metric name', title: 'Display name' }
        }) as HTMLInputElement;

        const typeSelect = createElement('select', {
            classes: ['metric-type'],
            attributes: { title: 'Metric type' }
        }) as HTMLSelectElement;
        for (const definition of getAllMetricDefinitions()) {
            const option = createElement('option', {
                content: definition.label,
                attributes: { value: definition.type }
            }) as HTMLOptionElement;
            if (definition.type === criterion.metricType) {
                option.selected = true;
            }
            typeSelect.appendChild(option);
        }

        const goalInput = createElement('input', {
            classes: ['metric-goal'],
            attributes: { type: 'number', min: '1', max: '10', value: criterion.goal.toString(), title: 'Goal (1-10) — must be met to pass' }
        }) as HTMLInputElement;

        const weightInput = createElement('input', {
            classes: ['metric-weight'],
            attributes: { type: 'number', min: '0', step: '0.5', value: criterion.weight.toString(), title: 'Weight — only ranks failing attempts, not pass/fail' }
        }) as HTMLInputElement;

        const enabledCheckbox = createElement('input', {
            classes: ['metric-enabled'],
            attributes: { type: 'checkbox', title: 'Enabled' }
        }) as HTMLInputElement;
        enabledCheckbox.checked = criterion.enabled;

        const outlineCheckbox = createElement('input', {
            classes: ['outline-checkbox'],
            attributes: { type: 'checkbox', title: 'Use for outline/branch nodes' }
        }) as HTMLInputElement;
        outlineCheckbox.checked = criterion.outline !== false;

        const leafCheckbox = createElement('input', {
            classes: ['leaf-checkbox'],
            attributes: { type: 'checkbox', title: 'Use for leaf nodes' }
        }) as HTMLInputElement;
        leafCheckbox.checked = criterion.leaf !== false;

        const removeBtn = createElement('button', {
            classes: ['remove-criterion-btn'],
            innerHTML: '&times;',
            attributes: { title: 'Remove criterion' }
        });

        header.appendChild(nameInput);
        header.appendChild(typeSelect);
        header.appendChild(goalInput);
        header.appendChild(weightInput);
        header.appendChild(enabledCheckbox);
        header.appendChild(outlineCheckbox);
        header.appendChild(leafCheckbox);
        header.appendChild(removeBtn);

        const paramsContainer = createElement('div', { classes: ['metric-params'] });
        this.renderMetricParams(paramsContainer, criterion.metricType, criterion.params);

        // Switching the metric type regenerates the parameter controls using the
        // newly selected metric's schema and defaults.
        typeSelect.addEventListener('change', () => {
            const newType = typeSelect.value as MetricType;
            const definition = getMetricDefinition(newType);
            this.renderMetricParams(paramsContainer, newType, definition.defaultParams);
            this.emitChange();
        });

        div.appendChild(header);
        div.appendChild(paramsContainer);
        return div;
    }

    /**
     * Renders the parameter controls for a metric into the given container,
     * driven by the metric definition's paramSchema.
     */
    private renderMetricParams(container: HTMLElement, metricType: MetricType, params: unknown): void {
        container.innerHTML = '';
        const definition = getMetricDefinition(metricType);
        const paramRecord = params as Record<string, unknown>;

        for (const field of definition.paramSchema) {
            const fieldWrapper = createElement('div', { classes: ['metric-param-field'] });
            const label = createElement('label', { classes: ['metric-param-label'], content: field.label });
            fieldWrapper.appendChild(label);

            if (field.type === 'number') {
                const value = typeof paramRecord[field.key] === 'number' ? String(paramRecord[field.key]) : '0';
                const input = createElement('input', {
                    classes: ['metric-param-control'],
                    attributes: {
                        type: 'number',
                        value,
                        'data-param-key': field.key,
                        'data-param-type': 'number'
                    }
                }) as HTMLInputElement;
                if (field.min !== undefined) input.min = String(field.min);
                if (field.max !== undefined) input.max = String(field.max);
                if (field.step !== undefined) input.step = String(field.step);
                fieldWrapper.appendChild(input);
            } else {
                const list = Array.isArray(paramRecord[field.key]) ? (paramRecord[field.key] as string[]) : [];
                const textarea = createElement('textarea', {
                    classes: ['metric-param-control'],
                    attributes: {
                        'data-param-key': field.key,
                        'data-param-type': 'stringList',
                        value: list.join('\n')
                    }
                }) as HTMLTextAreaElement;
                textarea.value = list.join('\n');
                fieldWrapper.appendChild(textarea);
            }

            container.appendChild(fieldWrapper);
        }
    }

    /**
     * Reconstructs a metric criterion from a metric row's controls, preserving
     * the strongly-typed params shape defined by the metric registry.
     */
    private extractMetricCriterion(div: HTMLElement): MetricCriterion | null {
        const nameInput = div.querySelector<HTMLInputElement>('.metric-name');
        const typeSelect = div.querySelector<HTMLSelectElement>('.metric-type');
        const goalInput = div.querySelector<HTMLInputElement>('.metric-goal');
        const weightInput = div.querySelector<HTMLInputElement>('.metric-weight');
        const enabledCheckbox = div.querySelector<HTMLInputElement>('.metric-enabled');
        const outlineCheckbox = div.querySelector<HTMLInputElement>('.outline-checkbox');
        const leafCheckbox = div.querySelector<HTMLInputElement>('.leaf-checkbox');

        if (!nameInput || !typeSelect || !goalInput || !weightInput || !enabledCheckbox || !outlineCheckbox || !leafCheckbox) {
            return null;
        }

        const metricType = typeSelect.value as MetricType;
        const definition = getMetricDefinition(metricType);
        const params: Record<string, unknown> = JSON.parse(JSON.stringify(definition.defaultParams));

        const controls = div.querySelectorAll<HTMLElement>('.metric-param-control');
        controls.forEach(control => {
            const key = control.getAttribute('data-param-key');
            const paramType = control.getAttribute('data-param-type');
            if (!key) return;
            if (paramType === 'number') {
                params[key] = parseFloat((control as HTMLInputElement).value);
            } else {
                params[key] = (control as HTMLTextAreaElement).value
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
            }
        });

        const goal = parseInt(goalInput.value, 10);
        const weight = parseFloat(weightInput.value);
        // params is built dynamically from the metric's paramSchema, so it is a
        // generic record here; the schema guarantees it matches the metric type.
        const metric = {
            kind: 'metric',
            name: nameInput.value,
            metricType,
            params,
            weight: isNaN(weight) ? 1 : weight,
            enabled: enabledCheckbox.checked,
            description: div.getAttribute('data-description') || nameInput.value,
            goal: isNaN(goal) ? 8 : goal,
            outline: outlineCheckbox.checked,
            leaf: leafCheckbox.checked
        } as unknown as MetricCriterion;
        return metric;
    }

    /**
     * Extracts criteria from the UI
     */
    private extractCriteriaFromUI(): QualityCriterion[] {
        const criteria: QualityCriterion[] = [];
        const criterionElements = this.container.querySelectorAll('.criterion');
        
        criterionElements.forEach(el => {
            const div = el as HTMLElement;

            // Metric rows are reconstructed from their dedicated controls so their
            // metricType/params/weight are preserved across edits.
            if (div.classList.contains('metric-criterion')) {
                const metric = this.extractMetricCriterion(div);
                if (metric) {
                    criteria.push(metric);
                }
                return;
            }

            const textarea = el.querySelector<HTMLTextAreaElement>('textarea');
            const goalInput = el.querySelector<HTMLInputElement>('input[type="number"]');
            const outlineCheckbox = el.querySelector<HTMLInputElement>('.outline-checkbox');
            const leafCheckbox = el.querySelector<HTMLInputElement>('.leaf-checkbox');
            
            if (textarea && goalInput && outlineCheckbox && leafCheckbox) {
                // Use the full text from data attribute, fall back to textarea value
                const fullText = div.getAttribute('data-full-text') || textarea.value;
                const goal = parseInt(goalInput.value, 10);
                const outline = outlineCheckbox.checked;
                const leaf = leafCheckbox.checked;
                
                if (fullText && !isNaN(goal)) {
                    // Parse the full text to extract name and description
                    const firstDotIndex = fullText.indexOf('.');
                    let name: string;
                    let description: string | undefined;
                    
                    if (firstDotIndex !== -1 && firstDotIndex < fullText.length - 1) {
                        // Has description after first period
                        name = fullText.substring(0, firstDotIndex);
                        description = fullText.substring(firstDotIndex + 1).trim();
                    } else {
                        // No description, just the name
                        name = fullText;
                        description = undefined;
                    }
                    
                    const criterion: QualityCriterion = { kind: 'llm', name, goal, outline, leaf };
                    if (description) {
                        criterion.description = description;
                    }
                    criteria.push(criterion);
                }
            }
        });
        
        return criteria;
    }

    /**
     * Validates if data is a criteria array
     */
    private isCriteriaArray(data: unknown): data is QualityCriterion[] {
        return Array.isArray(data) && data.every(item =>
            typeof item === 'object' &&
            item !== null &&
            'name' in item &&
            'goal' in item &&
            typeof item.name === 'string' &&
            typeof item.goal === 'number' &&
            // Optional properties - if present, must be boolean
            (item.outline === undefined || typeof item.outline === 'boolean') &&
            (item.leaf === undefined || typeof item.leaf === 'boolean') &&
            (item.description === undefined || typeof item.description === 'string')
        );
    }

    /**
     * Migrates criteria format for compatibility
     */
    private migrateCriteriaFormat(criteria: QualityCriterion[]): QualityCriterion[] {
        return criteria.map(criterion => {
            // Metric criteria are preserved verbatim (their metricType/params must
            // never be stripped), only filling in outline/leaf/enabled defaults.
            if (isMetricCriterion(criterion)) {
                // Spreading a discriminated union widens the discriminant, so we
                // re-assert the concrete MetricCriterion type after filling defaults.
                return {
                    ...criterion,
                    outline: criterion.outline !== undefined ? criterion.outline : true,
                    leaf: criterion.leaf !== undefined ? criterion.leaf : true,
                    enabled: criterion.enabled !== undefined ? criterion.enabled : true
                } as MetricCriterion;
            }

            const migrated: QualityCriterion = {
                kind: 'llm',
                name: criterion.name,
                goal: criterion.goal,
                outline: criterion.outline !== undefined ? criterion.outline : true,
                leaf: criterion.leaf !== undefined ? criterion.leaf : true
            };

            if (criterion.description) {
                migrated.description = criterion.description;
            }

            return migrated;
        });
    }

    /**
     * Emits a change event
     */
    private emitChange(): void {
        const criteria = this.extractCriteriaFromUI();
        this.changeHandlers.forEach(handler => {
            handler({ criteria });
        });
    }

    /**
     * Initializes component styles
     */
    private initializeStyles(): void {
        const style = createElement('style', {
            innerHTML: `
                .criteria-actions {
                    margin-bottom: 1rem;
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                
                .criteria-actions .btn-primary,
                .criteria-actions .btn-secondary {
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .criteria-actions .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                }
                
                .criteria-actions .btn-primary:hover {
                    background-color: #2563eb;
                }
                
                .criteria-actions .btn-secondary {
                    background-color: #6b7280;
                    color: white;
                }
                
                .criteria-actions .btn-secondary:hover {
                    background-color: #4b5563;
                }
                
                .criteria-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .criterion {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    background-color: #f9fafb;
                    transition: border-color 0.2s;
                }
                
                .criterion:hover {
                    border-color: #d1d5db;
                }
                
                .criterion-text-display {
                    min-height: 1.5rem;
                    padding: 0.5rem;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: background-color 0.2s;
                    font-size: 0.9rem;
                    color: #374151;
                }
                
                .criterion-text-display:hover {
                    background-color: #e5e7eb;
                }
                
                .criterion textarea {
                    width: 100%;
                    min-height: 2.5rem;
                    font-family: inherit;
                    padding: 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    resize: vertical;
                    font-size: 0.9rem;
                    line-height: 1.4;
                    box-sizing: border-box;
                }
                
                .criterion textarea:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .criterion input[type="number"] {
                    width: 50px;
                    height: 32px;
                    padding: 0.25rem 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    text-align: center;
                    font-size: 0.9rem;
                    flex-shrink: 0;
                    box-sizing: border-box;
                }
                
                .criterion input[type="number"]:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .criterion input[type="checkbox"] {
                    /* Override global checkbox styling for criteria editor */
                    width: 20px !important;
                    height: 20px !important;
                    margin: 0 !important;
                    cursor: pointer;
                    border: 2px solid #d1d5db !important;
                    border-radius: 4px !important;
                    background-color: white !important;
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    position: relative !important;
                    transition: all 0.2s ease !important;
                    flex-shrink: 0 !important;
                    align-self: center;
                }
                
                .criterion input[type="checkbox"]:checked {
                    background-color: #3b82f6 !important;
                    border-color: #3b82f6 !important;
                }
                
                .criterion input[type="checkbox"]:checked::after {
                    content: "" !important;
                    position: absolute !important;
                    left: 6px !important;
                    top: 2px !important;
                    width: 6px !important;
                    height: 10px !important;
                    border: solid white !important;
                    border-width: 0 2px 2px 0 !important;
                    transform: rotate(45deg) !important;
                }
                
                .criterion input[type="checkbox"]:hover {
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                }
                
                .remove-criterion-btn {
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    cursor: pointer;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background-color 0.2s;
                    flex-shrink: 0;
                    line-height: 1;
                }
                
                .remove-criterion-btn:hover {
                    background-color: #dc2626;
                }

                .criterion.metric-criterion {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 0.5rem;
                    background-color: #eef2ff;
                    border-color: #c7d2fe;
                }

                .metric-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }

                .metric-header .metric-name {
                    flex: 1 1 10rem;
                    min-width: 8rem;
                    height: 32px;
                    padding: 0.25rem 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    box-sizing: border-box;
                }

                .metric-header select {
                    height: 32px;
                    padding: 0.25rem 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    background: white;
                }

                .metric-header .metric-goal,
                .metric-header .metric-weight {
                    width: 56px;
                    height: 32px;
                    padding: 0.25rem 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    text-align: center;
                    font-size: 0.9rem;
                    box-sizing: border-box;
                }

                .metric-params {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding-left: 0.25rem;
                }

                .metric-param-field {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }

                .metric-param-label {
                    font-size: 0.8rem;
                    font-weight: 500;
                    color: #4b5563;
                }

                .metric-param-control {
                    width: 100%;
                    padding: 0.4rem 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    font-family: inherit;
                    box-sizing: border-box;
                }

                textarea.metric-param-control {
                    min-height: 4rem;
                    resize: vertical;
                    line-height: 1.4;
                }
            `
        });

        // Add styles to the container's parent or document head
        const existingStyle = document.querySelector('#criteria-editor-styles');
        if (!existingStyle) {
            style.id = 'criteria-editor-styles';
            document.head.appendChild(style);
        }
    }
} 