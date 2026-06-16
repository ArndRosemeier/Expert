export class ProjectTemplate {
    name: string;
    hierarchyLevels: string[];
    /**
     * Optional, index-aligned with `hierarchyLevels`. For each layer this is a
     * fuzzy target output length in paragraphs (e.g. 5 => "aim for ~4-6
     * paragraphs"), or null when no length hint is configured for that layer.
     * This is ONLY a hint passed to the LLM and is never enforced.
     */
    layerLengths: (number | null)[];

    constructor(name: string, hierarchyLevels: string[], layerLengths: (number | null)[] = []) {
        this.name = name;
        this.hierarchyLevels = hierarchyLevels;
        // Keep lengths aligned with the hierarchy: pad with nulls / truncate.
        this.layerLengths = hierarchyLevels.map((_, i) => layerLengths[i] ?? null);
    }
} 
