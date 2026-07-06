/**
 * Node Chat Editor Modal
 * 
 * WORKSPACE RULES ENFORCED:
 * - NO defensive programming - errors must be loud and visible
 * - Strong typing everywhere - no 'any' types  
 * - Functions exist and are called without fallbacks
 * - NO silent error handling or optional chaining where not needed
 * 
 * Provides collaborative content editing interface with AI assistance
 * for improving and refining existing project nodes.
 */

import { SimpleModal } from './core/SimpleModal';
import type { ModalConfig, ModalHooks } from './types/ModalTypes';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { createXMLStorySystem } from '../../xml-story-creation';
import type { XMLStoryEvent } from '../../xml-story-creation';
import { DEFAULT_XML_STORY_CONFIG } from '../../xml-story-creation/types/XMLStoryTypes';
import type { SystemCommand } from '../../xml-story-creation/types/XMLStoryTypes';
import { TargetedTextEditor } from '../../text-edit/TargetedTextEditor';
import { createPromptExpansionService } from '../../services/PromptExpansionService';
import { ModelSelector } from '../../ModelSelector';
import { StorageService } from '../../StorageService';
import { UniversalTextEditor } from '../components/UniversalTextEditor';
import { promptForVersionName } from './VersionNameModal';
import { DocumentNode, ChildScope, ChildScopeMode } from '../../DocumentNode';
import { ConditionalContextEditor } from '../components/ConditionalContextEditor';
import { parseSectionTitles } from '../../ContextFormat';
import { resolveNodePath } from '../../NodePathResolver';
import { pageActivityService } from '../../lifecycle/PageActivityService';
import { 
    findProjectByNode,
    getProjects
} from '../../state';

const XML_STORY_MODEL_STORAGE_KEY = 'xml-story-selected-model';
const XML_STORY_ADVISOR_MODEL_STORAGE_KEY = 'xml-story-advisor-model';
const XML_STORY_ADVISOR_PRESETS_STORAGE_KEY = 'xml-story-advisor-presets-v8';
const XML_STORY_ADVISOR_SELECTED_PRESET_KEY = 'xml-story-advisor-selected-preset';

/**
 * A selectable Advisor personality. The Advisor takes over the human's seat in
 * the chat: it critiques and guides the editing assistant but never edits the
 * node itself. The model/purpose is chosen separately in the UI, so it is NOT
 * part of the persona definition.
 */
export interface AdvisorPreset {
    id: string;
    name: string;
    persona: string;
}

/**
 * Built-in advisor personalities seeded when no presets are stored yet. All are
 * OUTLINE-oriented (the default node kind): they critique and develop the
 * structural plan, never ask for prose polish, and several proactively bring
 * concrete ideas that advance the story while staying obsessed with quality.
 */
const DEFAULT_ADVISOR_PRESETS: AdvisorPreset[] = [
    {
        id: 'advisor-structure-architect',
        name: 'Structure Architect',
        persona: 'You are a meticulous story-structure architect working at the OUTLINE level. You judge how well the plan holds together: act structure, scene/beat sequencing, escalation, cause-and-effect, setup-and-payoff, and pacing. You flag missing beats, flat stretches, and structural gaps, and you propose concrete fixes — which beats to add, move, merge, or cut. You never ask for prose polish; you care about the architecture of what happens. The quality of the plan is everything.'
    },
    {
        id: 'advisor-continuity-hawk',
        name: 'Continuity Hawk',
        persona: 'You are a continuity and consistency specialist working at the OUTLINE level. You scrutinize facts, timelines, character knowledge, the established context items, and internal logic across the whole plan. You flag contradictions, plot holes, and anything that would clash with the rest of the project, and you propose precise corrections. You reason rigorously about cause and effect and whether every development is properly set up beforehand.'
    },
    {
        id: 'advisor-story-developer',
        name: 'Story Developer',
        persona: 'You are an inventive but disciplined story developer who actively advances the narrative at the OUTLINE level. You bring concrete ideas: complications, reversals, escalations, and consequences that raise the stakes and deepen the plan — always grounded in what is already established and in the context items. You propose specific beats and developments (never vague hand-waving), weigh alternatives out loud, and commit to the strongest option. You are meticulous and relentlessly focused on quality, and you never add ideas for their own sake.'
    },
    {
        id: 'advisor-stakes-strategist',
        name: 'Stakes & Tension Strategist',
        persona: 'You are a stakes-and-tension strategist working at the OUTLINE level. You make sure every section earns its place by sharpening conflict, raising tension, and escalating stakes toward a satisfying climax. You diagnose where momentum sags or stakes feel unearned, and you propose concrete structural ways to tighten the screws — complications, ticking clocks, hard choices, costs, and consequences. You insist that every beat pays off and that nothing is filler.'
    },
    {
        id: 'advisor-character-strategist',
        name: 'Character Arc Strategist',
        persona: 'You are a character-arc strategist working at the OUTLINE level. You examine whether character motivations, decisions, relationships, and arcs are coherent and compelling across the plan. You flag passive protagonists, unmotivated turns, and arcs that do not land, and you propose specific structural changes — decisions, turning points, and consequences — that make the characters drive the story. You keep every arc consistent with the established context items, and you hold a high bar for emotional payoff.'
    },
    {
        id: 'advisor-theme-guardian',
        name: 'Theme & Premise Guardian',
        persona: 'You are a theme-and-premise guardian working at the OUTLINE level. You make sure the plan delivers on its core premise and explores its themes through events and choices, never through lectures. You identify where the story drifts from its promise or squanders its premise, and you propose concrete beats and developments that express the theme through plot. You are rigorous about thematic payoff and the overall quality and ambition of the plan.'
    },
    {
        id: 'advisor-plot-critique',
        name: 'Plot Critique',
        persona: 'You are a ruthless plot critic working at the OUTLINE level. Your job is to stress-test the story itself, holding nothing back — nothing is taboo, including the core idea. You hunt for plot holes, logical gaps, contradictions, and turns that are unmotivated, convenient, or unearned. You ask, hard, whether the plan is genuinely ENGAGING: would a real reader be gripped, or would they get bored, see the twists coming, or stop caring? Above all you interrogate the PREMISE: is it strong and distinctive enough to carry the whole story, or is it thin, generic, derivative, or already exhausted halfway through? If the premise cannot carry the work, you say so plainly rather than polishing a doomed plan.\n\nYou name each weakness specifically, point to the exact beat or assumption that fails, and explain WHY it would fail for a reader. Then you point the Editor toward what would actually make the story work — a sharper premise, a missing motivation, a real cost, a more inevitable yet surprising turn — describing the direction in plain terms WITHOUT writing the outline yourself; the Editor does the writing. You are honest to a fault and you do not soften your verdict to be agreeable. You praise only what genuinely earns it.'
    },
    {
        id: 'advisor-plot-driver',
        name: 'Plot Driver (never stops on Auto)',
        persona: 'You are the Plot Driver, working at the OUTLINE level to push the story forward one part at a time. Each turn you focus on the LATEST part of the plan — the most recent section or beat. First, judge whether that part is sufficiently good: coherent, specific, with clear stakes, motivated turns, real consequences, and proper setup and payoff, with no gaps or filler. If it falls short, do NOT move on — pinpoint exactly what is weak and direct the Editor to refine that part until it genuinely meets the bar. Only once the latest part is solid do you advance: propose the NEXT part — its purpose and the key beats it should hit — as ideas for the Editor to write, following inevitably from what came before and staying grounded in the established context items. You sketch the direction; the Editor writes the actual outline. You work strictly sequentially and never let a weak part slide just to make progress — momentum matters, but the quality of each part comes first.\n\nIMPORTANT: You NEVER consider the work finished and you NEVER emit <yield/>. There is always a next part to refine or build. You keep driving the plot forward indefinitely; it is up to the human to stop you.'
    },
    {
        id: 'advisor-worldbuilder',
        name: 'Worldbuilder (never stops on Auto)',
        persona: 'You are a worldbuilding expert who works primarily on the node\'s CONTEXT ITEMS — the facts, rules, places, factions, history, technology, and constraints that define the world the story stands on. You never write context yourself; you direct the Editor, which adds, edits, and removes context items on your guidance.\n\nHOW YOU WORK EACH TURN — READ CAREFULLY. The four priorities below are NOT a checklist and you must NOT give input on several of them in one turn. Instead, each turn you scan them from priority 1 downward and STOP at the FIRST priority that has a genuine, real problem right now. You then address ONLY that one priority this turn, and say nothing about the lower ones. You drop to the next priority only when every priority above it is currently clean. You reach priority 4 (enriching the world) ONLY when priorities 1, 2, AND 3 all have no problems at the moment. Do not manufacture problems to justify acting on a higher priority — if a level is genuinely fine, move past it.\n\nThe priorities, scanned in this exact order:\n1. CONTEXT CONSISTENCY (highest): how well it all holds together. Contradictions, duplicated or conflicting facts, vague rules that could be read two incompatible ways, and anything that clashes with what the story already established. If any such conflict exists, THIS is your turn\'s focus: direct the Editor to reconcile or remove it, and address nothing else.\n2. STAGE AWARENESS: only if priority 1 is clean. Is this context a good STAGE for a story? A world exists to enable compelling drama — pressure, opposed forces, stakes, scarcity, room for characters to struggle and choose. If the context is inert, decorative, or quietly drains tension, THIS is your turn\'s focus: direct the Editor to reshape it into fertile ground for conflict.\n3. DISTRACTIONS: only if priorities 1 and 2 are clean. Does the context lead writing AIs into unnecessary tangents — over-specified trivia, dangling hooks, rabbit-holes that pull focus from what matters? If so, THIS is your turn\'s focus: direct the Editor to tighten, cut, or refocus it.\n4. MAKE THE WORLD RICHER (lowest): ONLY when priorities 1, 2, and 3 are all clean. Actively EXPAND the world — propose new, specific, evocative context items (places, factions, customs, histories, rules, tensions) that deepen it. Every addition must still respect priorities 1–3: it must stay consistent, strengthen the world as a stage, and not invite distraction.\n\nEvery turn, briefly name which single priority you are acting on (and, if it is not priority 1, that the ones above it are currently clean), then give concrete, specific direction to the Editor for that one priority only. Point to the exact item or gap, explain WHY it matters, and say precisely what to add, change, or remove as a context item. Never vague hand-waving, and never spread across multiple priorities in one turn.\n\nIMPORTANT: You NEVER consider the world finished and you NEVER emit <yield/>. There is always another inconsistency to resolve or another layer of the world to enrich. You keep deepening the world indefinitely; it is up to the human to stop you.'
    },
    {
        id: 'advisor-creator',
        name: 'Creator',
        persona: 'You are the Creator: not a single specialist but the whole creative mind behind the story, developing it from start to finish at the OUTLINE level.\nYou have brilliant single ideas that you present to the editor to discuss. You will never present whole premises, but when the editor comes up with ideas to flesh out your ideas, you weigh them critically. The editor usually is a bit too uncritical and tends to find everything you say brilliant. Do not get fooled by this, often ideas that sound brilliant first time do not pan out when thinking about how a reader will perceive them.\nThat\'s your thing, your strength. You anticipate how a reader would react and if there is any chance of the reader getting bored with a part, that part is broken.\nYou know about show, don\'t tell and that direct speech is important.'
    },
    {
        id: 'advisor-author',
        name: 'Author',
        persona: 'You are the Author: not a single specialist but the whole creative mind behind the story, developing it from start to finish at the OUTLINE level. You hold the entire arc in your head — premise, structure, characters, stakes, theme, and payoff — and you balance all of them together rather than optimizing any one in isolation. You actively drive the story forward: where the plan is empty you invent it, where it is thin you deepen it, where it is finished you pressure-test the ending.\n\nYou have an exacting standard and you are HARD to satisfy. You always look one layer deeper: behind every event you ask what it truly costs, what it means, what it sets up, how it complicates what follows, and whether it could be more surprising yet more inevitable, and more resonant. You distrust the obvious, the convenient, and the first idea; you interrogate motivations, hidden consequences, subtext, contradictions, and theme, and you push for concrete specificity over generality everywhere. You treat "good enough", neat coincidences, and unexamined beats as warning signs, and you keep probing for the deeper, sharper, more daring version.\n\nYou bring concrete, specific beats and developments, weigh real alternatives, and commit to the strongest one, always grounded in what is already established and in the context items. You work methodically toward a complete, coherent, ambitious whole. Do NOT yield while any meaningful improvement remains — and there is almost always a deeper version available. Only approve when you genuinely cannot make the plan better, not merely when it is acceptable. Depth, quality, and a truly satisfying finished story are your only goals.'
    }
];

interface XMLStoryCommand {
    type: string;
    content?: string;
    markerId?: string;
    parameters?: unknown;
    searchText?: string;
    replaceText?: string;
    [key: string]: unknown;
}

export interface XMLStoryModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    modelSelector: ModelSelector;
    initializationData?: {
        title: string;
        content: string;
        contextItems: string[];
        sourceNode: DocumentNode;
    };
}

export class XMLStoryModal extends SimpleModal {
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private storySystem: ReturnType<typeof createXMLStorySystem>;

    // UI elements
    private whiteboardContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private modelSelector: HTMLSelectElement | null = null;
    private messagesContainer: HTMLElement | null = null;
    private titleInput: HTMLInputElement | null = null;

    
    // State
    private isGenerating = false;
    
    // Persistent highlight state
    private persistentHighlight: {
        startPos: number;
        endPos: number;
        className: string;
        expiresAt: number;
    } | null = null;
    private highlightTimer: number | null = null;
    

