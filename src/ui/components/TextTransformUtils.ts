import { TextTransformModal, TextTransformRequest, TextTransformModalConfig } from './TextTransformModal';

/**
 * Simple utility function to open the Text Transform Modal
 * 
 * Example usage:
 * openTextTransformModal('Hello world', undefined, undefined, 'Make this more formal');
 */
export function openTextTransformModal(
  defaultText?: string,
  defaultContext?: string,
  defaultFormatInstructions?: string,
  defaultInstruction?: string
): void {
  
  const config: TextTransformModalConfig = {
    id: 'text-transform-modal'
  };
  
  // Only add properties that are defined
  if (defaultText) config.defaultText = defaultText;
  if (defaultContext) config.defaultContext = defaultContext;
  if (defaultFormatInstructions) config.defaultFormatInstructions = defaultFormatInstructions;
  if (defaultInstruction) config.defaultInstruction = defaultInstruction;
  
  config.onTransformRequested = (request: TextTransformRequest) => {
    // For now, just show an alert with the request details
    const message = `
Transform Request:
- Text: ${request.textToChange.substring(0, 100)}${request.textToChange.length > 100 ? '...' : ''}
- Instruction: ${request.transformInstruction}
${request.context ? `- Context: ${request.context}` : ''}
${request.formatInstructions ? `- Format: ${request.formatInstructions}` : ''}

AI transformation would happen here!`;
    
    alert(message);
  };
  
  const modal = new TextTransformModal(config);
  void modal.open();
}

/**
 * Transform selected text - simplified version
 */
export function transformSelectedText(selectedText: string): void {
  openTextTransformModal(selectedText, undefined, undefined, 'Improve clarity and readability');
}

/**
 * Transform text with context - simplified version
 */
export function transformTextWithContext(text: string, context: string): void {
  openTextTransformModal(text, context, undefined, 'Enhance and improve this text while maintaining its core meaning');
}

/**
 * Quick format transformation - simplified version
 */
export function quickFormatTransform(text: string, format: 'bullet-points' | 'paragraphs' | 'formal' | 'casual'): void {
  const formatInstructions = {
    'bullet-points': 'Convert to clear bullet points',
    'paragraphs': 'Format as well-structured paragraphs',
    'formal': 'Use formal, professional language',
    'casual': 'Use casual, conversational language'
  };
  
  const formatDetails = format === 'bullet-points' ? 'Use bullet points (•) for main items' : undefined;
  
  openTextTransformModal(text, undefined, formatDetails, formatInstructions[format]);
}

/**
 * Example of how to use the modal with a callback for the result
 */
export function openTextTransformModalWithCallback(
  text: string,
  onComplete: (transformedText: string) => void
): void {
  const config: TextTransformModalConfig = {
    id: 'text-transform-modal-with-callback',
    defaultText: text,
    onTransformRequested: (request: TextTransformRequest) => {
      // This is where you would implement AI transformation
      // For now, we'll simulate a transformation
      const simulatedResult = `[TRANSFORMED] ${request.textToChange} [END TRANSFORM]`;
      
      // Call the completion callback
      onComplete(simulatedResult);
    }
  };
  
  const modal = new TextTransformModal(config);
  void modal.open();
}