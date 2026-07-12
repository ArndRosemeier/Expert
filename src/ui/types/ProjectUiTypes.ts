import type { IdeaBoard } from '../../idea-board/IdeaBoard';
import type { Rating } from '../../types/RatingTypes';
import type { LoopHistoryItem } from '../../LoopOrchestrator';
import type { GenerationSession } from '../../DocumentNode';
import type { OrchestratorPrompts } from '../../PromptManager';
import type { ManualModal } from '../modals/ManualModal';

export interface ProgressInfo {
  message: string;
  current: number;
  total: number;
}

export interface ProgressUIData {
  operations?: ProgressInfo;
  iterations?: ProgressInfo;
  stages?: ProgressInfo;
  detail?: string;
  model?: string;
}

export interface AiProgressDetail {
  type: 'start' | 'update' | 'complete';
  message: string;
  characters: number;
}

export interface ImportedVersionJson {
  id: string;
  content: string;
  title: string;
  tags: string[];
  timestamp: string | number | Date;
  ratings?: Rating[];
  creatorModel?: string;
  metadata?: Record<string, unknown>;
}

export interface NodeImportData {
  id?: string;
  title: string;
  content?: string;
  context?: string;
  children?: NodeImportData[];
  versions?: ImportedVersionJson[];
  generationPrompt?: string | null;
  generationHistory?: LoopHistoryItem[];
  generationSessions?: GenerationSession[];
  collapsed?: boolean;
  conditionalContextItems?: unknown;
  creatorModel?: string;
}

export interface ConditionalContextHostElement extends HTMLElement {
  __ccEditor?: { destroy?: () => void };
  __ccSelectListener?: EventListener;
}

export interface ExpertTrackedElement extends HTMLElement {
  _eventManagerSetup?: boolean;
  _expertEventListener?: (e: Event) => void;
  _expertHandler?: (e: Event) => void;
  _saveTimeout?: ReturnType<typeof setTimeout>;
}

export interface ExpertDocument extends Document {
  _globalSearchHandler?: (e: KeyboardEvent) => void;
}

export type ExpertGlobalThis = typeof globalThis & {
  deterministicChildCreationState?: boolean;
};

export function syncDeterministicChildCreationGlobal(value: boolean): void {
  (globalThis as ExpertGlobalThis).deterministicChildCreationState = value;
}

declare global {
  interface Window {
    currentIdeaBoard?: IdeaBoard;
    _lastEscapePress?: number;
    _escapeCount?: number;
    updateProgressUI?: (data: ProgressUIData) => void;
    clearProgressUI?: () => void;
    showGenerationOverlay?: () => void;
    hideGenerationOverlay?: () => void;
    manualModal?: ManualModal;
    debugPrompts?: () => OrchestratorPrompts | undefined;
  }
}