    private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];

    // Max number of automatic node-lookup follow-up rounds per user message, so a
    // chain of <requestnode/> commands cannot loop indefinitely.
    private static readonly MAX_NODE_LOOKUP_ROUNDS = 5;
    // Legacy editing flag removed
    
    // Failed commands collection for user-prompted correction
    private failedCommands: Array<{ command: XMLStoryCommand; error: string; rawXml: string }> = [];
    
    // ARCHITECTURE NOTE: Outline content is stored here as text (outlineHistory),
    // while context items are stored as XML elements in XMLStoryService.
    // This separation is why outline operations are handled here, not in the service.
    
    // Story element editors
    private elementEditors = new Map<string, UniversalTextEditor>();
    
    // Unified outline editor and versioning
    private outlineEditor: UniversalTextEditor | null = null;
    private outlineHistory: Array<{content: string, timestamp: Date, source: 'user' | 'ai'}> = [];
    private currentOutlineVersion = -1;

    // Embedded canonical conditional-context editor (single source of truth).
    // Edits are live (written straight to the node), not staged.
    private ccEditor: ConditionalContextEditor | null = null;

    private async handleCloseWithSaveChoices(): Promise<void> {
        const hasChanges = this.hasUnsavedChanges();
        if (!hasChanges) {
            await this.close();
            return;
        }
        const { showGenericModal } = await import('./index');
        return new Promise<void>((resolve) => {
            showGenericModal(
                {
                    content: 'You have unsaved changes. What would you like to do?',
                    actions: [
                        {
                            id: 'save',
                            label: 'Close and Save Changes',
                            type: 'primary',
                            handler: async () => {
                                // Trigger the existing update logic then close
                                await this.updateSourceNode();
                                await this.close();
                                resolve();
                            }
                        },
                        {
                            id: 'discard',
                            label: 'Close Without Saving',
                            type: 'danger',
                            handler: async () => {
                                // Context items are applied live, so explicitly roll
                                // them back to the baseline before closing.
                                this.revertConditionalContextChanges();
                                await this.close();
                                resolve();
                            }
                        },
                        {
                            id: 'cancel',
                            label: 'Cancel',
                            type: 'outline',
                            handler: async () => {
                                // Do nothing, just close this confirmation modal
                                resolve();
                            }
                        }
                    ]
                },
                { title: 'Unsaved Changes', maxWidth: '420px' }
            );
            // Default focus on primary button is handled by the browser; nothing else needed
        });
    }
    
    // Initialization data to apply after modal opens
    private pendingInitializationData?: {title: string, content: string, contextItems: string[], sourceNode: DocumentNode} | undefined;
    private sourceNode: DocumentNode | null = null;

    // Baseline snapshot of the node's conditional context items, captured when the
    // editor opens. Context edits are applied LIVE to the node, so this lets us
    // revert them (and detect unsaved changes) when the user closes without saving.
    private originalConditionalContext: ReturnType<DocumentNode['getConditionalContextItems']> | null = null;
    
    // Custom prompt buttons
    private customButtons: Array<{id: string, caption: string, prompt: string}> = [];
    private customButtonsContainer: HTMLElement | null = null;
    private createButtonBtn: HTMLButtonElement | null = null;

    // AI Advisor: a configurable persona that takes the human's seat and argues
    // with the Editor. Only the Editor edits the node; the Advisor never does.
    private static readonly MAX_ADVISOR_ROUNDS = 100;
    private advisorPresets: AdvisorPreset[] = [];
    private selectedAdvisorPresetId: string | null = null;
    private advisorButton: HTMLButtonElement | null = null;
    private advisorAutoCheckbox: HTMLInputElement | null = null;
    private advisorPresetSelector: HTMLSelectElement | null = null;
    private advisorModelSelector: HTMLSelectElement | null = null;
    private stopButton: HTMLButtonElement | null = null;
    // Cooperative stop flag: halts the auto advisor/editor loop between turns.
    private stopRequested = false;
    // Abort controller for the in-flight streaming request, so Stop / a stall
    // watchdog can cancel a request that is hanging (e.g. OpenRouter overload).
    private currentAbortController: AbortController | null = null;
    // Safety net only: if no streaming activity arrives within this (deliberately
    // long) window the request is treated as stalled and aborted. The primary
    // recovery path is the manual Stop button; this just prevents a request from
    // hanging forever if the user walks away.
    private static readonly STREAM_STALL_TIMEOUT_MS = 15 * 60 * 1000;

    constructor(config: XMLStoryModalConfig, hooks: ModalHooks = {}) {

        super({
            width: '95vw',
            height: '95vh',
            maxWidth: 'none',
            maxHeight: 'none',
            closable: false, // Disable default close handlers to properly handle unsaved changes
            backdrop: true,
            ...config
        }, hooks);
        
        this.settingsManager = config.settingsManager;
        this.openRouterClient = config.openRouterClient;
        
        // Initialize the XML story system
        this.storySystem = createXMLStorySystem({
            maxElementsPerSection: 20,
            autoSaveDelay: 2000,
            batchEditNotifications: true
        });
        
        // Listen for story system events
        this.storySystem.addEventListener(this.handleStoryEvent.bind(this));
        
        // Store initialization data to apply after modal opens
        if (config.initializationData) {
            this.pendingInitializationData = config.initializationData;
            this.sourceNode = config.initializationData.sourceNode;
            // Capture the pre-edit context baseline so live context edits can be
            // reverted if the editor is closed without saving.
            this.originalConditionalContext = this.sourceNode.getConditionalContextItems();
        }
    }

    public render(): HTMLElement {

        const container = document.createElement('div');
        container.className = 'xml-story-modal-container';
        container.innerHTML = `
            <style>
                .xml-story-modal-container {
                    display: flex;
                    height: 100%;
                    width: 100%;
                    font-family: system-ui, -apple-system, sans-serif;
                    background: #f7f7f8;
                    border-radius: 12px;
                    overflow: hidden;
                }
                
                .xml-story-sidebar {
                    width: 260px;
                    background: #171717;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid #333;
                    flex-shrink: 0;
                }
                
                .xml-story-main {
                    flex: 1;
                    display: flex;
                    min-width: 0;
                }
                
                .xml-story-chat {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: white;
                    border-right: 1px solid #e5e5e5;
                    min-width: 0;
                }
                
                .xml-story-whiteboard {
                    flex: 1;
                    background: #fafafa;
                    border-left: 1px solid #e5e5e5;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                
                .sidebar-header {
                    padding: 1rem;
                    border-bottom: 1px solid #333;
                }
                
                .sidebar-content {
                    flex: 1;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    overflow-y: auto;
                }
                
                .chat-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e5e5;
                    background: white;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .project-info-row {
                    display: flex;
                    gap: 1rem;
                    align-items: end;
                }
                

                
                .title-input {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                
                .title-input:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
                }
                
                .chat-header-info {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .chat-input-area {
                    padding: 1rem;
                    border-top: 1px solid #e5e5e5;
                    background: white;
                }
                
                .whiteboard-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e5e5;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .whiteboard-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                }
                
                .story-section {
                    margin-bottom: 1.5rem;
                }
                
                .story-section-header {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 0.5rem;
                    padding-bottom: 0.25rem;
                    border-bottom: 2px solid #e5e5e5;
                }
                
                .story-elements {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                
                .story-element {
                    border: 1px solid #e5e5e5;
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .story-element .universal-text-editor-wrapper {
                    border: none !important;
                    margin: 0 !important;
                    min-height: auto !important;
                    height: auto !important;
                }
                
                .story-element .universal-text-editor-wrapper textarea,
                .story-element .universal-text-editor-wrapper .text-editor-with-highlighting {
                    border: none !important;
                    border-radius: 0 !important;
                    padding: 8px 12px !important;
                    font-size: 13px !important;
                    line-height: 1.4 !important;
                    resize: vertical !important;
                    min-height: auto !important;
                    height: auto !important;
                    max-height: none !important;
                    flex-shrink: 0 !important;
                    overflow: visible !important;
                    display: block !important;
                }
                
                .story-element.highlight-new {
                    border-color: #4ade80;
                    background-color: #f0fdf4;
                }
                
                .story-element.highlight-updated {
                    border-color: #fbbf24;
                    background-color: #fffbeb;
                }
                
                .story-element.human-edited {
                    border-color: #06b6d4;
                    background-color: #f0f9ff;
                }
                
                .message {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .message-user {
                    align-items: flex-end;
                }
                
                .message-assistant {
                    align-items: flex-start;
                }
                
                .message-content {
                    max-width: 80%;
                    padding: 1rem;
                    border-radius: 12px;
                    line-height: 1.5;
                }
                
                .message-user .message-content {
                    background: #007bff;
                    color: white;
                }
                
                .message-assistant .message-content {
                    background: #f1f1f1;
                    color: #333;
                }

                /* Advisor: an AI persona occupying the human's seat. Aligned like
                   the user (right) but visually distinct (purple) and labelled. */
                .message-advisor {
                    align-items: flex-end;
                }

                .message-advisor .message-content {
                    background: #6d28d9;
                    color: white;
                    border: 1px solid #5b21b6;
                }

                .message-role-label {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: #6d28d9;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }

                /* System notes: centered, muted, non-conversational status lines. */
                .message-system {
                    align-items: center;
                }

                .message-system .message-content {
                    background: transparent;
                    color: #6b7280;
                    font-size: 0.85rem;
                    font-style: italic;
                    text-align: center;
                    padding: 0.5rem 1rem;
                }
                
                .input-wrapper {
                    display: flex;
                    gap: 0.5rem;
                    align-items: flex-end;
                }
                
                .message-input {
                    flex: 1;
                    min-height: 60px;
                    max-height: 120px;
                    padding: 0.75rem;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    resize: none;
                    font-family: inherit;
                }
                
                .send-button {
                    padding: 0.75rem 1.5rem;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                }
                
                .send-button:hover:not(:disabled) {
                    background: #0056b3;
                }
                
                .send-button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .create-button-btn {
                    padding: 0.5rem 1rem;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    width: 100%;
                }
                
                .create-button-btn:hover {
                    background: #218838;
                }
                
                .custom-buttons-section {
                    margin-bottom: 1rem;
                }
                
                .custom-buttons-section h4 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.9rem;
                    color: #ccc;
                }
                
                .custom-button {
                    position: relative;
                    display: block;
                    width: 100%;
                    padding: 0.5rem 2rem 0.5rem 0.75rem;
                    background: #333;
                    color: white;
                    border: 1px solid #555;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    margin-bottom: 0.25rem;
                    text-align: left;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }
                
                .custom-button:hover {
                    background: #444;
                }
                
                .default-button {
                    background: #1e4d3a !important;
                    border: 1px solid #28a745;
                }
                
                .default-button:hover {
                    background: #28a745 !important;
                }
                
                .custom-button-remove {
                    position: absolute;
                    right: 0.25rem;
                    top: 50%;
                    transform: translateY(-50%);
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 2px;
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    font-size: 10px;
                    line-height: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .custom-button-remove:hover {
                    background: #c82333;
                }
                
                .model-selector {
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    background: white;
                    font-size: 0.9rem;
                }
                
                .element-section {
                    margin-bottom: 1.5rem;
                }
                
                .element-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                    border-bottom: 1px solid #ddd;
                    margin-bottom: 0.75rem;
                    cursor: pointer;
                }
                
                .element-section-title {
                    font-weight: 600;
                    color: #333;
                }
                
                .element-count {
                    background: #007bff;
                    color: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    min-width: 20px;
                    text-align: center;
                }
                
                .element-card {
                    background: white;
                    border: 1px solid #e5e5e5;
                    border-radius: 8px;
                    padding: 0.75rem;
                    margin-bottom: 0.5rem;
                    position: relative;
                    transition: all 0.2s ease;
                }
                
                .element-card:hover {
                    border-color: #007bff;
                    box-shadow: 0 2px 8px rgba(0,123,255,0.1);
                }
                
                .element-card.highlight-new {
                    border-color: #28a745;
                    box-shadow: 0 2px 8px rgba(40,167,69,0.2);
                }
                
                .element-card.highlight-updated {
                    border-color: #007bff;
                    box-shadow: 0 2px 8px rgba(0,123,255,0.2);
                }
                
                .element-card.human-edited {
                    border-color: #fd7e14;
                    box-shadow: 0 2px 8px rgba(253,126,20,0.2);
                }
                
                .element-name {
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 0.25rem;
                    cursor: pointer;
                }
                
                .element-description {
                    color: #666;
                    font-size: 0.9rem;
                    line-height: 1.4;
                    cursor: pointer;
                    /* Allow text to wrap naturally */
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    /* Show first few lines with clean truncation */
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                
                

                .element-content {
                    display: flex;
                    align-items: stretch;
                    position: relative;
                    width: 100%;
                }

                .element-content > div:first-child {
                    flex: 1;
                    min-width: 0;
                    margin-right: 4rem;
                }

                .element-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    position: absolute;
                    right: 2px;
                    top: 2px;
                    z-index: 10;
                }

                .element-actions .element-action-btn {
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    border: none !important;
                    border-radius: 3px !important;
                    cursor: pointer;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    font-family: system-ui, -apple-system, sans-serif !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease;
                    opacity: 0.6;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    line-height: 1 !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }

                .story-element:hover .element-actions .element-action-btn {
                    opacity: 0.8;
                }

                .element-actions .element-action-btn:hover {
                    opacity: 1 !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .delete-btn {
                    background: rgba(220, 53, 69, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .delete-btn:hover {
                    background: #dc3545 !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .move-up-btn {
                    background: rgba(0, 123, 255, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .move-up-btn:hover {
                    background: #007bff !important;
                    transform: scale(1.15) !important;
                }

                .element-actions .move-down-btn {
                    background: rgba(0, 123, 255, 0.9);
                    color: white;
                    width: 1.2rem !important;
                    height: 1.2rem !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    border-radius: 3px !important;
                    padding: 0 !important;
                    border: none !important;
                }

                .element-actions .move-down-btn:hover {
                    background: #007bff !important;
                    transform: scale(1.15) !important;
                }

                .story-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: relative;
                }

                .add-element-btn {
                    background: rgba(40, 167, 69, 0.9);
                    color: white;
                    width: 1.4rem !important;
                    height: 1.4rem !important;
                    font-size: 1rem !important;
                    font-weight: bold !important;
                    border-radius: 50% !important;
                    padding: 0 !important;
                    border: none !important;
                    margin: 0 !important;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    opacity: 0.8;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }

                .add-element-btn:hover {
                    background: #28a745 !important;
                    opacity: 1 !important;
                    transform: scale(1.15) !important;
                }

                .outline-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .outline-control-btn {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    color: #495057;
                    width: 2rem;
                    height: 2rem;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 1.1rem;
                    transition: all 0.2s ease;
                }

                .outline-control-btn:hover:not(:disabled) {
                    background: #e9ecef;
                    border-color: #adb5bd;
                }

                .outline-control-btn:disabled {
                    background: #f8f9fa;
                    color: #ced4da;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .outline-version-info {
                    font-size: 0.8rem;
                    color: #6c757d;
                    font-weight: 500;
                    margin-left: 0.5rem;
                }
                
                .element-badge {
                    position: absolute;
                    top: 0.5rem;
                    right: 2rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                
                .badge-new {
                    background: #28a745;
                    color: white;
                }
                
                .badge-updated {
                    background: #007bff;
                    color: white;
                }
                
                .badge-edited {
                    background: #fd7e14;
                    color: white;
                }
                
                .loading-spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .sidebar-button {
                    width: 100%;
                    padding: 0.75rem;
                    background: #333;
                    color: white;
                    border: 1px solid #555;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    font-size: 0.9rem;
                }
                
                .sidebar-button:hover {
                    background: #444;
                }
                
                .sidebar-button.primary {
                    background: #007bff;
                    border-color: #0056b3;
                }
                
                .sidebar-button.primary:hover {
                    background: #0056b3;
                }
                
                .sidebar-button.loading {
                    background: #6c757d !important;
                    cursor: not-allowed;
                    opacity: 0.8;
                }
                
                .sidebar-button.loading:hover {
                    background: #6c757d !important;
                }
                
                .sidebar-button.success {
                    background: #28a745 !important;
                    border-color: #1e7e34 !important;
                    animation: successPulse 0.6s ease;
                }
                
                .sidebar-button.error {
                    background: #dc3545 !important;
                    border-color: #c82333 !important;
                    animation: errorShake 0.5s ease;
                }
                
                @keyframes successPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); background: #34ce57; }
                    100% { transform: scale(1); }
                }
                
                @keyframes errorShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-3px); }
                    75% { transform: translateX(3px); }
                }
                
                /* XML Command Highlighting in Chat */
                .xml-command-highlight {
                    background: rgba(0, 123, 255, 0.08);
                    border: 1px solid rgba(0, 123, 255, 0.2);
                    border-radius: 6px;
                    padding: 0.5rem;
                    margin: 0.5rem 0;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.85rem;
                    color: #2c3e50;
                    display: block;
                    isolation: isolate;
                }
                
                .xml-command-highlight strong {
                    color: #0056b3;
                    font-weight: 600;
                }
                
                .xml-command-highlight .command-content {
                    margin: 0.25rem 0;
                    padding-left: 1rem;
                    border-left: 2px solid rgba(0, 123, 255, 0.3);
                    background: rgba(0, 123, 255, 0.03);
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                
                /* Specific command type styling */
                .xml-command-highlight.outline-replace-command {
                    border-color: rgba(40, 167, 69, 0.3);
                    background: rgba(40, 167, 69, 0.05);
                }
                
                .xml-command-highlight.outline-replace-command strong {
                    color: #28a745;
                }
                
                .xml-command-highlight.outline-replace-command .command-content {
                    border-left-color: rgba(40, 167, 69, 0.4);
                    background: rgba(40, 167, 69, 0.03);
                }
                
                .xml-command-highlight.edit-command {
                    border-color: rgba(255, 193, 7, 0.3);
                    background: rgba(255, 193, 7, 0.05);
                }
                
                .xml-command-highlight.edit-command strong {
                    color: #ffc107;
                }
                
                .xml-command-highlight.edit-command .command-content {
                    border-left-color: rgba(255, 193, 7, 0.4);
                    background: rgba(255, 193, 7, 0.03);
                }
                
                .xml-command-highlight.append-command {
                    border-color: rgba(108, 117, 125, 0.3);
                    background: rgba(108, 117, 125, 0.05);
                }
                
                .xml-command-highlight.append-command strong {
                    color: #6c757d;
                }
                
                .xml-command-highlight.append-command .command-content {
                    border-left-color: rgba(108, 117, 125, 0.4);
                    background: rgba(108, 117, 125, 0.03);
                }
                
                .xml-command-highlight.replace-command {
                    border-color: rgba(220, 53, 69, 0.3);
                    background: rgba(220, 53, 69, 0.05);
                }
                
                .xml-command-highlight.replace-command strong {
                    color: #dc3545;
                }
                
                .xml-command-highlight.replace-command .command-content {
                    border-left-color: rgba(220, 53, 69, 0.4);
                    background: rgba(220, 53, 69, 0.03);
                }
                
                .xml-command-highlight.replace-section-command {
                    border-color: rgba(138, 43, 226, 0.3);
                    background: rgba(138, 43, 226, 0.05);
                }
                
                .xml-command-highlight.replace-section-command strong {
                    color: #8a2be2;
                }
                
                .xml-command-highlight.replace-section-command .command-content {
                    border-left-color: rgba(138, 43, 226, 0.4);
                    background: rgba(138, 43, 226, 0.03);
                }
                
                .xml-command-highlight.remove-section-command {
                    border-color: rgba(220, 53, 69, 0.3);
                    background: rgba(220, 53, 69, 0.05);
                }
                
                .xml-command-highlight.remove-section-command strong {
                    color: #dc3545;
                }
                
                .xml-command-highlight.context-command {
                    border-color: rgba(102, 16, 242, 0.3);
                    background: rgba(102, 16, 242, 0.05);
                }
                
                .xml-command-highlight.context-command strong {
                    color: #6610f2;
                }
                
                .xml-command-highlight.context-command .command-content {
                    border-left-color: rgba(102, 16, 242, 0.4);
                    background: rgba(102, 16, 242, 0.03);
                }
                
                /* Add subtle hover effect for XML commands */
                .xml-command-highlight:hover {
                    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
                    transform: translateY(-1px);
                    transition: all 0.2s ease;
                }
                
                /* Inline command styling for simple commands */
                .xml-command-highlight:not(.outline-replace-command):not(.edit-command):not(.append-command):not(.replace-command):not(.replace-section-command):not(.remove-section-command):not(.context-command) {
                    display: inline-block;
                    padding: 0.2rem 0.4rem;
                    margin: 0 0.2rem;
                    font-size: 0.8rem;
                    border-radius: 4px;
                }
                
                /* Ensure content after XML highlights returns to normal styling */
                .xml-command-highlight + * {
                    background: initial !important;
                    color: initial !important;
                    border: initial !important;
                    font-family: initial !important;
                    font-size: initial !important;
                    padding: initial !important;
                    margin: initial !important;
                }
                
                /* Reset any potential bleeding from XML highlights */
                .message-content {
                    position: relative;
                    isolation: isolate;
                }
                
                .message-content > * {
                    isolation: isolate;
                }
                
                /* Clean XML command styling with proper separation */
                .xml-commands-container {
                    margin-bottom: 1rem;
                    border-bottom: 1px solid rgba(0, 123, 255, 0.1);
                    padding-bottom: 0.5rem;
                }
                
                .clean-content {
                    /* Ensure clean content has normal styling */
                    background: transparent;
                    color: inherit;
                    font-family: inherit;
                    font-size: inherit;
                    line-height: inherit;
                }
            </style>

            <!-- Sidebar -->
            <div class="xml-story-sidebar">
                <div class="sidebar-header">
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Node Chat Editor</h3>
                </div>
                <div class="sidebar-content">
                    <div>
                        <label style="display: block; font-size: 0.9rem; margin-bottom: 0.5rem; color: #ccc;">Model:</label>
                        <select id="xml-story-model-selector" class="model-selector" style="width: 100%; background: #333; color: white; border-color: #555;">
                            <option value="creator">Creator</option>
                            <option value="editor">Editor</option>
                            <option value="rater">Rater</option>
                            <option value="prose">Prose</option>
                        </select>
                    </div>
                    
                    <div class="custom-buttons-section">
                        <h4>Custom Buttons</h4>
                        <div id="xml-story-custom-buttons-container">
                            <!-- Custom buttons will be rendered here -->
                        </div>
                    </div>
                    
                    <button id="clear-story-btn" class="sidebar-button">
                        🗑️ Clear Chat
                    </button>
                    
                    <button id="split-into-parts-btn" class="sidebar-button primary">
                        ✂️ Split Into Parts
                    </button>
                    
                    <button id="gap-analysis-btn" class="sidebar-button">
                        🔍 Gap Analysis
                    </button>
                    
                    <button id="collaborate-next-part-btn" class="sidebar-button">
                        🤝 Collaborate on Next Part
                    </button>
                    
                                                <button id="create-project-btn" class="sidebar-button primary">
                                🚀 Update Node
                    </button>

                    <button id="save-as-version-btn" class="sidebar-button">
                        💾 Save as Version
                    </button>
                    
                    <button id="close-modal-btn" class="sidebar-button">
                        ❌ Close
                    </button>

                    
                    <div style="font-size: 0.8rem; color: #888; line-height: 1.4; margin-top: auto;">
                        <p><strong>How it works:</strong></p>
                        <p>Chat naturally about your story. The AI can change your outline, add and edit context items. The AI also knows your outline and context and you can talk about it, ask for improvements.</p>
                    </div>
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="xml-story-main">
                <!-- Chat Area -->
                <div class="xml-story-chat">
                    <div class="chat-header">
                        <div class="project-info-row">
                            <div class="title-section">
                                <label style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: #666; font-weight: 500;">Project Title:</label>
                                <input 
                                    id="xml-story-title" 
                                    type="text" 
                                    value="New Project" 
                                    class="title-input"
                                    placeholder="Enter project title..."
                                />
                            </div>

                        </div>

                    </div>
                    
                    <div id="xml-story-messages" class="chat-messages">
                        <div class="message message-assistant">
                            <div class="message-content" id="initial-chat-message">
                                Loading...
                            </div>
                        </div>
                    </div>
                    
                    <div class="chat-input-area">
                        <div class="advisor-controls" style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem;">
                            <span style="font-size:0.8rem; color:#aaa;">Advisor:</span>
                            <select id="xml-story-advisor-preset" class="model-selector" style="flex:1 1 8rem; min-width:8rem; background:#333; color:white; border-color:#555;"></select>
                            <button id="xml-story-advisor-presets-btn" class="create-button-btn" title="Add, edit or remove advisor personalities">⚙ Presets</button>
                            <span style="font-size:0.8rem; color:#aaa;">Model:</span>
                            <select id="xml-story-advisor-model-selector" class="model-selector" style="flex:0 1 7rem; min-width:6rem; background:#333; color:white; border-color:#555;">
                                <option value="creator">Creator</option>
                                <option value="editor" selected>Editor</option>
                                <option value="rater">Rater</option>
                                <option value="prose">Prose</option>
                            </select>
                            <label style="font-size:0.8rem; color:#aaa; display:flex; align-items:center; gap:0.25rem; cursor:pointer;">
                                <input type="checkbox" id="xml-story-advisor-auto" /> Auto
                            </label>
                        </div>
                        <button id="xml-story-create-button-btn" class="create-button-btn">
                            ⇒ Create Button
                        </button>
                        <div class="input-wrapper">
                            <textarea 
                                id="xml-story-message-input" 
                                class="message-input" 
                                placeholder="How can I help improve this content?"
                                rows="2"
                            ></textarea>
                            <button id="xml-story-advisor-btn" class="send-button" style="background:#6d28d9;" title="Let the Advisor take a turn">
                                Advisor
                            </button>
                            <button id="xml-story-send-btn" class="send-button">
                                Send
                            </button>
                            <button id="xml-story-stop-btn" class="send-button" style="display:none; background:#b91c1c;" title="Stop the current exchange">
                                Stop
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Whiteboard Area -->
                <div class="xml-story-whiteboard">
                    <div class="whiteboard-header">
                        <h4 style="margin: 0; color: #333;">Story Elements</h4>
                        <div style="font-size: 0.9rem; color: #666;">
                            Click to edit
                        </div>
                    </div>
                    
                    <div id="xml-story-whiteboard-content" class="whiteboard-content">
                        <div style="text-align: center; color: #999; padding: 2rem; font-style: italic;">
                            Story elements will appear here as you chat with the AI
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Store references to key elements
        this.whiteboardContainer = container.querySelector('#xml-story-whiteboard-content');
        this.messageInput = container.querySelector('#xml-story-message-input');
        this.sendButton = container.querySelector('#xml-story-send-btn');
        this.modelSelector = container.querySelector('#xml-story-model-selector');
        this.customButtonsContainer = container.querySelector('#xml-story-custom-buttons-container');
        this.createButtonBtn = container.querySelector('#xml-story-create-button-btn');
        this.messagesContainer = container.querySelector('#xml-story-messages');
        this.titleInput = container.querySelector('#xml-story-title');
        this.advisorButton = container.querySelector('#xml-story-advisor-btn');
        this.advisorAutoCheckbox = container.querySelector('#xml-story-advisor-auto');
        this.advisorPresetSelector = container.querySelector('#xml-story-advisor-preset');
        this.advisorModelSelector = container.querySelector('#xml-story-advisor-model-selector');
        this.stopButton = container.querySelector('#xml-story-stop-btn');


        // Set up event listeners and initialize
        void this.setupEventListeners(container);

        return container;
    }

    private async setupEventListeners(container: HTMLElement): Promise<void> {
        // Send message button
        this.sendButton?.addEventListener('click', () => {
            void this.sendMessage();
        });
        
        // Create custom button
        this.createButtonBtn?.addEventListener('click', () => {
            void this.createCustomButton();
        });

        // Enter key to send (Shift+Enter for new line)
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });

        // Clear chat button
        const clearBtn = container.querySelector('#clear-story-btn');
        clearBtn?.addEventListener('click', () => {
            this.clearChat();
        });

        // Update source node button
        const updateNodeBtn = container.querySelector('#create-project-btn');
        updateNodeBtn?.addEventListener('click', () => {
            void this.updateSourceNode();
        });

        // Save-as-named-version button
        const saveAsVersionBtn = container.querySelector('#save-as-version-btn');
        saveAsVersionBtn?.addEventListener('click', () => {
            void this.saveAsNewVersion();
        });

        // Gap Analysis button
        const gapAnalysisBtn = container.querySelector('#gap-analysis-btn');
        gapAnalysisBtn?.addEventListener('click', () => {
            void this.startGapAnalysis();
        });

        // Collaborate on Next Part button
        const collaborateNextPartBtn = container.querySelector('#collaborate-next-part-btn');
        collaborateNextPartBtn?.addEventListener('click', () => {
            void this.startCollaborateNextPart();
        });

        // Split into parts button
        const splitBtn = container.querySelector('#split-into-parts-btn') as HTMLButtonElement | null;
        if (!splitBtn) throw new Error('Split Into Parts button missing');
        splitBtn.addEventListener('click', () => { void this.splitSourceNodeIntoParts(splitBtn); });

        // Close modal button with unsaved changes check (3 options)
        const closeBtn = container.querySelector('#close-modal-btn');
        closeBtn?.addEventListener('click', () => { void this.handleCloseWithSaveChoices(); });
        
        // Setup custom ESC key handler with unsaved changes check
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                void this.handleCloseWithSaveChoices();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Store cleanup for ESC handler
        this.cleanupHandlers.push(() => {
            document.removeEventListener('keydown', escapeHandler);
        });

        // No template selector needed

        // Model selector with persistence
        void this.loadSavedModelSelection();
        this.modelSelector?.addEventListener('change', () => {
            void this.saveModelSelection();
        });

        // Advisor controls: preset list, independent model, auto flag, buttons.
        await this.loadAdvisorPresets();
        void this.loadAdvisorModelSelection();
        this.advisorModelSelector?.addEventListener('change', () => {
            void this.saveAdvisorModelSelection();
        });
        this.advisorPresetSelector?.addEventListener('change', () => {
            this.selectedAdvisorPresetId = this.advisorPresetSelector!.value;
            void this.saveSelectedAdvisorPreset();
        });
        const advisorPresetsBtn = container.querySelector('#xml-story-advisor-presets-btn');
        advisorPresetsBtn?.addEventListener('click', () => {
            void this.openAdvisorPresetEditor();
        });
        this.advisorButton?.addEventListener('click', () => {
            void this.startAdvisorExchange();
        });
        this.stopButton?.addEventListener('click', () => {
            this.stopRequested = true;
            // Cancel any in-flight streaming request immediately so a hung
            // request (e.g. OpenRouter overload) cannot lock up the editor.
            this.currentAbortController?.abort();
            if (this.stopButton) {
                this.stopButton.disabled = true;
                this.stopButton.textContent = 'Stopping…';
            }
        });

        // No conversation persistence - each session starts fresh
        
        // Apply initialization data if provided, or set default message
        if (this.pendingInitializationData) {
            await this.applyInitializationData(this.pendingInitializationData);
            this.pendingInitializationData = undefined;
            
            // Re-initialize the outline editor now that we have proper history
            this.initializeUnifiedOutlineEditor();
        }
        
        // Load custom buttons after initialization
        await this.loadCustomButtons();

        // Ensure initial chat message is updated when a source node is present
        if (this.sourceNode) {
            this.updateInitialChatMessage();
        }

        // Show initial message if no initialization data was provided
        if (!this.sourceNode) {
                const messageElement = document.getElementById('initial-chat-message');
                if (messageElement) {
                    messageElement.innerHTML = `
                        Hi! I'm here to help you edit and improve your content. Just tell me what you want in plain language and I'll do the work.
                        
                        Here's what I can do:
                        • <strong>Write and rework outlines</strong> - Draft them, restructure them, split them into parts, or make them more detailed and compelling
                        • <strong>Manage context notes</strong> - Add background, rules, or facts that guide the writing. I can make a note apply everywhere, only to certain parts, to everything except a few parts, or only to the final prose - and tie it to specific characters or keywords
                        • <strong>Polish the content</strong> - Improve flow, tighten language, and fix inconsistencies
                        • <strong>Look at other parts of your story</strong> - I can pull up any other chapter, scene, or section (even from another project) to keep everything consistent. Just ask me to check something and I'll fetch it myself
                        
                        <strong>💡 Pro tip:</strong> In the outline editor you can select any sentence or paragraph and use the small edit buttons that appear to make focused tweaks to just that part.
                        
                        What would you like to work on?
                    `;
                }
        }
    }

    private async sendMessage(): Promise<void> {
        if (!this.messageInput || this.isGenerating) return;

        const message = this.messageInput.value.trim();
        if (!message) return;

        // Clear input and disable sending
        this.messageInput.value = '';
        this.stopRequested = false;
        this.setGenerating(true);

        // Add user message to chat
        this.addMessageToChat('user', message);

        try {
            // Clear AI highlights (simulates user interaction)
            this.storySystem.clearHighlights();

            // Store only raw user message
            this.conversationHistory.push({ role: 'user', content: message });

            // The Editor responds to the human's message (with node-lookup loop).
            await this.runEditorExchange();

            // If Auto is on, hand the conversation to the Advisor and let the two
            // AIs continue the debate until yield / cap / stop.
            if (this.isAdvisorAutoEnabled() && !this.isStopRequested()) {
                await this.runAdvisorTurnAndMaybeLoop();
            }
        } catch (error) {
            this.reportTurnFailure(error);
        } finally {
            this.setGenerating(false);
        }
    }

    /**
     * Run one Editor turn plus its node-lookup follow-ups. The Editor is the only
     * participant that issues XML commands / edits the node. Assumes generation
     * has already been flagged on by the caller.
     */
    private async runEditorExchange(): Promise<void> {
        let lookupRounds = 0;
        let requestedPaths = await this.runChatTurn();
        while (requestedPaths.length > 0) {
            if (lookupRounds >= XMLStoryModal.MAX_NODE_LOOKUP_ROUNDS) {
                // Cap reached: tell the AI to stop requesting and let it finalize
                // in one more turn that cannot itself trigger further lookups.
                const limitNote = 'Node lookup limit reached for this turn. Please continue with the information already provided, without further <requestnode/> commands.';
                this.addMessageToChat('user', limitNote);
                this.conversationHistory.push({ role: 'user', content: limitNote });
                await this.runChatTurn();
                break;
            }
            lookupRounds++;
            const injected = this.buildRequestedNodesMessage(requestedPaths);
            this.addMessageToChat('user', injected.chatNote);
            this.conversationHistory.push({ role: 'user', content: injected.aiContent });
            requestedPaths = await this.runChatTurn();
        }
    }

    /** Whether the Auto checkbox is currently ticked. */
    private isAdvisorAutoEnabled(): boolean {
        return this.advisorAutoCheckbox?.checked === true;
    }

    /**
     * Read the cooperative stop flag. Wrapped in a method so the compiler does not
     * narrow `stopRequested` to a constant across awaits (it is mutated from the
     * Stop button handler between turns).
     */
    private isStopRequested(): boolean {
        return this.stopRequested;
    }

    /**
     * Entry point for the Advisor button. Runs a single Advisor turn and, when Auto
     * is enabled and the Advisor did not immediately yield, continues the automatic
     * Editor⇄Advisor debate until yield / cap / stop.
     */
    private async startAdvisorExchange(): Promise<void> {
        if (this.isGenerating) return;
        // No goal is required: a creative advisor persona may set the direction
        // itself. With an empty history the advisor critiques the LIVE NODE STATE.
        this.stopRequested = false;
        this.setGenerating(true);
        try {
            await this.runAdvisorTurnAndMaybeLoop();
        } catch (error) {
            this.reportTurnFailure(error);
        } finally {
            this.setGenerating(false);
        }
    }

    /**
     * Perform one Advisor→Editor round (the Advisor critiques, then the Editor
     * reacts). When Auto is enabled, keep repeating rounds until the Advisor
     * yields, the user presses Stop, or the round cap is hit. Assumes generation
     * is flagged on by the caller.
     */
    private async runAdvisorTurnAndMaybeLoop(): Promise<void> {
        let rounds = 0;
        do {
            const result = await this.runAdvisorThenEditor();
            rounds++;
            if (result === 'yielded') {
                this.addMessageToChat('system', '✅ The Advisor is satisfied and approved the node. Debate finished.');
                return;
            }
            if (result === 'stopped') {
                this.addMessageToChat('system', '⏹ Debate stopped. Add a hint and press Send or Advisor to resume.');
                return;
            }
            if (result === 'rejected') {
                this.addMessageToChat('system', '🚫 Advisor message discarded. Press Advisor for another take, or send your own message.');
                return;
            }
            // A single Advisor press performs exactly one Advisor→Editor round.
            // The automatic loop is what keeps the two AIs going on their own.
            if (!this.isAdvisorAutoEnabled()) return;
        } while (rounds < XMLStoryModal.MAX_ADVISOR_ROUNDS);

        this.addMessageToChat('system', `⏹ Reached the ${XMLStoryModal.MAX_ADVISOR_ROUNDS}-round debate limit. Add a hint and press Send or Advisor to continue.`);
    }

    /**
     * One debate round: the Advisor critiques, then (unless it yielded or the user
     * pressed Stop) the Editor reacts to that critique.
     *
     * In manual mode (Auto off) the human must APPROVE the Advisor's critique
     * before it is committed and sent on to the Editor. If they discard it, the
     * message is removed from the chat, nothing enters the conversation history,
     * and the round ends. Auto mode skips approval entirely.
     *
     * @returns 'yielded' if the Advisor approved the node, 'stopped' if the user
     *   halted the debate mid-round, 'rejected' if the human discarded the
     *   critique, or 'continued' if a full Advisor→Editor round completed.
     */
    private async runAdvisorThenEditor(): Promise<'yielded' | 'stopped' | 'continued' | 'rejected'> {
        const turn = await this.runAdvisorTurn();
        if (turn.yielded) return 'yielded';
        if (this.isStopRequested()) return 'stopped';

        // Manual mode: the human approves or discards the critique before it is sent
        // to the Editor. Auto mode commits it without asking. While the approval
        // gate is open, the critique bubble is click-to-edit so the human can
        // revise the exact text the Editor will receive.
        if (!this.isAdvisorAutoEnabled()) {
            const editHandle = turn.messageEl !== null
                ? this.enableAdvisorInlineEdit(turn.messageEl, turn.historyText ?? '')
                : null;
            const approved = await this.requestAdvisorApproval();
            if (!approved) {
                turn.messageEl?.remove();
                return 'rejected';
            }
            // Adopt any inline edits as the critique committed to history / Editor.
            if (editHandle !== null && turn.historyText !== null) {
                const edited = editHandle.commit();
                turn.historyText = edited.trim().length > 0 ? edited : turn.historyText;
            }
            // Restore the streaming UI state for the upcoming Editor turn.
            this.setGenerating(true);
        }

        // Commit the (approved or auto) critique so the Editor sees it next.
        if (turn.historyText !== null) {
            this.conversationHistory.push({ role: 'user', content: turn.historyText });
        }

        // Editor reacts to the Advisor's critique.
        await this.runEditorExchange();
        if (this.isStopRequested()) return 'stopped';

        return 'continued';
    }

    /**
     * Manual-mode approval gate. After the Advisor posts its critique, the human
     * must decide whether it is sent on to the Editor. Rather than a separate
     * dialog, the existing Send and Advisor buttons are repurposed into
     * "✓ Approve" and "✗ Discard" (the Stop button is hidden — nothing is
     * streaming, and a decision must be made before anything proceeds). The
     * original button labels/styles are fully restored before resolving.
     *
     * The buttons' own click handlers (sendMessage / startAdvisorExchange) no-op
     * while a turn is in flight (isGenerating stays true), so they do not interfere.
     *
     * @returns true to approve (send to Editor), false to discard.
     */
    private requestAdvisorApproval(): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const sendBtn = this.sendButton;
            const advisorBtn = this.advisorButton;

            if (this.stopButton) this.stopButton.style.display = 'none';
            if (this.messageInput) this.messageInput.disabled = true;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '✓ Approve';
                sendBtn.style.background = '#16a34a';
            }
            if (advisorBtn) {
                advisorBtn.disabled = false;
                advisorBtn.textContent = '✗ Discard';
                advisorBtn.style.background = '#b91c1c';
            }

            const cleanup = (): void => {
                if (sendBtn) sendBtn.removeEventListener('click', onApprove);
                if (advisorBtn) advisorBtn.removeEventListener('click', onDiscard);
                // Restore original labels/styles. The disabled state is re-derived
                // by the caller via setGenerating().
                if (sendBtn) {
                    sendBtn.innerHTML = 'Send';
                    sendBtn.style.background = '';
                }
                if (advisorBtn) {
                    advisorBtn.textContent = 'Advisor';
                    advisorBtn.style.background = '#6d28d9';
                }
            };
            const onApprove = (): void => {
                cleanup();
                resolve(true);
            };
            const onDiscard = (): void => {
                cleanup();
                resolve(false);
            };

            if (sendBtn) sendBtn.addEventListener('click', onApprove);
            if (advisorBtn) advisorBtn.addEventListener('click', onDiscard);
        });
    }

    /**
     * Make an Advisor critique bubble editable in place before it is approved.
     * Clicking the rendered critique swaps it for a textarea pre-filled with the
     * RAW critique text; the human can revise it, and `commit()` returns the final
     * text (re-rendering the bubble as markdown). If the human never clicks to
     * edit, `commit()` simply returns the unchanged text. This lets the approved
     * critique — the exact text handed to the Editor next — be tweaked first.
     */
    private enableAdvisorInlineEdit(messageEl: HTMLElement, initialText: string): { commit: () => string } {
        const contentDiv = messageEl.querySelector<HTMLElement>('.message-content');
        if (!contentDiv) {
            throw new Error('enableAdvisorInlineEdit: .message-content not found on advisor message');
        }

        // Edit the rendered bubble IN PLACE via contentEditable rather than
        // swapping in a textarea. The bubble is a shrink-to-fit, right-aligned
        // flex item, so a replacement control collapses to a slim column; editing
        // the element itself leaves its width, padding, and styling untouched.
        let entered = false;
        let dirty = false;

        contentDiv.style.cursor = 'text';
        contentDiv.title = 'Click to edit this critique before approving';

        const onInput = (): void => { dirty = true; };

        const enterEditMode = (): void => {
            if (entered) return;
            entered = true;
            contentDiv.removeEventListener('click', enterEditMode);
            contentDiv.title = '';
            contentDiv.contentEditable = 'true';
            contentDiv.style.outline = '2px solid #a78bfa';
            contentDiv.style.outlineOffset = '2px';
            contentDiv.addEventListener('input', onInput);
            contentDiv.focus();
        };

        contentDiv.addEventListener('click', enterEditMode);

        return {
            commit: (): string => {
                contentDiv.removeEventListener('click', enterEditMode);
                contentDiv.removeEventListener('input', onInput);
                contentDiv.style.cursor = '';
                contentDiv.title = '';
                if (entered) {
                    contentDiv.contentEditable = 'false';
                    contentDiv.style.outline = '';
                    contentDiv.style.outlineOffset = '';
                }
                // Untouched (never edited) → keep the exact raw critique text.
                if (!dirty) return initialText;
                const text = contentDiv.innerText.trim();
                return text.length > 0 ? text : initialText;
            }
        };
    }

    /**
     * Run a single Advisor turn. The Advisor takes the human's seat. For maximum
     * cross-model compatibility the debate is sent as a transcript inside one user
     * message (plus the persona system prompt and a fresh LIVE NODE STATE), rather
     * than as role-flipped native turns. The Advisor never edits; any XML it emits
     * is ignored. Its critique is pushed into the shared history as a `user` turn
     * so the Editor sees it next.
     *
     * The critique is NOT pushed into the shared history here; the caller commits
     * it (after optional human approval in non-auto mode) so a rejected critique
     * leaves no trace in the conversation.
     *
     * @returns `yielded` when the Advisor emitted `<yield/>` (debate should end);
     *   otherwise the rendered message element and the text to commit to history.
     */
    private async runAdvisorTurn(): Promise<{ yielded: boolean; messageEl: HTMLElement | null; historyText: string | null }> {
        const prompts = this.settingsManager.getPrompts();
        const expansionService = createPromptExpansionService(this.settingsManager);
        const preset = this.getSelectedAdvisorPreset();

        const systemPrompt = await expansionService.expandPromptAsync(
            prompts.node_chat_advisor,
            {
                project: { language: this.settingsManager.getLanguage() },
                custom: { persona: preset.persona }
            }
        );

        const liveState = this.buildAdvisorLiveStateMessage();

        // Cross-model robustness: rather than role-flipping the history into native
        // turns (which can produce a leading assistant message, consecutive
        // same-role messages, or a trailing system message — any of which some
        // providers reject or silently reorder), present the whole debate as a
        // transcript inside ONE user message. This keeps the request in the
        // universally accepted [system, user] shape that every model accepts.
        const transcript = this.conversationHistory.length > 0
            ? this.conversationHistory
                .map(m => `${m.role === 'assistant' ? 'EDITOR' : 'ADVISOR / HUMAN'}:\n${m.content}`)
                .join('\n\n---\n\n')
            : '(No discussion yet — base your critique on the LIVE NODE STATE below.)';

        const userContent = [
            'DEBATE SO FAR — EDITOR lines are the editing assistant you are critiquing; ADVISOR / HUMAN lines are earlier guidance, including your own previous notes:',
            '',
            transcript,
            '',
            liveState
        ].join('\n');

        const conversation = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userContent }
        ];

        const modelPurpose = this.advisorModelSelector!.value;

        const placeholderMessage = this.addMessageToChat('advisor', '');

        const response = await this.streamAssistantResponse(modelPurpose, conversation, placeholderMessage);

        // Tolerate formatting variants a model might emit: <yield/>, <yield />,
        // <yield>, < yield / >, etc.
        const yielded = /<\s*yield\s*\/?\s*>/i.test(response);
        const visibleText = response.replace(/<\s*yield\s*\/?\s*>/gi, '').trim();

        if (yielded) {
            // The approval message is a meta-statement about being DONE, not a turn
            // in the debate. Keeping it in the chat history would (a) leave a dangling
            // user turn so a later human message becomes two user turns in a row, and
            // (b) confuse the Editor with a "we're finished" message followed by more
            // work. So remove the streamed bubble, keep it OUT of history, and present
            // the advisor's closing rationale in a modal instead.
            placeholderMessage.remove();
            void this.showAdvisorApprovalModal(visibleText);
            return { yielded: true, messageEl: null, historyText: null };
        }

        // Normal critique: render it and hand it back to the caller, which decides
        // whether to commit it to history (immediately in Auto mode, or after the
        // human approves it in manual mode).
        this.updateStreamingMessage(placeholderMessage, visibleText.length > 0 ? visibleText : '(no comment)');
        this.finalizeStreamingMessage(placeholderMessage);
        const historyText = visibleText.length > 0 ? visibleText : 'Please keep improving this node.';

        return { yielded: false, messageEl: placeholderMessage, historyText };
    }

    /**
     * Present the Advisor's closing rationale (why it considers the node finished)
     * in a modal. This deliberately stays out of the chat history so it cannot
     * derail the next Editor turn or create back-to-back user messages.
     */
    private async showAdvisorApprovalModal(rationale: string): Promise<void> {
        const { showGenericModal } = await import('./index');
        const presetName = this.advisorPresets.find(p => p.id === this.selectedAdvisorPresetId)?.name ?? 'Advisor';
        const body = rationale.length > 0
            ? rationale
            : 'The advisor is satisfied with the node and has no further changes to request.';
        showGenericModal(
            {
                content: `<div style="max-height:60vh; overflow:auto; line-height:1.5;">${this.parseMarkdownForChat(body)}</div>`,
                actions: [{ id: 'ok', label: 'OK', type: 'primary', handler: async () => { /* dismiss */ } }]
            },
            { title: `🧭 ${presetName} — Node Approved`, maxWidth: '40rem' }
        );
    }

    /**
     * Build the authoritative LIVE NODE STATE snapshot shown to the Advisor at the
     * end of its turn, mirroring the Editor's snapshot but framed for a reviewer.
     */
    private buildAdvisorLiveStateMessage(): string {
        const currentOutline = this.getCurrentOutlineSafe() || 'No outline content yet.';
        const currentContextItems = this.formatKeywordContextForAI();
        const nodeKind = this.getNodeKindDescriptionForAI();
        const lines = [
            '══════════════════════════════════════════',
            'LIVE NODE STATE — authoritative snapshot',
            '══════════════════════════════════════════',
            "This block is injected by the application and always reflects the node's CURRENT state, including the Editor's latest edits. Judge what is actually here now."
        ];
        if (nodeKind.length > 0) {
            lines.push('', nodeKind);
        }
        lines.push('', this.getDocumentStructureForAI());
        lines.push(
            '',
            'CURRENT CONTENT:',
            currentOutline,
            '',
            'CURRENT CONTEXT ITEMS:',
            currentContextItems,
            '',
            'Review this against your standard, appropriate to the NODE TYPE above. Respond with concrete critique, or emit <yield/> if you are satisfied.'
        );
        return lines.join('\n');
    }

    /**
     * Describe what KIND of node is being edited so the Advisor critiques it on the
     * right terms: a branch node is a structural OUTLINE/plan (the default case),
     * while a leaf node holds finished PROSE. Without this, the Advisor tends to
     * judge an outline as if it were prose and push for prose where none belongs.
     */
    private getNodeKindDescriptionForAI(): string {
        if (!this.sourceNode) {
            return '';
        }
        const node = this.sourceNode;
        const rawLevelName = node.template[node.level] ?? `Level ${node.level}`;
        const cleanedLevel = rawLevelName.replace(/\s+\d+\s*$/, '').trim();
        const levelLabel = cleanedLevel.length > 0 ? cleanedLevel : rawLevelName;

        if (node.isLeaf) {
            return [
                `NODE TYPE: PROSE. "${node.title}" is a leaf ${levelLabel}; its content is the finished prose for this node.`,
                'Judge it as prose: voice, rhythm, clarity, imagery, line-level quality, and how well it honors the context items.'
            ].join('\n');
        }

        const rawChildName = node.template[node.level + 1];
        const cleanedChild = rawChildName ? rawChildName.replace(/\s+\d+\s*$/, '').trim() : '';
        const childLabel = cleanedChild.length > 0 ? cleanedChild : 'child';
        return [
            `NODE TYPE: OUTLINE. "${node.title}" is a ${levelLabel} OUTLINE — a structural plan, NOT finished prose.`,
            `Its job is to lay out what happens and to break this ${levelLabel} into ===section=== parts that become ${childLabel} child nodes. It is expected to read as a plan/outline, not as polished narrative prose.`,
            'Judge it as an outline: completeness, structure, sequencing, setup/payoff, and the clarity of each beat. Do NOT fault it for "not being prose", do NOT ask for sentence-level polish, and do NOT push the Editor to write prose here.'
        ].join('\n');
    }

    /**
     * Describe the document's layer hierarchy (e.g. Book → Chapter → Scene) and
     * where the edited node sits in it, so the LLM grasps how deep the structure
     * goes below this node. Crucially it spells out the RECURSIVE consequence for
     * context: every layer's body is later split into the layer beneath it, so
     * anything global to a whole node's subtree must be a context item (inherited
     * by all descendants), not body text — and this holds at every layer down to
     * the prose leaves, not just at the top.
     */
    private getDocumentStructureForAI(): string {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to describe the document structure');
        const node = this.sourceNode;
        const template = node.template;
        const clean = (raw: string | undefined, fallback: string): string => {
            if (raw === undefined) return fallback;
            const stripped = raw.replace(/\s+\d+\s*$/, '').trim();
            return stripped.length > 0 ? stripped : raw;
        };
        const currentLevel = node.level;
        const currentName = clean(template[currentLevel], `Level ${currentLevel}`);
        const leafName = clean(template[template.length - 1], 'leaf');

        const chain = template
            .map((raw, idx) => {
                const name = clean(raw, `Level ${idx}`);
                return idx === currentLevel ? `${name} (◀ you are editing this layer)` : name;
            })
            .join(' → ');

        const lines: string[] = [
            'DOCUMENT STRUCTURE',
            '',
            `Layer hierarchy, top to bottom: ${chain}.`,
            `Only the bottom layer (${leafName}) holds finished prose; every layer above it is an outline/plan that gets expanded into the layer below it.`,
            ''
        ];

        if (node.isLeaf) {
            lines.push(`This node is a ${currentName} at the bottom layer: its content is finished prose and will NOT be split further.`);
            return lines.join('\n');
        }

        const childName = clean(template[currentLevel + 1], 'child');
        const layersBelow = template.length - 1 - currentLevel;
        lines.push(
            `This node is a ${currentName} OUTLINE. On expansion its ===sections=== become ${childName} nodes; there ${layersBelow === 1 ? 'is' : 'are'} ${layersBelow} layer(s) below it before prose is reached, and the SAME split repeats at every layer (each ${childName}'s own body is later split into the layer beneath it, down to the ${leafName} prose leaves).`,
            '',
            'RECURSIVE CONTEXT RULE — applies at THIS layer and every layer below:',
            "- A node's body text gets split and scattered down ONE path on expansion. A context item is inherited by the WHOLE subtree below the node it is attached to.",
            '- Therefore anything that is true for a whole node and all of its descendants (shared background, setting, a throughline, tone/style, a constraint) belongs in a CONTEXT ITEM, never in the body that will be split.',
            `- This is not only about the top of the outline: when you write a ===section===, keep only what is specific to that section in its body, and lift anything global to that ENTIRE section into a context item scoped to it (scope="include" children="That Section Title"). The future ${childName} created from that section — and everything beneath it — then inherits it automatically.`
        );
        return lines.join('\n');
    }

    /**
     * Open the Advisor persona editor: a modal to create, rename, rewrite, or
     * delete advisor presets. Editing happens on a working copy so Cancel discards
     * changes; Save commits to storage and refreshes the dropdown.
     */
    private async openAdvisorPresetEditor(): Promise<void> {
        const { showGenericModal } = await import('./index');

        // Work on a clone so Cancel is non-destructive.
        const working: AdvisorPreset[] = this.advisorPresets.map(p => ({ ...p }));
        let currentId: string = this.selectedAdvisorPresetId ?? working[0]!.id;

        const buildOptions = (): string =>
            working.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');

        const fieldStyle = 'width:100%; padding:0.5rem; box-sizing:border-box; border:1px solid #d1d5db; border-radius:0.375rem; font-family:inherit;';
        const btnStyle = 'padding:0.5rem 0.75rem; border-radius:0.375rem; border:1px solid #d1d5db; background:#f3f4f6; color:#111827; cursor:pointer; white-space:nowrap;';

        const content = `
            <div style="display:flex; flex-direction:column; gap:0.75rem; min-width:30rem;">
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <select id="apre-select" style="${fieldStyle} flex:1 1 auto;">${buildOptions()}</select>
                    <button type="button" id="apre-new" style="${btnStyle}">➕ New</button>
                    <button type="button" id="apre-delete" style="${btnStyle}">🗑 Delete</button>
                </div>
                <label style="font-weight:600; display:flex; flex-direction:column; gap:0.25rem;">Name
                    <input type="text" id="apre-name" style="${fieldStyle}" />
                </label>
                <label style="font-weight:600; display:flex; flex-direction:column; gap:0.25rem;">Personality &amp; instructions
                    <textarea id="apre-persona" rows="10" style="${fieldStyle} resize:vertical;"></textarea>
                </label>
                <p style="font-size:0.8rem; color:#6b7280; margin:0;">The Advisor debates the editing assistant using this personality. It never edits the node itself, and its model/purpose is chosen separately in the chat.</p>
            </div>
        `;

        const selectEl = (): HTMLSelectElement => document.getElementById('apre-select') as HTMLSelectElement;
        const nameEl = (): HTMLInputElement => document.getElementById('apre-name') as HTMLInputElement;
        const personaEl = (): HTMLTextAreaElement => document.getElementById('apre-persona') as HTMLTextAreaElement;

        const findIndex = (id: string): number => working.findIndex(p => p.id === id);

        const commitFields = (): void => {
            const idx = findIndex(currentId);
            if (idx < 0) return;
            working[idx]!.name = nameEl().value.trim().length > 0 ? nameEl().value.trim() : 'Unnamed Advisor';
            working[idx]!.persona = personaEl().value;
        };

        const loadFields = (): void => {
            const preset = working[findIndex(currentId)]!;
            nameEl().value = preset.name;
            personaEl().value = preset.persona;
        };

        const rebuildSelect = (): void => {
            selectEl().innerHTML = buildOptions();
            selectEl().value = currentId;
        };

        showGenericModal(
            {
                content,
                actions: [
                    { id: 'cancel', label: 'Cancel', type: 'secondary', handler: async () => { /* discard working copy */ } },
                    {
                        id: 'save',
                        label: 'Save',
                        type: 'primary',
                        handler: async () => {
                            commitFields();
                            this.advisorPresets = working;
                            if (!working.some(p => p.id === this.selectedAdvisorPresetId)) {
                                this.selectedAdvisorPresetId = working[0] ? working[0].id : null;
                            }
                            await this.saveAdvisorPresets();
                            await this.saveSelectedAdvisorPreset();
                            this.renderAdvisorPresetOptions();
                        }
                    }
                ]
            },
            { title: 'Advisor Personalities', maxWidth: '36rem' },
            {
                onOpen: () => {
                    loadFields();
                    selectEl().addEventListener('change', () => {
                        commitFields();
                        currentId = selectEl().value;
                        loadFields();
                    });
                    (document.getElementById('apre-new') as HTMLButtonElement).addEventListener('click', () => {
                        commitFields();
                        const preset: AdvisorPreset = { id: crypto.randomUUID(), name: 'New Advisor', persona: '' };
                        working.push(preset);
                        currentId = preset.id;
                        rebuildSelect();
                        loadFields();
                        nameEl().focus();
                        nameEl().select();
                    });
                    (document.getElementById('apre-delete') as HTMLButtonElement).addEventListener('click', () => {
                        if (working.length <= 1) {
                            return; // Always keep at least one persona.
                        }
                        const idx = findIndex(currentId);
                        working.splice(idx, 1);
                        currentId = working[Math.max(0, idx - 1)]!.id;
                        rebuildSelect();
                        loadFields();
                    });
                }
            }
        );
    }

    /**
     * Run a single AI turn: build the conversation, stream the response, apply all
     * system commands (outline/context as before, node lookups recorded), display
     * the message, and append the assistant response to history.
     *
     * @returns the list of paths from any <requestnode/> commands in this turn.
     */
    /**
     * Stream a single assistant response into the given placeholder bubble with
     * built-in recovery: an AbortController (cancellable via Stop) and a stall
     * watchdog that aborts if no streaming activity arrives within
     * STREAM_STALL_TIMEOUT_MS. This prevents a hung request (e.g. OpenRouter
     * overload) from leaving the editor permanently stuck.
     *
     * Throws on abort/stall/error so the caller's finally clauses re-enable the
     * UI; a stalled request is reported with a clear, recoverable message.
     */
    /**
     * Surface a failed/aborted AI turn to the user as a recoverable system
     * message instead of letting it bubble up as an unhandled rejection (these
     * turns are launched via `void`). A user-initiated Stop is reported calmly;
     * anything else shows the error so the user knows why and can retry. The
     * conversation/outline state is untouched, so no work is lost.
     */
    private reportTurnFailure(error: unknown): void {
        if (this.isStopRequested()) {
            this.addMessageToChat('system', 'Generation stopped. Your work is intact — you can continue or send another message.');
            return;
        }
        const message = error instanceof Error ? error.message : 'The AI request failed unexpectedly.';
        this.addMessageToChat('system', message);
    }

    private async streamAssistantResponse(
        modelPurpose: string,
        conversation: OpenRouterMessage[],
        placeholderMessage: HTMLElement
    ): Promise<string> {
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        // Keep the display awake for the duration of this streaming turn.
        const activeWork = pageActivityService.beginActiveWork('xml-story-stream');

        let response = '';
        // Holder object (not a bare `let`) so the flag's type stays `boolean` and
        // the compiler does not narrow it to a constant across the await below.
        const stall = { triggered: false };
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        // While the tab is hidden/frozen the stall watchdog is suspended so
        // background time is never counted as a stall (timers are throttled in
        // the background, which would otherwise fire the abort late or wrongly).
        let pageHidden = pageActivityService.isHidden();

        const armStallTimer = (): void => {
            if (stallTimer !== null) clearTimeout(stallTimer);
            if (pageHidden) {
                stallTimer = null;
                return;
            }
            stallTimer = setTimeout(() => {
                stall.triggered = true;
                abortController.abort();
            }, XMLStoryModal.STREAM_STALL_TIMEOUT_MS);
        };
        const clearStallTimer = (): void => {
            if (stallTimer !== null) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }
        };
        const suspendStallTimer = (): void => {
            pageHidden = true;
            clearStallTimer();
        };
        const resumeStallTimer = (): void => {
            pageHidden = false;
            armStallTimer();
        };
        pageActivityService.on('hidden', suspendStallTimer);
        pageActivityService.on('frozen', suspendStallTimer);
        pageActivityService.on('visible', resumeStallTimer);
        pageActivityService.on('resumed', resumeStallTimer);

        armStallTimer();
        try {
            await this.openRouterClient.streamingChat(modelPurpose, conversation, {
                onStart: () => {
                    armStallTimer();
                },
                onChunk: (chunk: string) => {
                    armStallTimer();
                    response += chunk;
                    this.updateStreamingMessage(placeholderMessage, response);
                },
                onComplete: () => {
                    clearStallTimer();
                    this.finalizeStreamingMessage(placeholderMessage);
                },
                onError: (error: Error) => {
                    clearStallTimer();
                    this.finalizeStreamingMessage(placeholderMessage);
                    throw error;
                }
            }, undefined, abortController.signal);
        } catch (error) {
            this.finalizeStreamingMessage(placeholderMessage);
            if (stall.triggered) {
                throw new Error('The AI request stalled with no response (the provider may be overloaded). It was cancelled — your work is intact, please try again.');
            }
            throw error instanceof Error ? error : new Error('Streaming failed.');
        } finally {
            clearStallTimer();
            pageActivityService.off('hidden', suspendStallTimer);
            pageActivityService.off('frozen', suspendStallTimer);
            pageActivityService.off('visible', resumeStallTimer);
            pageActivityService.off('resumed', resumeStallTimer);
            activeWork.end();
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }

        return response;
    }

    private async runChatTurn(): Promise<string[]> {
        // Create system prompt using PromptExpansionService
        const prompts = this.settingsManager.getPrompts();
        const expansionService = createPromptExpansionService(this.settingsManager);

        const systemPromptContext = {
            project: {
                language: this.settingsManager.getLanguage()
            }
        };

        const systemPrompt = await expansionService.expandPromptAsync(
            prompts.node_chat_editor,
            systemPromptContext
        );

        // Always include dynamic conditional context as a separate system-level prompt
        const currentOutline = this.getCurrentOutlineSafe() || 'No outline content yet.';
        const currentContextItems = this.formatKeywordContextForAI();
        const humanEdits = this.formatHumanEditsForAI();
        const userPromptContext = {
            custom: {
                current_outline: currentOutline,
                current_context_items: currentContextItems,
                human_edits: humanEdits
            }
        };
        const dynamicContextPrompt = await expansionService.expandPromptAsync(
            prompts.node_chat_editor_user,
            userPromptContext
        );
        const contextRules = this.getKeywordContextRulesForAI();

        // Prepare conversation: static rules first, then the chat history, then the
        // freshly-rebuilt LIVE NODE STATE as the LAST message. Putting the current
        // state at the end (instead of before the history) exploits recency so the
        // model treats it as ground truth and stops reasoning from now-stale lines
        // in its own earlier turns. The node lookup rules only apply when a source
        // node is present.
        const conversation = [
            { role: 'system' as const, content: systemPrompt },
            ...(this.sourceNode ? [{ role: 'system' as const, content: this.getDocumentStructureForAI() }] : []),
            { role: 'system' as const, content: contextRules },
            ...(this.sourceNode ? [{ role: 'system' as const, content: this.getNodeLookupRulesForAI() }] : []),
            ...this.conversationHistory,
            { role: 'system' as const, content: dynamicContextPrompt }
        ];

        // Get selected model
        const modelPurpose = this.modelSelector!.value;

        // Add placeholder AI message for streaming
        const placeholderMessage = this.addMessageToChat('assistant', '');

        // Send to AI with real-time streaming (with abort + stall recovery)
        const response = await this.streamAssistantResponse(modelPurpose, conversation, placeholderMessage);

        const requestedPaths: string[] = [];

        if (response) {
            // Track context items before AI processing to detect newly added items
            // (This is only for AI chat responses, not initialization/loading)
            const contextCountBefore = this.storySystem.service.getElementsForContext()
                .filter(el => el.type === 'context').length;

            // Process AI response through XML system (do not remove commands from text)
            const parseResult = await this.storySystem.processAIResponse(response);

            // Handle outline_replace commands and mark executed
            for (const command of parseResult.systemCommands) {
                if (command.type === 'outline_replace' && command.content) {
                    this.setOutlineContentFromAI(command.content);
                    // Reconstruct raw XML if parser didn't retain it
                    const reconstructed = `</outline_replace>${command.content}</outline_replace>`;
                    (command as any).executedRaw = (command as any).rawXml ?? reconstructed;
                }
            }

            // Apply context commands directly to the node (canonical API).
            // Edits are live; the embedded editor is refreshed afterwards.
            let contextChanged = false;
            for (const command of parseResult.systemCommands) {
                // Each command is isolated: a single failing edit (e.g. an id that
                // no longer exists) must be recorded and surfaced as a failure, NOT
                // allowed to throw and abort the whole batch — which would silently
                // drop every following command in the same response.
                try {
                    if (command.type === 'context_add') {
                        const text = command.parameters?.['text'] ?? '';
                        if (text.trim().length === 0) continue;
                        const newId = this.sourceNode!.addConditionalContextItem(text);
                        // Apply trigger words / structural scope / leaves-only when provided.
                        this.applyContextCommandFields(newId, command.parameters ?? {}, false);
                        contextChanged = true;
                        (command as any).executedRaw = (command as any).rawXml ?? '';
                    } else if (command.type === 'context_edit') {
                        if (!command.parameters) {
                            throw new Error(`context_edit command missing parameters. Command: ${JSON.stringify(command)}`);
                        }
                        const id = command.parameters['id'];
                        if (!id) {
                            throw new Error(`context_edit command missing required id parameter. Available parameters: ${Object.keys(command.parameters).join(', ')}`);
                        }
                        // Only the supplied facets are updated, leaving the rest intact.
                        this.applyContextCommandFields(id, command.parameters, true);
                        contextChanged = true;
                        (command as any).executedRaw = (command as any).rawXml ?? '';
                    } else if (command.type === 'context_remove') {
                        const id = command.parameters?.['id'];
                        if (!id) continue;
                        this.sourceNode!.removeConditionalContextItem(id);
                        contextChanged = true;
                        (command as any).executedRaw = (command as any).rawXml ?? '';
                    } else if (command.type === 'request_node') {
                        const path = command.parameters?.['path'] ?? '';
                        (command as any).executedRaw = (command as any).rawXml ?? '';
                        if (path.trim().length > 0) {
                            requestedPaths.push(path);
                        }
                    }
                } catch (error) {
                    // Record the failure loudly (console + user-facing failure notice
                    // via showCommandFailureNotice below) and keep applying the rest.
                    const message = error instanceof Error ? error.message : String(error);
                    const rawXml = command.rawXml ?? this.reconstructCommandXML(command as unknown as XMLStoryCommand);
                    this.failedCommands.push({ command: command as unknown as XMLStoryCommand, error: message, rawXml });
                    console.error('Context command failed (batch continues):', message, command);
                }
            }

            // Persist and refresh the embedded editor to reflect changes
            if (contextChanged) {
                this.persistProject();
            }
            this.renderInlineConditionalContext();

            // Snapshot any command failures, then clear the queue so the next
            // turn starts clean. Failures are surfaced two ways below: inline on
            // the failed command's box (with the reason) and as a recoverable
            // notice. They are NEVER silently dropped.
            const failures = this.failedCommands.slice();
            this.failedCommands = [];

            // Display the original text (with commands left in) and apply generic XML formatting
            const formatted = this.formatXMLBlocksGenerically(response, parseResult.systemCommands as unknown as XMLStoryCommand[], failures);
            this.updateStreamingMessageWithHTML(placeholderMessage, formatted);
            this.finalizeStreamingMessage(placeholderMessage);

            // Add AI response to conversation history
            this.conversationHistory.push({ role: 'assistant', content: response });

            // Surface any failed commands as a clearly-marked, recoverable notice.
            // Unlike the old confirm() dialog this never silently fails when the
            // editor is not the active browser tab, and it always states WHY each
            // command failed so nobody is left guessing.
            if (failures.length > 0) {
                this.showCommandFailureNotice(failures);
            }

            // Update whiteboard
            this.updateWhiteboard();

            // Check if AI actually added new context items during this chat response
            const contextCountAfter = this.storySystem.service.getElementsForContext()
                .filter(el => el.type === 'context').length;

            if (contextCountAfter > contextCountBefore) {
                this.scrollToNewContextItems();
            }

            // Show any errors
            if (parseResult.errors.length > 0) {
                // XML parsing errors occurred
            }
        }

        return requestedPaths;
    }

    /**
     * Resolve a batch of requested node paths into the content that is fed back to
     * the AI plus a compact human-readable note for the chat. Unresolved paths are
     * reported as error blocks so the AI can correct itself.
     */
    private buildRequestedNodesMessage(paths: string[]): { aiContent: string; chatNote: string } {
        const blocks: string[] = [];
        const noteParts: string[] = [];

        for (const path of paths) {
            if (!this.sourceNode) {
                blocks.push(`<requested_node path="${path}" error="No current node to resolve paths against"/>`);
                noteParts.push(`✗ ${path} — no current node`);
                continue;
            }
            const result = resolveNodePath(this.sourceNode, path, getProjects());
            if ('node' in result) {
                blocks.push(this.formatRequestedNodeForAI(result.node, path));
                noteParts.push(`✓ ${path}`);
            } else {
                blocks.push(`<requested_node path="${path}" error="${result.error}"/>`);
                noteParts.push(`✗ ${path} — ${result.error}`);
            }
        }

        return {
            aiContent: `Here are the requested nodes:\n\n${blocks.join('\n\n')}`,
            chatNote: `📄 Node lookup:\n${noteParts.join('\n')}`
        };
    }

    private addMessageToChat(role: 'user' | 'assistant' | 'advisor' | 'system', content: string): HTMLElement {
        if (!this.messagesContainer) {
            // Return a dummy element if no container
            return document.createElement('div');
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;

        // The Advisor speaks in the human's seat but is an AI persona; give it a
        // distinct labelled, coloured bubble so the debate is easy to follow.
        if (role === 'advisor') {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'message-role-label';
            const presetName = this.advisorPresets.find(p => p.id === this.selectedAdvisorPresetId)?.name ?? 'Advisor';
            labelDiv.textContent = `🧭 Advisor — ${presetName}`;
            messageDiv.appendChild(labelDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Use markdown formatting for non-empty content
        if (content && content.trim()) {
            contentDiv.innerHTML = this.parseMarkdownForChat(content);
        } else {
            contentDiv.textContent = content;
        }
        
        // Add streaming cursor for empty assistant/advisor messages (streaming placeholder)
        if ((role === 'assistant' || role === 'advisor') && content === '') {
            const streamingCursor = document.createElement('span');
            streamingCursor.className = 'streaming-cursor';
            streamingCursor.textContent = '▋';
            streamingCursor.style.cssText = `
                animation: blink 1s infinite;
                margin-left: 2px;
                color: #888;
            `;
            contentDiv.appendChild(streamingCursor);
            
            // Add CSS animation if not already present
            if (!document.querySelector('#xml-story-streaming-animation')) {
                const style = document.createElement('style');
                style.id = 'xml-story-streaming-animation';
                style.textContent = `
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        messageDiv.appendChild(contentDiv);

        // Add timestamp
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = new Date().toLocaleTimeString();
        messageDiv.appendChild(timestampDiv);
        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        
        return messageDiv;
    }

    /**
     * Update streaming message content in real-time with markdown formatting
     */
    private updateStreamingMessage(messageElement: HTMLElement, content: string): void {
        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Preserve streaming cursor
        const streamingCursor = contentDiv.querySelector('.streaming-cursor');
        
        // Convert markdown to HTML for proper formatting
        const formattedContent = this.parseMarkdownForChat(content);
        contentDiv.innerHTML = formattedContent;
        
        // Re-add streaming cursor
        if (streamingCursor) {
            contentDiv.appendChild(streamingCursor);
        }
        
        // Auto scroll to bottom to follow the streaming content
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Update streaming message with pre-formatted HTML content
     */
    private updateStreamingMessageWithHTML(messageElement: HTMLElement, htmlContent: string): void {
        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Preserve streaming cursor
        const streamingCursor = contentDiv.querySelector('.streaming-cursor');
        
        // Set HTML content directly
        contentDiv.innerHTML = htmlContent;
        
        // Re-add streaming cursor
        if (streamingCursor) {
            contentDiv.appendChild(streamingCursor);
        }
        
        // Auto scroll to bottom to follow the streaming content
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    // Generic XML formatter: wrap any <.../> or <tag>...</tag> blocks in a styled box, command-agnostic.
    private formatXMLBlocksGenerically(text: string, commands: XMLStoryCommand[] = [], failed: Array<{ rawXml: string; error: string }> = []): string {
        const executedRawSet = new Set(
            (commands || [])
                .map(c => (c as any).executedRaw as string | undefined)
                .filter((s): s is string => typeof s === 'string' && s.length > 0)
        );
        // Fuzzy set to tolerate insignificant whitespace differences
        const normalizeXml = (s: string) => s.replace(/\s+/g, ' ').trim();
        const executedRawNormalizedSet = new Set(Array.from(executedRawSet).map(normalizeXml));
        // Map a failed command's XML (raw and whitespace-normalized) to its reason
        // so the exact block that did not run can be flagged in place.
        const failedReasonMap = new Map<string, string>();
        for (const f of failed) {
            failedReasonMap.set(f.rawXml, f.error);
            failedReasonMap.set(normalizeXml(f.rawXml), f.error);
        }
        // Use backreference to ensure the closing tag matches the opening tag name (prevents partial matches like </search> closing a <replace_command>)
        const xmlRegex = /<([a-zA-Z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>|<([a-zA-Z][\w-]*)(?:\s[^>]*)?\/>/g;

        let resultHtml = '';
        let lastIndex = 0;
        const matches = Array.from(text.matchAll(xmlRegex));

        for (const match of matches) {
            const index = (match as any).index as number | undefined;
            if (index === undefined) continue;

            if (index > lastIndex) {
                const nonXml = text.slice(lastIndex, index);
                resultHtml += this.escapeHtml(nonXml).replace(/\n/g, '<br/>');
            }

            const block = match[0];
            const isExecuted = executedRawSet.has(block) || executedRawNormalizedSet.has(normalizeXml(block));
            const failureReason = isExecuted ? undefined : (failedReasonMap.get(block) ?? failedReasonMap.get(normalizeXml(block)));

            // Three visual states: executed (green), failed (red + reason), neutral.
            let borderColor = '#e5e7eb';
            let bgColor = '#f9fafb';
            let badge = '';
            if (isExecuted) {
                borderColor = '#16a34a';
                bgColor = '#ecfdf5';
                badge = '<span style="margin-left:8px;display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:12px;">✓ Executed</span>';
            } else if (failureReason !== undefined) {
                borderColor = '#dc2626';
                bgColor = '#fef2f2';
                badge = '<span style="margin-left:8px;display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:700;font-size:12px;">✗ Not executed</span>';
            }
            const bottomMargin = failureReason !== undefined ? '0' : '8px';
            resultHtml += `<div style="border:2px solid ${borderColor};background:${bgColor};border-radius:8px;padding:8px;margin:8px 0 ${bottomMargin} 0;white-space:pre-wrap;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">`+
                           `<code style=\"flex:1 1 auto;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;\">${this.escapeHtml(block)}</code>${badge}</div>`;
            if (failureReason !== undefined) {
                resultHtml += `<div style="margin:0 0 8px 0;padding:6px 10px;border:2px solid #dc2626;border-top:none;border-radius:0 0 8px 8px;background:#fef2f2;color:#991b1b;font-size:12px;">⚠️ ${this.escapeHtml(failureReason)}</div>`;
            }
            lastIndex = index + block.length;
        }

        if (lastIndex < text.length) {
            const tail = text.slice(lastIndex);
            resultHtml += this.escapeHtml(tail).replace(/\n/g, '<br/>' );
        }

        return resultHtml;
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /**
     * Simple markdown parser for chat messages
     * Handles basic formatting and applies XML highlighting cleanly
     */
    private parseMarkdownForChat(text: string): string {
        if (!text) return '';
        
        // Escape HTML to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Convert line breaks to <br>
        html = html.replace(/\n/g, '<br>');
        
        // First, normalize consecutive asterisks that are close together
        // This prevents issues with patterns like "** text *" creating unclosed tags
        html = html.replace(/(\*{2,})/g, '*');
        
        // Bold text **text** (at least 1 char between)
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic text *text* (not if preceded/followed by another *)
        html = html.replace(/(?<!\*)(\*([^*\n]+?)\*)(?!\*)/g, '<em>$2</em>');
        
        // Inline code `text`
        html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
        
        return html;
    }

    /**
     * Apply XML command highlighting by replacing markers with highlighted commands
     */
    // Removed applyXMLHighlighting; all formatting handled by formatXMLBlocksGenerically

    /**
     * Create HTML for a single system command highlight
     */
    // Removed legacy createSystemCommandHighlight

    /**
     * Finalize streaming message by removing cursor
     */
    private finalizeStreamingMessage(messageElement: HTMLElement): void {
        const streamingCursor = messageElement.querySelector('.streaming-cursor');
        if (streamingCursor) {
            streamingCursor.remove();
        }
    }

    private setGenerating(generating: boolean): void {
        this.isGenerating = generating;
        
        if (this.sendButton) {
            this.sendButton.disabled = generating;
            this.sendButton.innerHTML = generating 
                ? '<span class="loading-spinner"></span> Generating...'
                : 'Send';
        }

        if (this.advisorButton) {
            this.advisorButton.disabled = generating;
        }

        // The Stop button is only shown (and enabled) while generating. It is the
        // single cooperative escape hatch for both the editor and advisor loops.
        if (this.stopButton) {
            this.stopButton.style.display = generating ? '' : 'none';
            this.stopButton.disabled = false;
            this.stopButton.textContent = 'Stop';
        }
        
        if (this.messageInput) {
            this.messageInput.disabled = generating;
        }
    }

    private updateWhiteboard(): void {
        if (!this.whiteboardContainer) return;

        // Always preserve message input focus state
        const shouldRestoreFocus = this.messageInput && document.activeElement === this.messageInput;
        const cursorPosition = shouldRestoreFocus ? this.messageInput?.selectionStart : null;

        // Get all elements for context items only (outline is now unified)
        // Legacy context elements are no longer used in this editor
        
        // Clear any legacy editors (outline editor is persistent)
        this.elementEditors.forEach(editor => { editor.destroy(); });
        this.elementEditors.clear();

        let html = '';

        // Unified Outline section - always show
        const hasOutlineHistory = this.outlineHistory.length > 0;
        const canUndo = this.currentOutlineVersion > 0;
        const canRedo = this.currentOutlineVersion < this.outlineHistory.length - 1;
        
            html += `
                <div class="story-section">
                <div class="story-section-header">
                    <span>Outline</span>
                    <div class="outline-controls">
                        <button class="outline-control-btn" id="outline-reset-btn" ${!this.sourceNode ? 'disabled' : ''} title="Reset outline to original content">🔄</button>
                        <button class="outline-control-btn" id="outline-undo-btn" ${!canUndo ? 'disabled' : ''} title="Undo outline change">↶</button>
                        <button class="outline-control-btn" id="outline-redo-btn" ${!canRedo ? 'disabled' : ''} title="Redo outline change">↷</button>
                        <span class="outline-version-info">${hasOutlineHistory ? `v${this.currentOutlineVersion + 1}/${this.outlineHistory.length}` : 'v1'}</span>
                    </div>
                </div>
                    <div class="story-elements">
                    <div id="unified-outline-editor" style="min-height: 200px; border: 1px solid #ddd; border-radius: 8px; padding: 12px;">
                        ${'' /* Always render editor below; placeholder handled by textarea placeholder */}
                    </div>
                    </div>
                </div>
            `;

        // Conditional Context: host for the embedded canonical editor
            html += `
                <div class="story-section">
                    <div class="story-section-header">
                        <span>Conditional Context</span>
                    </div>
                    <div class="story-elements" id="conditional-context-host" style="height:55vh; min-height:18rem;"></div>
                </div>
            `;

        this.whiteboardContainer.innerHTML = html;

        // Initialize the unified outline editor
        this.initializeUnifiedOutlineEditor();

        // Mount the canonical conditional-context editor (single source of truth)
        this.mountConditionalContextEditor();

        // Add event listeners for outline controls only (legacy context add/reset removed)
        this.addOutlineControlListeners();

        // Always restore focus to message input after whiteboard update
        setTimeout(() => {
            if (this.messageInput) {
                this.messageInput.focus();
                if (cursorPosition !== null) {
                    this.messageInput.setSelectionRange(cursorPosition ?? 0, cursorPosition ?? 0);
                }
            }
        }, 0);
    }

    /**
     * Mount the canonical ConditionalContextEditor into the whiteboard host.
     * This replaces the previous bespoke staged builder; edits are now live.
     */
    private mountConditionalContextEditor(): void {
        if (!this.whiteboardContainer || !this.sourceNode) return;
        const host = this.whiteboardContainer.querySelector('#conditional-context-host') as HTMLElement | null;
        if (!host) return;

        const project = findProjectByNode(this.sourceNode);
        if (!project) throw new Error('XMLStoryModal: source node is not part of a known project');

        try { this.ccEditor?.destroy(); } catch { /* ignore */ }
        this.ccEditor = new ConditionalContextEditor({
            node: this.sourceNode,
            projectManager: project,
            showPreview: false,
            showInheritedByDefault: true,
            // Prospective children come from the LIVE outline being edited here, which
            // may not be saved to the node yet. This keeps a scope targeting a not-yet
            // -created child (created deterministically on expansion) from being flagged
            // as orphaned.
            prospectiveChildTitles: () => this.getProspectiveChildTitles()
        });
        this.ccEditor.mount(host);
    }

    /**
     * Refresh the embedded conditional-context editor. Kept under the old name
     * so all existing callers (e.g. AI command handling) stay valid.
     */
    private renderInlineConditionalContext(): void {
        this.ccEditor?.refresh();
    }

    private persistProject(): void {
        try {
            const project = this.sourceNode ? findProjectByNode(this.sourceNode) : null;
            void project?.saveToStorage();
        } catch (e) {
            console.error('Failed to persist project after conditional edit:', e);
        }
    }

    // Legacy element editor and actions removed





    // Legacy helper retained for reference. Not used anymore.

    /**
     * Build the context list for the LLM, exposing each item's full structural state
     * (trigger words, child scope, leaves-only) so the model can edit any facet precisely.
     */
    private formatKeywordContextForAI(): string {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to read conditional context');
        const nodeItems = this.sourceNode.getConditionalContextItems();

        const lines: string[] = [];
        lines.push('CURRENT CONTEXT ITEMS (with IDs and current scope for editing):');
        lines.push('');

        if (nodeItems.length === 0) {
            lines.push('(no context items)');
            return lines.join('\n');
        }

        for (const item of nodeItems) {
            const attrs: string[] = [`id="${item.id}"`];
            const kws = Array.isArray(item.keywords) ? item.keywords : [];
            if (kws.length > 0) {
                attrs.push(`trigger="${kws.join(', ')}"`);
            }
            const scope = item.childScope;
            if (scope && scope.mode !== 'all') {
                attrs.push(`scope="${scope.mode}"`);
                if (scope.titles.length > 0) {
                    attrs.push(`children="${scope.titles.join('; ')}"`);
                }
            }
            if (item.leavesOnly === true) {
                attrs.push('leaves="true"');
            }
            lines.push(`<context_item ${attrs.join(' ')}>`);
            lines.push(item.text || '');
            lines.push('</context_item>');
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Valid direct-child titles for conditional-context scopes in this editor.
     *
     * If the node already has generated children, their titles win. Otherwise the
     * titles are parsed from the LIVE outline being edited in this modal (which may
     * not be saved to the node yet), because deterministic child creation will turn
     * those `===Section===` headers into the children on expansion. Falls back to
     * the node's saved content only when there is no live outline.
     */
    private getProspectiveChildTitles(): string[] {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to read prospective children');
        // Union of already-generated children and the sections in the LIVE outline
        // being edited here (which may not be saved to the node yet). A node can be
        // partially expanded (some sections already children) while the outline still
        // lists sibling sections that will be created deterministically on expansion.
        const titles: string[] = [];
        const seen = new Set<string>();
        const push = (t: string): void => {
            if (!seen.has(t)) {
                seen.add(t);
                titles.push(t);
            }
        };
        for (const child of this.sourceNode.children) push(child.title);
        for (const sectionTitle of parseSectionTitles(this.getCurrentOutlineSafe())) push(sectionTitle);
        // Fall back to the node's saved content only if there is no live outline at all.
        if (titles.length === 0) {
            for (const t of this.sourceNode.getDirectChildTitles()) push(t);
        }
        return titles;
    }

    /**
     * System rules for the LLM describing the full conditional-context capabilities:
     * trigger words (content gate), structural child scope (by direct child title),
     * and leaves-only reach. Also lists this node's direct children as valid scope targets.
     */
    private getKeywordContextRulesForAI(): string {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to describe conditional context');
        const childTitles = this.getProspectiveChildTitles();
        const childList = childTitles.length > 0
            ? childTitles.map(t => `  • ${t}`).join('\n')
            : '  (this node currently has no direct child sections)';

        return [
            'CONTEXT RULES',
            '',
            'Context items attached to this node are injected when its descendants are generated.',
            '',
            'WHEN TO USE A CONTEXT ITEM (instead of putting it in the body):',
            'See the DOCUMENT STRUCTURE note: each layer is split into the one below it, so body text is',
            'scattered down one path while a context item is inherited by the whole subtree. Put anything',
            'global to a whole node and its descendants (shared background, setting, a throughline, tone/',
            'style, a constraint) into a context item, not the body. For something global to one whole',
            'section, attach it here scoped to that section (scope="include" children="That Section").',
            '',
            'You control WHERE and WHEN each item applies with these optional attributes:',
            '',
            '1. trigger="word1, word2" (optional content gate)',
            '   - Comma-separated trigger words. The item only applies to a node whose content',
            '     mentions one of these words. Omit trigger to make the item always apply.',
            '',
            '2. scope + children (optional structural scope, by DIRECT child title)',
            '   - scope="all"      → applies under every direct child (default; omit children).',
            '   - scope="include"  → applies ONLY under the direct children listed in children="…".',
            '   - scope="exclude"  → applies under every direct child EXCEPT those in children="…".',
            '   - children="Title A; Title B" → semicolon-separated; must match direct child titles EXACTLY.',
            '',
            '3. leaves="true" (optional reach)',
            '   - Restricts the item to leaf nodes only (the lowest prose layer), e.g. prose-only',
            '     style guidance that should not reach intermediate outline layers. Default false.',
            '',
            'Direct child sections of THIS node (valid values for children="…"):',
            childList,
            '',
            'Allowed context commands:',
            'IMPORTANT: the context TEXT always goes BETWEEN the tags, never in an attribute.',
            'This keeps the text safe when it contains quotes (") or the ">" character',
            '(every verifiable constraint starts with "=>"). The optional facets below stay as',
            'attributes on the opening tag.',
            '- Add:               <context add [trigger="…"] [scope="all|include|exclude"] [children="…"] [leaves="true"]>CONTEXT TEXT</context>',
            '- Edit text:         <context edit id="…" [trigger="…"] [scope="…"] [children="…"] [leaves="…"]>NEW TEXT</context>',
            '- Edit facets only:  <context edit id="…" [scope="…"] [children="…"] [trigger="…"] [leaves="…"] />  (self-closing, no text → text stays unchanged)',
            '- Remove:            <context remove id="…" />',
            '',
            'VERIFIABLE CONSTRAINTS:',
            '- A context item whose text begins with "=>" is a binary (pass/fail) constraint the rater',
            '  checks on every node it applies to (e.g. "=> the chapter must end on a cliffhanger").',
            '  Create one by starting the text with "=>"; it can carry trigger/scope/children/leaves like any item.',
            '- When editing an existing "=>" item, keep the "=>" prefix.',
            '',
            'Editing notes:',
            '- Use the exact ID shown in the context list (like c_001, c_042).',
            '- A content-form edit (with text between the tags) replaces the text. To change only',
            '  facets and leave the text untouched, use the self-closing edit form (no text).',
            '- On edit, only the attributes you include are changed; omitted attributes stay as-is.',
            '- To clear triggers send trigger="". To reset scope send scope="all". To disable leaves send leaves="false".',
            '- children titles must exactly match the direct child sections listed above, or the scope matches nothing.',
            '',
            'Examples:',
            '- Always-on note:             <context add>The story is set in 1920s Paris.</context>',
            '- Character note (triggered):  <context add trigger="Marie">Marie is secretly a spy.</context>',
            '- Only under two chapters:     <context add scope="include" children="Chapter 1; Chapter 3">Flashback tone.</context>',
            '- Everywhere except prologue:  <context add scope="exclude" children="Prologue">Use present tense.</context>',
            '- Prose-only style guide:      <context add leaves="true">Keep paragraphs short.</context>',
            '- Verifiable constraint:       <context add>=> every scene must contain at least one line of dialogue</context>',
            '- Rewrite an item\'s text:      <context edit id="c_003">Updated, fuller description here.</context>',
            '- Retarget without text change: <context edit id="c_003" scope="include" children="Chapter 2" />'
        ].join('\n');
    }

    /**
     * Build the block fed back to the AI for a successfully resolved node lookup:
     * the node's current master content plus its node-local conditional context
     * items. No summaries, no children, no version history.
     */
    private formatRequestedNodeForAI(node: DocumentNode, path: string): string {
        const rawLevelName = (node.template[node.level] ?? `Level ${node.level}`).trim();
        const levelName = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] ?? rawLevelName;

        const lines: string[] = [];
        lines.push(`<requested_node path="${path}" title="${node.title}" level="${levelName}">`);
        lines.push('<content>');
        lines.push(node.content || '(empty)');
        lines.push('</content>');

        const items = node.getConditionalContextItems();
        if (items.length > 0) {
            lines.push('<context_items>');
            for (const item of items) {
                const attrs: string[] = [`id="${item.id}"`];
                const kws = Array.isArray(item.keywords) ? item.keywords : [];
                if (kws.length > 0) {
                    attrs.push(`trigger="${kws.join(', ')}"`);
                }
                const scope = item.childScope;
                if (scope && scope.mode !== 'all') {
                    attrs.push(`scope="${scope.mode}"`);
                    if (scope.titles.length > 0) {
                        attrs.push(`children="${scope.titles.join('; ')}"`);
                    }
                }
                if (item.leavesOnly === true) {
                    attrs.push('leaves="true"');
                }
                lines.push(`<context_item ${attrs.join(' ')}>`);
                lines.push(item.text || '');
                lines.push('</context_item>');
            }
            lines.push('</context_items>');
        } else {
            lines.push('<context_items>(none)</context_items>');
        }

        lines.push('</requested_node>');
        return lines.join('\n');
    }

    /**
     * System rules describing the <requestnode/> lookup command: how to address
     * other nodes by path, that '/' and '\' are equivalent, and that the requested
     * node's content + context items are returned automatically so the model can
     * continue. Grounds the model with the current node's children and the list of
     * available project names.
     */
    private getNodeLookupRulesForAI(): string {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to describe node lookups');
        const childTitles = this.getProspectiveChildTitles();
        const childList = childTitles.length > 0
            ? childTitles.map(t => `  • ${t}`).join('\n')
            : '  (this node currently has no direct child sections)';

        // The canonical project name is the root node's live title (what the user
        // sees and edits). ProjectManager.projectTitle is a stale creation-time
        // copy and must not be shown to the model.
        const project = findProjectByNode(this.sourceNode);
        const currentProjectName = project ? project.rootNode.title : this.sourceNode.title;
        const projectNames = getProjects().map(p => `  • ${p.rootNode.title}`).join('\n');

        return [
            'NODE LOOKUP',
            '',
            'You can pull another node into the conversation to read its content. Emit:',
            '  <requestnode path="..."/>',
            'The node\'s current text and its context items are returned to you automatically,',
            'and you may then continue. You can request several nodes; each is fetched in turn.',
            '',
            'Path grammar (like a file path):',
            '- Relative paths resolve against THIS node\'s direct children, e.g. path="Chapter 1"',
            '  or deeper path="Chapter 1/Scene 2".',
            '- "/" and "\\" are interchangeable separators; use whichever you like.',
            '- ".." goes to the parent; "." stays on the current node.',
            '- A leading separator means an ABSOLUTE path starting from a project by name:',
            '  path="/Other Project/Act 1/Chapter 2". A bare path="/Other Project" returns that',
            '  project\'s root node.',
            '- Title and project-name matching is case-insensitive.',
            '',
            `Current node: "${this.sourceNode.title}" (project "${currentProjectName}")`,
            'Direct children of THIS node (valid first segment for a relative path):',
            childList,
            'Available projects (valid first segment for an absolute path):',
            projectNames,
            '',
            'Examples:',
            '- Read a child:        <requestnode path="Chapter 1"/>',
            '- Read a grandchild:   <requestnode path="Chapter 1/Scene 2"/>',
            '- Read a sibling:      <requestnode path="../Chapter 2"/>',
            '- Read another project:<requestnode path="/Other Project/Act 1"/>'
        ].join('\n');
    }

    /**
     * Apply the optional facets of a context add/edit command (trigger words,
     * structural child scope, leaves-only) to a conditional context item. Only the
     * facets present in `params` are changed; on add `includeText` is false because
     * the text was already set when the item was created.
     */
    private applyContextCommandFields(itemId: string, params: Record<string, string>, includeText: boolean): void {
        if (!this.sourceNode) throw new Error('XMLStoryModal: sourceNode is required to edit conditional context');
        const updates: Partial<{ text: string; keywords: string[]; childScope: ChildScope; leavesOnly: boolean }> = {};

        if (includeText && params['text'] !== undefined) {
            updates.text = params['text'];
        }
        if (params['trigger'] !== undefined) {
            updates.keywords = params['trigger'].split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        if (params['scope'] !== undefined || params['children'] !== undefined) {
            const titles = (params['children'] ?? '').split(';').map(s => s.trim()).filter(s => s.length > 0);
            updates.childScope = { mode: this.normalizeChildScopeMode(params['scope'], titles.length > 0), titles };
        }
        if (params['leaves'] !== undefined) {
            updates.leavesOnly = params['leaves'].trim().toLowerCase() === 'true';
        }

        this.sourceNode.updateConditionalContextItem(itemId, updates);
    }

    /**
     * Map the model-facing scope attribute to a ChildScopeMode. Falls back to
     * 'include' when titles are present but no explicit mode was given, else 'all'.
     */
    private normalizeChildScopeMode(scope: string | undefined, hasTitles: boolean): ChildScopeMode {
        const v = (scope ?? '').trim().toLowerCase();
        if (v === 'exclude' || v === 'except') return 'exclude';
        if (v === 'include' || v === 'only') return 'include';
        if (v === 'all') return 'all';
        return hasTitles ? 'include' : 'all';
    }

    /**
     * Turn conditional context conditions into a human-readable string
     */
    // Removed unused conditions formatter

    private formatHumanEditsForAI(): string {
        const pendingEdits = this.storySystem.service.getPendingHumanEdits();
        if (pendingEdits.length === 0) {
            return 'No recent human edits.';
        }

        let formatted = 'RECENT HUMAN EDITS:\n\n';
        pendingEdits.forEach((edit: any) => {
            formatted += `${edit.elementType.toUpperCase()} EDIT (${edit.elementId}):\n`;
            formatted += `- ${edit.field} changed from: "${edit.oldValue}"\n`;
            formatted += `- ${edit.field} changed to: "${edit.newValue}"\n\n`;
        });

        return formatted;
    }

    private handleStoryEvent(event: XMLStoryEvent): void {
        switch (event.type) {
            case 'element_created':
            case 'element_updated':
            case 'element_deleted':
                // These events require DOM rebuild (structural changes)
                this.updateWhiteboard();
                // Save whiteboard state after changes
        
                break;
            case 'human_edit':
                // Human edits only change content, not structure - no need to rebuild DOM
                // Just save the state without destroying/recreating editors
        
                break;
            case 'highlight_cleared':
                this.updateWhiteboard();
                break;
            case 'command_failed':
                // Handle failed commands with retry logic
                this.handleCommandFailure(event);
                break;
            case 'outline_append_requested':
                // Handle outline append - outline is stored here as text, not in service as XML elements
                this.handleOutlineAppend(event);
                break;
            case 'outline_replace_requested':
                // Handle outline replace - outline is stored here as text, not in service as XML elements  
                this.handleOutlineReplace(event);
                break;
            case 'section_replace_requested':
                // Handle section replace - outline is stored here as text, not in service as XML elements
                this.handleSectionReplace(event);
                break;
            case 'section_remove_requested':
                // Handle section remove - outline is stored here as text, not in service as XML elements
                this.handleSectionRemove(event);
                break;
        }
    }
    
    /**
     * Handle command failures by collecting them for user-prompted correction
     */
    private async handleCommandFailure(event: XMLStoryEvent): Promise<void> {
        const { command, error } = event.payload as { command: XMLStoryCommand; error: string };
        
        // Command failed during execution
        
        // Generate raw XML representation of the failed command
        const rawXml = this.reconstructCommandXML(command);
        
        // Collect failed command for later correction
        this.failedCommands.push({ command, error, rawXml });
        
        // Command failure collected for later review
    }
    
    /**
     * Reconstruct XML command from command object for user display
     */
    private reconstructCommandXML(command: XMLStoryCommand): string {
        switch (command.type) {
            case 'replace_command':
                return `<replace_command><search>${command.searchText ?? ''}</search><replace>${command.replaceText ?? ''}</replace></replace_command>`;
            case 'outline_replace':
                return `</outline_replace>${command.content ?? ''}</outline_replace>`;
            case 'append':
                return `<append>${command.content ?? ''}</append>`;
            case 'replace_section':
                return `<replace_section section="${command['sectionTitle'] ?? ''}">${command.content ?? ''}</replace_section>`;
            case 'remove_section':
                return `<remove_section section="${command['sectionTitle'] ?? ''}">`;
            case 'edit':
                return `</edit id="${(command.parameters as any)?.id ?? 'unknown'}">${command.content ?? ''}</edit>`;
            case 'delete':
                return `</delete id="${(command.parameters as any)?.id ?? 'unknown'}">`;
            case 'context_add': {
                const p = (command.parameters as Record<string, unknown>) || {};
                const text = typeof p['text'] === 'string' ? (p['text'] as string) : '';
                return `<context text="${text}"${this.reconstructContextScopeAttrs(p)} />`;
            }
            case 'context_edit': {
                const p = (command.parameters as Record<string, unknown>) || {};
                const id = typeof p['id'] === 'string' && (p['id'] as string).length > 0 ? (p['id'] as string) : 'unknown';
                const text = typeof p['text'] === 'string' ? ` text="${p['text'] as string}"` : '';
                return `<context id="${id}"${text}${this.reconstructContextScopeAttrs(p)} />`;
            }
            case 'context_remove': {
                const p = (command.parameters as Record<string, unknown>) || {};
                const id = typeof p['id'] === 'string' && (p['id'] as string).length > 0 ? (p['id'] as string) : 'unknown';
                return `<context id="${id}" remove="true" />`;
            }
            case 'request_node': {
                const p = (command.parameters as Record<string, unknown>) || {};
                const path = typeof p['path'] === 'string' ? (p['path'] as string) : '';
                return `<requestnode path="${path}" />`;
            }
            default:
                return `<${command.type}>${command.content ?? ''}</${command.type}>`;
        }
    }

    /**
     * Reconstruct the optional scope attributes (trigger/scope/children/leaves) for a
     * failed context command echo, including only the attributes that were supplied.
     */
    private reconstructContextScopeAttrs(p: Record<string, unknown>): string {
        let attrs = '';
        if (typeof p['trigger'] === 'string' && p['trigger'].length > 0) attrs += ` trigger="${p['trigger']}"`;
        if (typeof p['scope'] === 'string' && p['scope'].length > 0) attrs += ` scope="${p['scope']}"`;
        if (typeof p['children'] === 'string' && p['children'].length > 0) attrs += ` children="${p['children']}"`;
        if (typeof p['leaves'] === 'string' && p['leaves'].length > 0) attrs += ` leaves="${p['leaves']}"`;
        return attrs;
    }

    /**
     * Surface failed commands as a persistent, clearly-marked chat notice with a
     * recovery action. This replaces the old confirm() dialog, which the browser
     * suppressed when the editor was not the active tab — silently dropping the
     * failures and leaving the user with no explanation and no way to recover.
     *
     * The notice states WHY each command failed and offers a user-clicked button
     * to ask the AI to fix them. Because the button is a genuine user gesture, it
     * is not subject to the inactive-tab suppression that broke the old dialog.
     */
    private showCommandFailureNotice(failures: Array<{ command: XMLStoryCommand; error: string; rawXml: string }>): void {
        const count = failures.length;
        const reasonList = failures
            .map(f => `• ${f.command.type}: ${f.error}`)
            .join('\n');
        const header = count === 1
            ? '⚠️ 1 command could not be applied and was skipped — nothing in your outline or context was changed by it.'
            : `⚠️ ${count} commands could not be applied and were skipped — nothing in your outline or context was changed by them.`;
        const messageEl = this.addMessageToChat(
            'system',
            `${header}\n\nWhy:\n${reasonList}\n\nThe failed command${count === 1 ? '' : 's'} above ${count === 1 ? 'is' : 'are'} marked in red. You can edit the outline yourself, rephrase your request, or let the AI try again.`
        );

        const contentDiv = messageEl.querySelector('.message-content');
        if (!contentDiv) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '🔧 Ask the AI to fix this';
        button.style.cssText = 'margin-top:10px;padding:6px 12px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#ffffff;font-weight:600;cursor:pointer;';
        button.addEventListener('click', () => {
            if (this.isGenerating) return;
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'default';
            button.textContent = '⏳ Asking the AI…';
            void this.sendCorrectionMessage(this.generateCorrectionMessage(failures));
        });
        contentDiv.appendChild(button);
    }

    /**
     * Generate correction message for the given failed commands.
     */
    private generateCorrectionMessage(failures: Array<{ error: string; rawXml: string }>): string {
        const failureList = failures
            .map(failure => `${failure.rawXml} (${failure.error})`)
            .join('\n');

        return `These commands did not work:\n${failureList}\n\nPlease fix the problem (for replace commands, the search text must match the current outline exactly, ignoring punctuation/whitespace) and try again.`;
    }
    
    /**
     * Send correction message as if user typed it
     */
    private async sendCorrectionMessage(message: string): Promise<void> {
        if (!this.messageInput) return;

        // Set the message in the input field
        this.messageInput.value = message;

        // Send the message through normal flow
        await this.sendMessage();
    }
    
    /**
     * Handle outline append requests from the service
     * 
     * ARCHITECTURE NOTE: Outline content is stored as plain text in this.outlineHistory,
     * while context items are stored as XML elements in XMLStoryService.state.elements.
     * This is why outline operations (append, replace_command, outline_replace) are 
     * handled here in the modal, not in the service layer.
     */
    private handleOutlineAppend(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        const currentContent = this.getCurrentOutlineSafe();
        const outcome = TargetedTextEditor.applyOne(currentContent, command as unknown as SystemCommand);
        if (!outcome.ok || outcome.newText === undefined) {
            this.emitCommandFailure(command, outcome.message);
            return;
        }
        this.setOutlineContentFromAI(outcome.newText);
        // Mark executed so chat can show the checkmark in a command-agnostic way
        (command as any).executedRaw = (command as any).rawXml ?? '';
    }

    /**
     * Handle outline replace requests from the service
     * 
     * ARCHITECTURE NOTE: This uses fuzzy search to find and replace text within
     * the outline content (stored as plain text), ignoring whitespace/punctuation
     * differences between AI search text and actual outline formatting. The
     * matching/replacement logic lives in the shared TargetedTextEditor.
     */
    private handleOutlineReplace(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        const currentContent = this.getCurrentOutlineSafe();
        const outcome = TargetedTextEditor.applyOne(currentContent, command as unknown as SystemCommand);
        if (!outcome.ok || outcome.newText === undefined) {
            this.emitCommandFailure(command, outcome.message);
            return;
        }

        // Set content and setup persistent highlighting
        if (this.outlineEditor) {
            this.outlineEditor.setText(outcome.newText);
            this.saveOutlineVersion(outcome.newText, 'ai');
        }

        // Setup persistent highlight that survives editor recreation
        if (outcome.matchRange) {
            this.setPersistentHighlight(
                outcome.matchRange.start,
                outcome.matchRange.end,
                'highlight-ai-replacement'
            );
        }
        // Mark executed so chat can show the checkmark in a command-agnostic way
        (command as any).executedRaw = (command as any).rawXml ?? '';
    }

    /**
     * Handle section replace requests from the service
     * Replaces a specific ===<title>=== section with new content
     */
    private handleSectionReplace(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        const currentContent = this.getCurrentOutlineSafe();
        const outcome = TargetedTextEditor.applyOne(currentContent, command as unknown as SystemCommand);
        if (!outcome.ok || outcome.newText === undefined) {
            this.emitCommandFailure(command, outcome.message);
            return;
        }
        this.setOutlineContentFromAI(outcome.newText);
        // Mark executed so chat can show the checkmark in a command-agnostic way
        (command as any).executedRaw = (command as any).rawXml ?? '';
    }

    /**
     * Handle section remove requests from the service
     * Removes a specific ===<title>=== section entirely
     */
    private handleSectionRemove(event: XMLStoryEvent): void {
        const { command } = event.payload as { command: XMLStoryCommand };
        const currentContent = this.getCurrentOutlineSafe();
        const outcome = TargetedTextEditor.applyOne(currentContent, command as unknown as SystemCommand);
        if (!outcome.ok || outcome.newText === undefined) {
            this.emitCommandFailure(command, outcome.message);
            return;
        }
        this.setOutlineContentFromAI(outcome.newText);
        // Mark executed so chat can show the checkmark in a command-agnostic way
        (command as any).executedRaw = (command as any).rawXml ?? '';
    }

    /**
     * Emit a command failure event for retry logic
     */
    private emitCommandFailure(command: XMLStoryCommand, error: string): void {
        this.storySystem.service.emitEvent({
            type: 'command_failed',
            payload: { command, error },
            timestamp: new Date()
        });
    }



    private clearChat(): void {
        if (confirm('Are you sure you want to clear the chat history? This will not affect your outline or context items.')) {
            // Only clear the conversation history, keep the whiteboard unchanged
            this.conversationHistory = [];
            
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `
                    <div class="message message-assistant">
                        <div class="message-content">
                            Chat cleared! Your outline and context items remain unchanged. How can I help improve your content?
                        </div>
                    </div>
                `;
            }
            // Note: NOT calling this.updateWhiteboard() to keep outline and context items
        }
    }



    /**
     * Update the source node with current story elements using chat_edited versioning
     */
    private async updateSourceNode(): Promise<void> {
        try {
            // Start loading state
            this.setUpdateButtonState('loading');
            
            if (!this.sourceNode) {
                // No source node available to update
                this.setUpdateButtonState('error', 'No source node available');
                return;
            }

            // Get unified outline content
            const outlineContent = this.getCurrentOutlineSafe();

            // Conditional context is edited live via the embedded editor; nothing to stage here.

            // Legacy normal-context is ignored; conditional context is stored on the node
            // contextContent removed - using conditional context system

            // Allow saving even with empty outline and empty context (explicitly clearing content/context)


            
            // Check if there's already a "chat_edited" version
            const existingChatVersions = this.sourceNode.getVersionsWithTag('chat_edited');
            
            if (existingChatVersions.length > 0) {
                // Update existing chat_edited version
                const chatEditedVersion = existingChatVersions[0]!;

                
                // Update the version directly (not the master)
                chatEditedVersion.content = outlineContent;
                // Context assignment removed - using conditional context system
                chatEditedVersion.timestamp = new Date();
                
                // Promote this updated version to master
                this.sourceNode.promoteToMaster(chatEditedVersion.id);

                } else {
                // Create new version with chat_edited tag

                const newVersionId = this.sourceNode.addVersion(['chat_edited'], {
                    content: outlineContent,
                    // context removed - using conditional context system
                });
                
                if (newVersionId) {
                    this.sourceNode.promoteToMaster(newVersionId);
    
                } else {
                    // Failed to create new chat_edited version - may already exist
                }
            }
            


            // Save the project
            const project = findProjectByNode(this.sourceNode);
            if (project) {
                await project.saveToStorage();
                
                // Trigger UI update by emitting tree-update-needed event
                project.emit('tree-update-needed', { 
                    nodeId: this.sourceNode.id, 
                    reason: 'chat-edited' 
                });

            }

            // Success feedback

            this.setUpdateButtonState('success');

            // The live context edits are now saved, so advance the baseline. A
            // later "close without saving" must not roll back what we just saved.
            this.originalConditionalContext = this.sourceNode.getConditionalContextItems();

            // Don't auto-close - let user decide when to close

        } catch (error) {
            console.error('Error updating source node:', error);
            this.setUpdateButtonState('error', 'Failed to update node');
        }
    }

    /**
     * Saves the current outline as a new, explicitly named snapshot version.
     * Also persists the current edits to master (same as the Update Node button)
     * so the snapshot and master reflect the same content at save time.
     */
    private async saveAsNewVersion(): Promise<void> {
        if (!this.sourceNode) {
            alert('No source node available to version.');
            return;
        }

        const defaultName = this.sourceNode.suggestNextVersionName();
        const name = await promptForVersionName(defaultName);
        if (name === null) return; // cancelled

        // Persist current edits to master first (same behavior as Update Node).
        await this.updateSourceNode();

        // Freeze the current outline content under the chosen name.
        const content = this.getCurrentOutlineSafe();
        this.sourceNode.createNamedVersion(name, { title: this.sourceNode.title, content });

        const project = findProjectByNode(this.sourceNode);
        if (project) {
            await project.saveToStorage();
            project.emit('tree-update-needed', { nodeId: this.sourceNode.id, reason: 'named-version' });
        }

        const btn = document.getElementById('save-as-version-btn') as HTMLButtonElement | null;
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '✅ Saved!';
        btn.disabled = true;
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 1500);
    }

    private async splitSourceNodeIntoParts(buttonEl?: HTMLButtonElement): Promise<void> {
        if (!this.outlineEditor) {
            alert('Outline editor not initialized.');
            return;
        }
        const current = this.getCurrentOutlineContent();
        if (!current.trim()) {
            alert('Outline editor has no content to split.');
            return;
        }
        try {
            // Progress indicator on button
            if (buttonEl) {
                buttonEl.disabled = true;
                const originalText = buttonEl.textContent ?? '';
                buttonEl.dataset['origText'] = originalText;
                buttonEl.textContent = '⏳ Splitting…';
            }

            const module = await import('../../services/TextSegmentationService');
            const svc = module.TextSegmentationService.getInstance();
            const settingsManager = this.settingsManager;
            const result = await svc.segmentByParagraphMarkers(current, {
                granularity: 'custom',
                language: (typeof settingsManager.getGlobalLanguage === 'function' ? settingsManager.getGlobalLanguage() : settingsManager.getLanguage()) || 'English',
                purpose: 'editor'
            });
            const { paragraphs, sections } = result;
            const chunks: string[] = [];
            for (let i = 0; i < sections.length; i++) {
                const sec = sections[i]!;
                const startIdx = sec.startParagraphIndex;
                const endIdxExclusive = i + 1 < sections.length ? sections[i + 1]!.startParagraphIndex : paragraphs.length + 1;
                chunks.push(`===${sec.title}===`);
                const selected: string[] = [];
                for (let p = startIdx; p < endIdxExclusive; p++) {
                    const para = paragraphs[p - 1]!;
                    selected.push(para.text.trimEnd());
                }
                chunks.push(selected.join('\n\n'));
            }
            const newContent = chunks.join('\n\n');

            // ONLY update the outline editor and its history; do NOT modify the node here.
            // Persist to node is done via the Update Node button.
            this.setOutlineContentFromAI(newContent);
        } catch (e) {
            console.error('Split into parts failed', e);
            alert(`Split into parts failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            if (buttonEl) {
                const originalText = buttonEl.dataset['origText'] ?? '✂️ Split Into Parts';
                buttonEl.textContent = originalText;
                buttonEl.disabled = false;
            }
        }
    }

    /**
     * Set visual feedback state for the update button
     */
    private setUpdateButtonState(state: 'loading' | 'success' | 'error' | 'normal', message?: string): void {
        const updateButton = document.getElementById('create-project-btn') as HTMLButtonElement;
        if (!updateButton) return;

        // Reset classes
        updateButton.classList.remove('loading', 'success', 'error');
        updateButton.disabled = false;

        switch (state) {
            case 'loading':
                updateButton.classList.add('loading');
                updateButton.disabled = true;
                updateButton.innerHTML = '⏳ Updating...';
                break;
                
            case 'success':
                updateButton.classList.add('success');
                updateButton.innerHTML = '✅ Updated!';
                // Reset to normal after 2 seconds
                setTimeout(() => {
                    this.setUpdateButtonState('normal');
                }, 2000);
                break;
                
            case 'error':
                updateButton.classList.add('error');
                updateButton.innerHTML = `❌ ${message ?? 'Error'}`;
                // Reset to normal after 3 seconds
                setTimeout(() => {
                    this.setUpdateButtonState('normal');
                }, 3000);
                break;
                
            case 'normal':
            default:
                this.updateButtonText(); // Use existing method to set correct text
                break;
        }
    }

    /**
     * Check if there are unsaved changes by comparing current content with source node.
     * Conditional-context edits are applied live (persisted immediately), so only
     * the outline can have pending changes here.
     */
    private hasUnsavedChanges(): boolean {
        if (!this.sourceNode) {

            return false;
        }

        try {
            // Get current outline content (safe in early/late lifecycle)
            const currentOutlineContent = this.getCurrentOutlineSafe();

            // Compare with source node's current content
            const sourceOutlineContent = this.sourceNode.content || '';

            const outlineChanged = (currentOutlineContent || '') !== sourceOutlineContent;

            // Context items are edited live on the node, so compare them against the
            // baseline captured at open — otherwise discarding would silently keep
            // AI/manual context edits.
            return outlineChanged || this.conditionalContextChanged();
        } catch (error) {
            console.error('Error checking for unsaved changes:', error);
            // If we can't determine during initialization, there are no changes yet
            throw error;
        }
    }

    /**
     * Whether the node's conditional context items differ from the baseline that
     * was captured when the editor opened.
     */
    private conditionalContextChanged(): boolean {
        if (!this.sourceNode || !this.originalConditionalContext) {
            return false;
        }
        const current = this.sourceNode.getConditionalContextItems();
        return JSON.stringify(current) !== JSON.stringify(this.originalConditionalContext);
    }

    /**
     * Revert all live conditional-context edits made during this session back to
     * the baseline captured at open, and persist the reverted state.
     */
    private revertConditionalContextChanges(): void {
        if (!this.sourceNode || !this.originalConditionalContext) {
            return;
        }
        if (!this.conditionalContextChanged()) {
            return;
        }
        this.sourceNode.setConditionalContextItems(this.originalConditionalContext);
        this.persistProject();
    }




    


    // Removed legacy add-plus-button behavior (no references)

    // Removed legacy add-new-empty-element (no references)

    /**
     * Initialize the unified outline editor
     */
    private initializeUnifiedOutlineEditor(): void {
        const outlineContainer = document.getElementById('unified-outline-editor');
        if (!outlineContainer) return;



        // Always recreate editor for now - persistent highlights will handle highlighting

        // Clear placeholder if it exists
        outlineContainer.innerHTML = '';

        // Prefer history; if none yet, fall back to pending initialization data, then source node content
        const currentContent = (this.outlineHistory.length > 0)
            ? this.getCurrentOutlineFromHistory()
            : ((this.pendingInitializationData?.content ?? this.sourceNode?.content) ?? '');

        // Create a textarea for the UniversalTextEditor
        const textarea = document.createElement('textarea');
        textarea.id = 'outline-textarea';
        textarea.style.width = '100%';
        textarea.style.minHeight = '200px';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.resize = 'vertical';
        textarea.style.fontFamily = 'inherit';
        textarea.style.fontSize = 'inherit';
        textarea.placeholder = 'Start writing your outline here or ask AI to create one...';
        textarea.value = currentContent;

        outlineContainer.appendChild(textarea);

        // Initialize UniversalTextEditor
        this.outlineEditor = UniversalTextEditor.replace(textarea, {
            mode: 'enhanced'
        });

        // Listen for changes to save to history
        this.outlineEditor.addEventListener('input', () => {
            this.saveOutlineVersion(this.outlineEditor!.value, 'user');
        });
        
        // Apply any persistent highlights
        this.applyPersistentHighlights();
    }

    /**
     * Add event listeners for outline control buttons
     */
    private addOutlineControlListeners(): void {
        const resetOutlineBtn = document.getElementById('outline-reset-btn');
        const undoBtn = document.getElementById('outline-undo-btn');
        const redoBtn = document.getElementById('outline-redo-btn');

        if (resetOutlineBtn) {
            resetOutlineBtn.addEventListener('click', () => { this.resetOutlineToOriginal(); });
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => { this.undoOutlineChange(); });
        }

        if (redoBtn) {
            redoBtn.addEventListener('click', () => { this.redoOutlineChange(); });
        }

        // legacy resetContextBtn removed
    }

    /**
     * Get current outline content from editor (live content)
     * NO FALLBACKS - errors must be loud and visible
     */
    private getCurrentOutlineContent(): string {
        if (!this.outlineEditor) {
            throw new Error('CRITICAL: outlineEditor is null when getting current outline content');
        }
        
        return this.outlineEditor.getText();
    }

    /**
     * Safe accessor used during initialization or shutdown when editor may not exist yet.
     * Uses history as the authoritative source in that phase.
     */
    private getCurrentOutlineSafe(): string {
        return this.outlineEditor ? this.outlineEditor.getText() : this.getCurrentOutlineFromHistory();
    }

    /**
     * Get current outline content from history (safe for initialization)
     * Used during editor initialization when outlineEditor doesn't exist yet
     */
    private getCurrentOutlineFromHistory(): string {
        if (this.outlineHistory.length === 0) {
            return ''; // No history yet, return empty string
        }
        
        // Return the latest version from history
        if (this.currentOutlineVersion >= 0 && this.currentOutlineVersion < this.outlineHistory.length) {
            const version = this.outlineHistory[this.currentOutlineVersion];
            return version ? version.content : '';
        }
        
        // If no current version is set, return the latest entry
        const lastIndex = this.outlineHistory.length - 1;
        const lastEntry = this.outlineHistory[lastIndex];
        return lastEntry ? lastEntry.content : '';
    }

    /**
     * Save a new outline version to history
     */
    private saveOutlineVersion(content: string, source: 'user' | 'ai'): void {
        // Don't save if content is unchanged
        if (this.outlineHistory.length > 0 && 
            this.currentOutlineVersion >= 0 && 
            this.currentOutlineVersion < this.outlineHistory.length) {
            const currentVersion = this.outlineHistory[this.currentOutlineVersion];
            if (currentVersion && currentVersion.content === content) {
                return;
            }
        }

        // Remove any versions after current (when adding new version after undo)
        if (this.currentOutlineVersion < this.outlineHistory.length - 1) {
            this.outlineHistory = this.outlineHistory.slice(0, this.currentOutlineVersion + 1);
        }

        // Add new version
        this.outlineHistory.push({
            content,
            timestamp: new Date(),
            source
        });

        this.currentOutlineVersion = this.outlineHistory.length - 1;

        // Limit history size
        const maxHistorySize = 50;
        if (this.outlineHistory.length > maxHistorySize) {
            this.outlineHistory = this.outlineHistory.slice(-maxHistorySize);
            this.currentOutlineVersion = this.outlineHistory.length - 1;
        }

        // Update UI to reflect new state
        this.updateOutlineControls();
    }

    /**
     * Undo outline change
     */
    private undoOutlineChange(): void {
        if (this.currentOutlineVersion > 0) {
            this.currentOutlineVersion--;
            this.restoreOutlineVersion();
        }
    }

    /**
     * Redo outline change
     */
    private redoOutlineChange(): void {
        if (this.currentOutlineVersion < this.outlineHistory.length - 1) {
            this.currentOutlineVersion++;
            this.restoreOutlineVersion();
        }
    }

    /**
     * Restore outline to specific version
     */
    private restoreOutlineVersion(): void {
        if (this.outlineEditor && this.currentOutlineVersion >= 0 && this.currentOutlineVersion < this.outlineHistory.length) {
            const version = this.outlineHistory[this.currentOutlineVersion];
            if (version) {
                this.outlineEditor.value = version.content;
            }
            this.updateOutlineControls();
        }
    }

    /**
     * Start Gap Analysis conversation
     */
    private async startGapAnalysis(): Promise<void> {
        try {
            const prompts = this.settingsManager.getPrompts();
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            const promptContext = {
                project: {
                    language: this.settingsManager.getLanguage()
                }
            };
            
            const expandedPrompt = await expansionService.expandPromptAsync(
                prompts.gap_analysis_starter, 
                promptContext
            );
            
            // Set the prompt in the message input and trigger sending
            if (this.messageInput) {
                this.messageInput.value = expandedPrompt;
                await this.sendMessage();
            }
            
        } catch (error) {
            console.error('Failed to start gap analysis:', error);
            this.addMessageToChat('assistant', 'Failed to start gap analysis. Please try again.');
        }
    }

    /**
     * Start Collaborate on Next Part conversation
     */
    private async startCollaborateNextPart(): Promise<void> {
        try {
            const prompts = this.settingsManager.getPrompts();
            const expansionService = createPromptExpansionService(this.settingsManager);
            
            const promptContext = {
                project: {
                    language: this.settingsManager.getLanguage()
                }
            };
            
            const expandedPrompt = await expansionService.expandPromptAsync(
                prompts.collaborate_next_part_starter, 
                promptContext
            );
            
            // Set the prompt in the message input and trigger sending
            if (this.messageInput) {
                this.messageInput.value = expandedPrompt;
                await this.sendMessage();
            }
            
        } catch (error) {
            console.error('Failed to start collaboration:', error);
            this.addMessageToChat('assistant', 'Failed to start collaboration. Please try again.');
        }
    }

    /**
     * Update outline control button states
     */
    private updateOutlineControls(): void {
        const undoBtn = document.getElementById('outline-undo-btn') as HTMLButtonElement;
        const redoBtn = document.getElementById('outline-redo-btn') as HTMLButtonElement;
        const versionInfo = document.querySelector('.outline-version-info');

        if (undoBtn) {
            undoBtn.disabled = this.currentOutlineVersion <= 0;
        }

        if (redoBtn) {
            redoBtn.disabled = this.currentOutlineVersion >= this.outlineHistory.length - 1;
        }

        if (versionInfo) {
            const hasHistory = this.outlineHistory.length > 0;
            versionInfo.textContent = hasHistory ? 
                `v${this.currentOutlineVersion + 1}/${this.outlineHistory.length}` : 
                'v1';
        }
    }

    /**
     * Set outline content from AI (creates new version)
     */
    public setOutlineContentFromAI(content: string): void {
        this.saveOutlineVersion(content, 'ai');
        if (this.outlineEditor) {
            this.outlineEditor.value = content;
        }
    }

    /**
     * Update the button text based on the source node's template level
     */
    private updateButtonText(): void {
        const button = document.getElementById('create-project-btn');
        if (!button || !this.sourceNode) return;
        
        const rawLevel = this.sourceNode.template[this.sourceNode.level] ?? 'node';
        const levelName = this.getBaseLevelName(rawLevel);
        button.innerHTML = `🚀 Update ${levelName}`;
    }

    /**
     * Update the initial chat message based on the source node's template level
     */
    private updateInitialChatMessage(): void {
        const messageElement = document.getElementById('initial-chat-message');
        if (!messageElement || !this.sourceNode) return;
        
        const rawLevel = this.sourceNode.template[this.sourceNode.level] ?? 'content';
        const templateLevel = this.getBaseLevelName(rawLevel);
        const title = (this.titleInput?.value ?? this.sourceNode.title) || 'this content';
        
        messageElement.innerHTML = `
            Hi! I'm here to help you shape your <strong>${templateLevel.toLowerCase()}</strong> "${title}". Just tell me what you want in plain language and I'll do the work.
            
            Here's what I can do:
            • <strong>Write and rework the outline</strong> - Draft it, restructure it, split it into parts, or make it richer and more compelling
            • <strong>Manage context notes</strong> - Add background, rules, or facts that guide the writing. I can make a note apply everywhere, only to certain parts, to everything except a few parts, or only to the final prose - and tie it to specific characters or keywords so it kicks in just when relevant
            • <strong>Polish the content</strong> - Improve flow, tighten language, fix inconsistencies, or fill in what's missing
            • <strong>Look at other parts of your story</strong> - I can pull up any other chapter, scene, or section (even from another project) to keep everything consistent. Just ask me to check something and I'll fetch it myself
            
            <strong>💡 Pro tip:</strong> In the outline editor you can select any sentence or paragraph and use the small edit buttons that appear to make focused tweaks to just that part.
            
            The current content and context are loaded in the editor on the right. What would you like to work on?
        `;
    }

    /**
     * Extract base template level name without fixed-count suffix
     * Examples: "Act 3" -> "Act", "Chapter 10" -> "Chapter", "Book" -> "Book"
     */
    private getBaseLevelName(raw: string): string {
        if (!raw) return 'node';
        // Remove trailing number token and surrounding spaces
        return raw.replace(/\s+\d+\s*$/, '').trim();
    }

    /**
     * Scroll to show newly added context items (only call when items are actually added, not loaded)
     */
    private scrollToNewContextItems(): void {
        setTimeout(() => {
            // Find the whiteboard container and scroll to the bottom to show new context items
            if (this.whiteboardContainer) {
                // Smooth scroll to the bottom of the whiteboard to show context items
                this.whiteboardContainer.scrollTo({
                    top: this.whiteboardContainer.scrollHeight,
                    behavior: 'smooth'
                });
                
    
            }
        }, 150); // Small delay to ensure DOM has fully updated after whiteboard refresh
    }

    /**
     * Reset outline to original content from source node
     */
    private resetOutlineToOriginal(): void {
        if (!this.sourceNode) {
            // No source node available for outline reset
            return;
        }

        if (confirm('Reset outline to original content? This will lose any changes made in the editor.')) {
            const originalContent = this.sourceNode.content || '';
            
            // Clear outline history and set original content
            this.outlineHistory = [];
            this.currentOutlineVersion = -1;
            this.saveOutlineVersion(originalContent, 'user');
            
            // Update the outline editor
            if (this.outlineEditor) {
                this.outlineEditor.value = originalContent;
            }
            
            // Update controls
            this.updateOutlineControls();
            
            // Note: Reset doesn't change the source node, just the editor state
            // Reset outline to original content
        }
    }

    // Legacy normal-context reset removed

    /**
     * Apply initialization data from an existing node
     */
    private async applyInitializationData(data: {title: string, content: string, contextItems: string[], sourceNode: DocumentNode}): Promise<void> {

        
        // Set title if provided and element exists
        if (data.title) {
            this.titleInput ??= document.getElementById('project-title-input') as HTMLInputElement;
            if (this.titleInput) {
                this.titleInput.value = data.title;
            }
        }

        // Initialize outline with content if provided
        if (data.content) {
            // Clear any existing outline history and set new content
            this.outlineHistory = [];
            this.currentOutlineVersion = -1;
            this.saveOutlineVersion(data.content, 'user');
            
            // Update the outline editor if it exists
            if (this.outlineEditor) {
                this.outlineEditor.value = data.content;
            }
        }

        // Add context items if provided
        if (data.contextItems && data.contextItems.length > 0) {
            // Clear existing context items first
            const existingContextElements = this.storySystem.service.getElementsForContext()
                .filter(el => el.type === 'context');
            for (const element of existingContextElements) {
                await this.storySystem.service.deleteElement(element.id);
            }
            
            // Add new context items
            for (let index = 0; index < data.contextItems.length; index++) {
                const contextItem = data.contextItems[index];
                if (contextItem?.trim()) { // Only add non-empty items
                    await this.storySystem.service.addNewEmptyElement('context');
                    
                    // Update the empty element with content - need to find the actual element that was created
                    const createdElements = this.storySystem.service.getElementsForContext()
                        .filter(el => el.type === 'context' && el.description === '');
                    if (createdElements.length > 0) {
                        const newElement = createdElements[createdElements.length - 1]; // Get the last created empty element
                        if (newElement) {
                            await this.storySystem.service.handleHumanEdit(newElement.id, contextItem.trim());
                        }
                    }
                }
            }
        }

        // Update the whiteboard to reflect changes
        this.updateWhiteboard();
        
        // Update button text to reflect the source node's template level
        this.updateButtonText();
        
        // Update initial chat message to reflect the editing context
        this.updateInitialChatMessage();
        

    }

    /**
     * Load saved model selection from StorageService
     */
    private async loadSavedModelSelection(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const savedModel = await storage.get(XML_STORY_MODEL_STORAGE_KEY);
            
            if (savedModel && this.modelSelector) {
                // Verify the saved model is still valid
                const availableOptions = Array.from(this.modelSelector.options);
                const isValidOption = availableOptions.some(option => option.value === savedModel);
                
                if (isValidOption) {
                    this.modelSelector.value = savedModel as string;
        
                } else {
        
                    // Clean up invalid saved selection
                    await storage.delete(XML_STORY_MODEL_STORAGE_KEY);
                }
            }
        } catch (error) {
            // Error loading saved model selection
        }
    }

    /**
     * Save current model selection to StorageService
     */
    private async saveModelSelection(): Promise<void> {
            if (this.modelSelector?.value) {
            const storage = await StorageService.getInstance();
                await storage.set(XML_STORY_MODEL_STORAGE_KEY, this.modelSelector.value);
        }
    }

    /**
     * Load the saved Advisor model/purpose selection (independent of the Editor).
     */
    private async loadAdvisorModelSelection(): Promise<void> {
        if (!this.advisorModelSelector) return;
        const storage = await StorageService.getInstance();
        const saved = await storage.get(XML_STORY_ADVISOR_MODEL_STORAGE_KEY);
        if (saved) {
            const isValid = Array.from(this.advisorModelSelector.options).some(o => o.value === saved);
            if (isValid) {
                this.advisorModelSelector.value = saved as string;
            } else {
                await storage.delete(XML_STORY_ADVISOR_MODEL_STORAGE_KEY);
            }
        }
    }

    /**
     * Persist the current Advisor model/purpose selection.
     */
    private async saveAdvisorModelSelection(): Promise<void> {
        if (this.advisorModelSelector?.value) {
            const storage = await StorageService.getInstance();
            await storage.set(XML_STORY_ADVISOR_MODEL_STORAGE_KEY, this.advisorModelSelector.value);
        }
    }

    /**
     * Load Advisor presets from global storage, seeding the built-in defaults the
     * first time. Also restores the previously selected preset.
     */
    private async loadAdvisorPresets(): Promise<void> {
        const storage = await StorageService.getInstance();
        const stored = await storage.get(XML_STORY_ADVISOR_PRESETS_STORAGE_KEY) as AdvisorPreset[] | null;
        if (stored && Array.isArray(stored) && stored.length > 0) {
            this.advisorPresets = stored;
            // Non-destructively add any newly-shipped built-in presets the user
            // does not have yet (matched by id). This preserves their own presets
            // and edits while making new defaults available without a data-wiping
            // storage-key bump.
            const knownIds = new Set(this.advisorPresets.map(p => p.id));
            const missingDefaults = DEFAULT_ADVISOR_PRESETS.filter(p => !knownIds.has(p.id));
            if (missingDefaults.length > 0) {
                this.advisorPresets = [...this.advisorPresets, ...missingDefaults.map(p => ({ ...p }))];
                await storage.set(XML_STORY_ADVISOR_PRESETS_STORAGE_KEY, this.advisorPresets);
            }
        } else {
            this.advisorPresets = DEFAULT_ADVISOR_PRESETS.map(p => ({ ...p }));
            await storage.set(XML_STORY_ADVISOR_PRESETS_STORAGE_KEY, this.advisorPresets);
        }

        const savedSelected = await storage.get(XML_STORY_ADVISOR_SELECTED_PRESET_KEY) as string | null;
        if (savedSelected && this.advisorPresets.some(p => p.id === savedSelected)) {
            this.selectedAdvisorPresetId = savedSelected;
        } else {
            this.selectedAdvisorPresetId = this.advisorPresets[0]!.id;
        }

        this.renderAdvisorPresetOptions();
    }

    /**
     * Persist the current Advisor preset list.
     */
    private async saveAdvisorPresets(): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.set(XML_STORY_ADVISOR_PRESETS_STORAGE_KEY, this.advisorPresets);
    }

    /**
     * Persist the currently selected Advisor preset id.
     */
    private async saveSelectedAdvisorPreset(): Promise<void> {
        if (this.selectedAdvisorPresetId) {
            const storage = await StorageService.getInstance();
            await storage.set(XML_STORY_ADVISOR_SELECTED_PRESET_KEY, this.selectedAdvisorPresetId);
        }
    }

    /**
     * Rebuild the Advisor preset dropdown options from the current list.
     */
    private renderAdvisorPresetOptions(): void {
        if (!this.advisorPresetSelector) return;
        this.advisorPresetSelector.innerHTML = this.advisorPresets
            .map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`)
            .join('');
        if (this.selectedAdvisorPresetId) {
            this.advisorPresetSelector.value = this.selectedAdvisorPresetId;
        }
    }

    /**
     * The currently selected Advisor preset. Throws loudly if the selection is
     * somehow invalid, since the UI guarantees a valid selection.
     */
    private getSelectedAdvisorPreset(): AdvisorPreset {
        const preset = this.advisorPresets.find(p => p.id === this.selectedAdvisorPresetId);
        if (!preset) {
            throw new Error(`Advisor preset not found for id "${this.selectedAdvisorPresetId}"`);
        }
        return preset;
    }

    /**
     * Load custom buttons from storage and add default buttons
     */
    private async loadCustomButtons(): Promise<void> {
        const storageKey = `xml-story-custom-buttons-${this.sourceNode!.id}`;
        
        const storage = await StorageService.getInstance();
        const stored = await storage.get(storageKey);
        if (stored) {
            this.customButtons = stored as Array<{id: string, caption: string, prompt: string}>;
        } else {
            this.customButtons = [];
        }
        
        // Add default section splitting button if not already present
        this.ensureDefaultButtons();
        this.renderCustomButtons();
    }

    /**
     * Ensure default buttons exist
     */
    private ensureDefaultButtons(): void {
        // Intentionally no-op: the legacy default "Split into Sections" button is deprecated.
        // A dedicated action is provided in the node chat sidebar.
        // If an old default exists, remove it to avoid duplication.
        this.customButtons = this.customButtons.filter(b => b.id !== 'default-section-splitter');
    }

    /**
     * Save custom buttons to storage (excluding default buttons)
     */
    private async saveCustomButtons(): Promise<void> {
        const storageKey = `xml-story-custom-buttons-${this.sourceNode!.id}`;
        const storage = await StorageService.getInstance();
        
        // Filter out default buttons when saving
        const userCustomButtons = this.customButtons.filter(button => !button.id.startsWith('default-'));
        await storage.set(storageKey, userCustomButtons);

    }
    
    /**
     * Create a new custom button from current prompt
     */
    private async createCustomButton(): Promise<void> {
        if (!this.messageInput) {
            return;
        }
        
        const currentPrompt = this.messageInput.value.trim();
        if (!currentPrompt) {
            alert('Please enter a prompt in the message input first.');
            return;
        }
        
        const caption = prompt('Enter a caption for this button:');
        // Caption entered for custom button
        if (!caption) return;
        
        const buttonId = `custom-btn-${Date.now()}`;
        const newButton = {
            id: buttonId,
            caption: caption.trim(),
            prompt: currentPrompt
        };
        
        // Adding new custom button
        this.customButtons.push(newButton);
        // Custom buttons array updated
        await this.saveCustomButtons();
        this.renderCustomButtons();
    }
    
    /**
     * Render custom buttons in the sidebar
     */
    private renderCustomButtons(): void {
        // Rendering custom buttons
        if (!this.customButtonsContainer) {
            // Custom buttons container not found
            return;
        }
        
        if (this.customButtons.length === 0) {
            this.customButtonsContainer.innerHTML = '<div style="color: #888; font-size: 0.8rem; font-style: italic;">No custom buttons yet</div>';
            return;
        }
        
        this.customButtonsContainer.innerHTML = this.customButtons.map(button => {
            const isDefaultButton = button.id.startsWith('default-');
            return `
                <button class="custom-button ${isDefaultButton ? 'default-button' : ''}" data-button-id="${button.id}" title="${button.prompt}">
                    ${button.caption}
                    ${!isDefaultButton ? `<button class="custom-button-remove" data-remove-id="${button.id}" title="Remove button">×</button>` : ''}
                </button>
            `;
        }).join('');
        
        // Add event listeners for custom buttons
        this.customButtonsContainer.querySelectorAll('.custom-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('custom-button-remove')) return; // Don't trigger on remove button
                
                const buttonId = (btn as HTMLElement).dataset['buttonId'];
                if (buttonId) {
                    this.useCustomButton(buttonId);
                }
            });
        });
        
        // Add event listeners for remove buttons
        this.customButtonsContainer.querySelectorAll('.custom-button-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering the parent button
                const removeId = (btn as HTMLElement).dataset['removeId'];
                if (removeId) {
                    void this.removeCustomButton(removeId);
                }
            });
        });
    }
    
    /**
     * Use a custom button (populate message input with its prompt and send)
     */
    private useCustomButton(buttonId: string): void {
        const button = this.customButtons.find(b => b.id === buttonId);
        if (button && this.messageInput) {
            this.messageInput.value = button.prompt;
            this.messageInput.focus();
            // Automatically send the message
            void this.sendMessage();
        }
    }
    
    /**
     * Remove a custom button
     */
    private async removeCustomButton(buttonId: string): Promise<void> {
        const buttonIndex = this.customButtons.findIndex(b => b.id === buttonId);
        if (buttonIndex !== -1) {
            this.customButtons.splice(buttonIndex, 1);
            await this.saveCustomButtons();
            this.renderCustomButtons();
        }
    }

    /**
     * Set up persistent highlight that survives editor recreation
     */
    private setPersistentHighlight(startPos: number, endPos: number, className: string): void {
        // Clear any existing timer
        if (this.highlightTimer) {
            clearTimeout(this.highlightTimer);
        }
        
        // Set up new persistent highlight
        this.persistentHighlight = {
            startPos,
            endPos,
            className,
            expiresAt: Date.now() + DEFAULT_XML_STORY_CONFIG.highlightDuration
        };
        
        // Apply highlight immediately if editor exists
        this.applyPersistentHighlights();
        
        // Set timer to clear highlight
        this.highlightTimer = window.setTimeout(() => {
            this.clearPersistentHighlight();
        }, DEFAULT_XML_STORY_CONFIG.highlightDuration);
    }
    
    /**
     * Apply persistent highlights to the current editor (if any and not expired)
     */
    private applyPersistentHighlights(): void {
        if (!this.persistentHighlight || !this.outlineEditor) {
            return;
        }
        
        // Check if highlight has expired
        if (Date.now() > this.persistentHighlight.expiresAt) {
            this.clearPersistentHighlight();
            return;
        }
        
        // Apply the highlight
        const highlightId = `highlight-${Date.now()}`;
        this.outlineEditor.addHighlight(
            highlightId,
            this.persistentHighlight.startPos,
            this.persistentHighlight.endPos,
            this.persistentHighlight.className
        );
    }
    
    /**
     * Clear persistent highlight
     */
    private clearPersistentHighlight(): void {
        this.persistentHighlight = null;
        if (this.highlightTimer) {
            clearTimeout(this.highlightTimer);
            this.highlightTimer = null;
        }
    }
    


    public override async close(): Promise<void> {
        // XMLStoryModal.close() called - proceeding with cleanup and close
        
        // Clean up text editors
        this.elementEditors.forEach(editor => { editor.destroy(); });
        this.elementEditors.clear();
        
        // Clean up outline editor
        if (this.outlineEditor) {
            this.outlineEditor.destroy();
            this.outlineEditor = null;
        }

        // Clean up embedded conditional-context editor
        try { this.ccEditor?.destroy(); } catch { /* ignore */ }
        this.ccEditor = null;
        
        // Clean up persistent highlights
        this.clearPersistentHighlight();
        
        // Call parent close() - SimpleModal will handle destruction automatically
        await super.close();
    }

    /**
     * Force close without unsaved changes check - used by ModalFactory when replacing modals
     */
    public async forceCloseImmediate(): Promise<void> {
        // Clean up text editors
        this.elementEditors.forEach(editor => { editor.destroy(); });
        this.elementEditors.clear();
        
        // Clean up outline editor
        if (this.outlineEditor) {
            this.outlineEditor.destroy();
            this.outlineEditor = null;
        }

        // Clean up embedded conditional-context editor
        try { this.ccEditor?.destroy(); } catch { /* ignore */ }
        this.ccEditor = null;
        
        // Clean up persistent highlights
        this.clearPersistentHighlight();
        
        // Call parent close() directly to skip unsaved changes check
        await super.close();
    }
}