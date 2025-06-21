export class ProjectTemplate {
    name: string;
    hierarchyLevels: string[];
    scaffoldingDocuments: string[];

    constructor(name: string, hierarchyLevels: string[], scaffoldingDocuments: string[]) {
        this.name = name;
        this.hierarchyLevels = hierarchyLevels;
        this.scaffoldingDocuments = scaffoldingDocuments;
    }
} 