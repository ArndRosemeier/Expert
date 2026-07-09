import { OpenRouterClient, OpenRouterCompletionMeta, OpenRouterMessage } from '../../OpenRouterClient';
import { getPromptText } from '../../PromptManager';
import {
  RPGLiteChatMessage,
  RPGLiteMilestone,
  RPGLiteModelPurpose,
  RPGLiteSession,
  mapCompletionMetaToGenerationMeta
} from '../types/RPGLiteTypes';

/**
 * Model purpose used for summary generation. Reuses the existing 'editor'
 * purpose so no new model-settings plumbing is required.
 */
const SUMMARY_PURPOSE: RPGLiteModelPurpose = 'editor';

/** Render a slice of conversation messages as a chronological transcript excerpt. */
function formatMessagesForSummary(messages: RPGLiteChatMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'Player' : 'Narrator'}: ${m.content}`)
    .join('\n\n');
}

/**
 * Builds cumulative "story so far" milestone summaries for RPG Lite. Each call
 * folds a new slice of transcript into the previous summary, producing an
 * updated summary that lets the narrator continue without the full history.
 */
export class RPGLiteSummaryService {
  private openRouterClient: OpenRouterClient;

  constructor(openRouterClient: OpenRouterClient) {
    this.openRouterClient = openRouterClient;
  }

  /**
   * Generate a cumulative milestone summarizing conversation[0 .. coveredCount-1].
   *
   * @param session The session (provides system prompt + prefix context for grounding).
   * @param previousSummary The prior milestone summary to fold into (empty string if none).
   * @param newMessages The messages added since the previous milestone's coveredCount.
   * @param coveredCount The prefix length this milestone covers.
   */
  async buildMilestone(
    session: RPGLiteSession,
    previousSummary: string,
    newMessages: RPGLiteChatMessage[],
    coveredCount: number
  ): Promise<RPGLiteMilestone> {
    if (newMessages.length === 0) {
      throw new Error('RPGLiteSummaryService.buildMilestone called with no new messages.');
    }

    const template = getPromptText('rpg_lite_summarize');
    const prompt = template
      .split('{{system_prompt}}').join(session.systemPrompt)
      .split('{{prefix_context}}').join(session.prefixContext)
      .split('{{previous_summary}}').join(previousSummary.trim().length > 0 ? previousSummary : '(none yet)')
      .split('{{new_messages}}').join(formatMessagesForSummary(newMessages));

    const messages: OpenRouterMessage[] = [{ role: 'user', content: prompt }];

    // Collect stream results in a holder so control-flow checks below are not
    // narrowed away (values are only ever assigned inside the callbacks).
    const collected: { response: string; meta: OpenRouterCompletionMeta | null; error: Error | null } = {
      response: '',
      meta: null,
      error: null
    };

    await this.openRouterClient.streamingChat(SUMMARY_PURPOSE, messages, {
      onStart: () => {},
      onChunk: (chunk: string) => { collected.response += chunk; },
      onMeta: (m: OpenRouterCompletionMeta) => { collected.meta = m; },
      onComplete: () => {},
      onError: (error: Error) => { collected.error = error; }
    });

    if (collected.error) {
      throw collected.error;
    }

    const summary = collected.response.trim();
    if (summary.length === 0) {
      throw new Error('RPGLiteSummaryService: summarizer returned an empty summary.');
    }

    const milestone: RPGLiteMilestone = {
      id: `rpg_lite_milestone_${crypto.randomUUID()}`,
      coveredCount,
      summary,
      createdAt: Date.now()
    };
    if (collected.meta) {
      milestone.generation = mapCompletionMetaToGenerationMeta(SUMMARY_PURPOSE, collected.meta);
    }
    return milestone;
  }
}
