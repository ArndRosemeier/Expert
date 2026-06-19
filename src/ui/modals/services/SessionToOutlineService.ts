import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { createPromptExpansionService } from '../../../services/PromptExpansionService';
import * as state from '../../../state';
import type { RPGLiteSession } from '../../../rpg-lite/types/RPGLiteTypes';

export interface SessionToOutlineResult {
  title: string;
  content: string;
  context: string;
}

export interface ConversionProgress {
  stage: 'preparing' | 'generating' | 'parsing' | 'complete';
  message: string;
  progress?: number;
}

export class SessionToOutlineService {
  async convertSessionToOutline(
    session: RPGLiteSession,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<SessionToOutlineResult> {
    // 1. Notify preparation stage
    onProgress?.({
      stage: 'preparing',
      message: 'Preparing session data...',
      progress: 10
    });

    // 2. Build conversion prompt from session data
    const promptManager = state.getOrchestratorPrompts()!;
    const settingsManager = await SettingsManager.getInstance();
    const expansionService = createPromptExpansionService(settingsManager);

    const conversionContext = this.buildConversionContext(session);

    // Expand prompts with session data
    const systemPrompt = expansionService.expandPrompt(
      promptManager.rpg_session_to_outline_system,
      {}
    );

    const userPrompt = expansionService.expandPrompt(
      promptManager.rpg_session_to_outline_user,
      { custom: conversionContext }
    );

    // 3. Notify generation stage
    onProgress?.({
      stage: 'generating',
      message: 'Converting session to outline...',
      progress: 30
    });

    // 4. Call AI service using 'creator' model
    const client = OpenRouterClient.getInstance();
    let generatedContent = '';
    let lastProgress = 30;

    await client.streamingChat('creator', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      onStart: () => { /* no-op */ },
      onChunk: (chunk) => {
        generatedContent += chunk;
        // Update progress during generation (30-80%)
        lastProgress = Math.min(80, lastProgress + 0.5);
        onProgress?.({
          stage: 'generating',
          message: 'Converting session to outline...',
          progress: lastProgress
        });
      },
      onComplete: () => { /* no-op */ },
      onError: (error) => { throw error; }
    });

    // 5. Notify parsing stage
    onProgress?.({
      stage: 'parsing',
      message: 'Parsing generated outline...',
      progress: 85
    });

    // 6. Parse generated content into title, content, and context
    const parsed = this.parseOutlineResponse(generatedContent);

    // 7. Notify completion
    onProgress?.({
      stage: 'complete',
      message: 'Conversion complete!',
      progress: 100
    });

    return parsed;
  }

  private buildConversionContext(session: RPGLiteSession): Record<string, string> {
    // Format the conversation as a readable transcript
    const conversationText = this.formatConversation(session.conversation);

    return {
      session_title: session.title,
      system_prompt: session.systemPrompt || 'None',
      prefix_context: session.prefixContext || 'None',
      conversation: conversationText,
      message_count: session.conversation.length.toString()
    };
  }

  private formatConversation(messages: RPGLiteSession['conversation']): string {
    return messages.map(msg => {
      const role = msg.role === 'user' ? 'PLAYER' : 'NARRATOR';
      const timestamp = new Date(msg.createdAt).toLocaleString();
      return `[${role}] (${timestamp}):\n${msg.content}\n`;
    }).join('\n---\n\n');
  }

  private parseOutlineResponse(response: string): SessionToOutlineResult {
    // The outline body may contain internal ===Section Title=== headers, so terminate
    // ONLY at the next known top-level wrapper delimiter (or end), never at any "\n===".
    // Otherwise an internal section header would truncate the extracted body.
    const titleMatch = response.match(/===PROJECT TITLE===\s*\n([\s\S]*?)(?=\n===PROJECT OUTLINE===|\n===BACKGROUND CONTEXT===|$)/);
    const contentMatch = response.match(/===PROJECT OUTLINE===\s*\n([\s\S]*?)(?=\n===BACKGROUND CONTEXT===|$)/);
    const contextMatch = response.match(/===BACKGROUND CONTEXT===\s*\n([\s\S]*?)$/);

    if (!titleMatch || !contentMatch || !contextMatch) {
      throw new Error(
        'Failed to parse AI response. Expected format with ===PROJECT TITLE===, ===PROJECT OUTLINE===, and ===BACKGROUND CONTEXT=== delimiters.'
      );
    }

    return {
      title: titleMatch[1]!.trim(),
      content: contentMatch[1]!.trim(),
      context: contextMatch[1]!.trim()
    };
  }
}
