import { SimpleModal } from './core/SimpleModal';
import { createElement } from './core/modal-utils';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { ConditionalContextEditor } from '../components/ConditionalContextEditor';

interface ConditionalContextModalConfig {
    id: string;
    node: DocumentNode;
    projectManager: ProjectManager;
}

export class ConditionalContextModal extends SimpleModal {
    private node: DocumentNode;
    private projectManager: ProjectManager;
    private editor!: ConditionalContextEditor;

    constructor(config: ConditionalContextModalConfig) {
        super({ id: config.id, closable: true, backdrop: true, width: '90vw', height: '90vh' });
        this.node = config.node;
        this.projectManager = config.projectManager;
    }

    public override async close(): Promise<void> {
        this.editor.destroy();
        await super.close();
    }

    public render(): HTMLElement {
        const container = createElement('div', { classes: ['conditional-context-modal'] });
        // Host container for embedded editor
        const host = createElement('div');
        host.style.cssText = 'display:flex; flex-direction: column; gap: 1rem; width: 100%; height: 100%; min-height: 40vh;';
        container.appendChild(host);

        // Mount reusable editor
        this.editor = new ConditionalContextEditor({ node: this.node, projectManager: this.projectManager, showPreview: true, showInheritedByDefault: true });
        this.editor.mount(host);

        return container;
    }

}



