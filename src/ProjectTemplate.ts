export class ProjectTemplate {
    name: string;
    hierarchyLevels: string[];

    constructor(name: string, hierarchyLevels: string[]) {
        this.name = name;
        this.hierarchyLevels = hierarchyLevels;
    }
} 