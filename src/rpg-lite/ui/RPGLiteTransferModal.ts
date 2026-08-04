import { RPGLiteSession, RPGLiteStartPreset } from '../types/RPGLiteTypes';
import { RPGLiteTransferSelection } from '../types/RPGLiteTransferTypes';

/**
 * Modal that lets the user pick sessions and templates to include in a file export.
 */
export class RPGLiteTransferModal {
  /**
   * Shows the save selection dialog.
   * Resolves with the chosen ids, or null if cancelled.
   */
  public showSaveSelection(
    sessions: RPGLiteSession[],
    templates: RPGLiteStartPreset[]
  ): Promise<RPGLiteTransferSelection | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'rpg-lite-action-editor-overlay';
      overlay.innerHTML = `
        <div class="rpg-lite-action-editor-modal rpg-lite-transfer-modal">
          <div class="rpg-lite-action-editor-header">
            <h3>Save to File</h3>
            <button class="rpg-lite-action-editor-close" type="button" title="Close">✕</button>
          </div>
          <div class="rpg-lite-action-editor-body">
            <p class="rpg-lite-transfer-hint">Choose sessions and templates to include in the export file.</p>
            <div class="rpg-lite-transfer-toolbar">
              <button type="button" class="rpg-lite-btn rpg-lite-btn-sm" id="rpg-lite-transfer-select-all">Select All</button>
              <button type="button" class="rpg-lite-btn rpg-lite-btn-sm" id="rpg-lite-transfer-select-none">Select None</button>
            </div>
            <div class="rpg-lite-transfer-section">
              <div class="rpg-lite-transfer-section-title">Sessions</div>
              <div class="rpg-lite-transfer-checklist" id="rpg-lite-transfer-sessions">
                ${this.renderSessionCheckboxes(sessions)}
              </div>
            </div>
            <div class="rpg-lite-transfer-section">
              <div class="rpg-lite-transfer-section-title">Templates</div>
              <div class="rpg-lite-transfer-checklist" id="rpg-lite-transfer-templates">
                ${this.renderTemplateCheckboxes(templates)}
              </div>
            </div>
          </div>
          <div class="rpg-lite-action-editor-footer">
            <button type="button" class="rpg-lite-btn rpg-lite-btn-secondary" id="rpg-lite-transfer-cancel">Cancel</button>
            <button type="button" class="rpg-lite-btn rpg-lite-btn-primary" id="rpg-lite-transfer-confirm">Save</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const confirmBtn = overlay.querySelector('#rpg-lite-transfer-confirm') as HTMLButtonElement;
      const cancelBtn = overlay.querySelector('#rpg-lite-transfer-cancel') as HTMLButtonElement;
      const closeBtn = overlay.querySelector('.rpg-lite-action-editor-close') as HTMLButtonElement;
      const selectAllBtn = overlay.querySelector('#rpg-lite-transfer-select-all') as HTMLButtonElement;
      const selectNoneBtn = overlay.querySelector('#rpg-lite-transfer-select-none') as HTMLButtonElement;

      const cleanup = (): void => {
        overlay.remove();
      };

      const setAllChecked = (checked: boolean): void => {
        overlay.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
          input.checked = checked;
        });
      };

      const handleConfirm = (): void => {
        const sessionIds = Array.from(
          overlay.querySelectorAll<HTMLInputElement>('input[data-transfer-kind="session"]:checked')
        ).map((input) => {
          const id = input.dataset['transferId'];
          if (!id) throw new Error('Session checkbox is missing data-transfer-id.');
          return id;
        });

        const templateIds = Array.from(
          overlay.querySelectorAll<HTMLInputElement>('input[data-transfer-kind="template"]:checked')
        ).map((input) => {
          const id = input.dataset['transferId'];
          if (!id) throw new Error('Template checkbox is missing data-transfer-id.');
          return id;
        });

        if (sessionIds.length === 0 && templateIds.length === 0) {
          alert('Select at least one session or template.');
          return;
        }

        cleanup();
        resolve({ sessionIds, templateIds });
      };

      const handleCancel = (): void => {
        cleanup();
        resolve(null);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
      selectAllBtn.addEventListener('click', () => { setAllChecked(true); });
      selectNoneBtn.addEventListener('click', () => { setAllChecked(false); });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleCancel();
      });
    });
  }

  private renderSessionCheckboxes(sessions: RPGLiteSession[]): string {
    if (sessions.length === 0) {
      return `<div class="rpg-lite-transfer-empty">No sessions</div>`;
    }
    return sessions.map((session) => `
      <label class="rpg-lite-transfer-item">
        <input
          type="checkbox"
          checked
          data-transfer-kind="session"
          data-transfer-id="${this.escapeAttr(session.id)}"
        />
        <span class="rpg-lite-transfer-item-text">
          <span class="rpg-lite-transfer-item-name">${this.escapeHtml(session.title)}</span>
          <span class="rpg-lite-transfer-item-meta">${session.conversation.length} msgs</span>
        </span>
      </label>
    `).join('');
  }

  private renderTemplateCheckboxes(templates: RPGLiteStartPreset[]): string {
    if (templates.length === 0) {
      return `<div class="rpg-lite-transfer-empty">No templates</div>`;
    }
    return templates.map((template) => `
      <label class="rpg-lite-transfer-item">
        <input
          type="checkbox"
          checked
          data-transfer-kind="template"
          data-transfer-id="${this.escapeAttr(template.id)}"
        />
        <span class="rpg-lite-transfer-item-text">
          <span class="rpg-lite-transfer-item-name">${this.escapeHtml(template.name)}</span>
          <span class="rpg-lite-transfer-item-meta">${this.escapeHtml(template.title)}</span>
        </span>
      </label>
    `).join('');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(text: string): string {
    return this.escapeHtml(text);
  }
}
