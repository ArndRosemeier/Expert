/**
 * Application-wide constants and default values
 * This file centralizes all constants to avoid duplication across the codebase
 */

// === Generation Settings ===
export const DEFAULT_MAX_ITERATIONS = 3;
export const MIN_MAX_ITERATIONS = 1;
export const MAX_MAX_ITERATIONS = 10;

// === UI Configuration ===

// === UI Icons ===
export const AI_ASSISTANT_EMOJI = '💡';

// === Storage Keys ===
export const STORAGE_KEYS = {
    SETTINGS_PROFILES: 'expert_app_settings_profiles',
    LAST_USED_PROFILE: 'expert_app_last_used_profile',
    PROMPTS: 'expert_app_prompts',
    AI_LOGGING_ENABLED: 'expert_app_ai_logging_enabled',
    CURRENT_PROJECT: 'expert_app_current_project',
    PROJECTS: 'expert_app_projects',
    ACTIVE_PROJECT: 'expert_app_active_project',
    PROJECT_TEMPLATES: 'expert_app_project_templates',
    APP_KEY: 'expert_app_key',
    READER_CONFIG: 'expert_app_reader_config',
    // COLLAPSED_NODES removed - now stored per-node in DocumentNode.collapsed property
    CHECKBOX_STATES: 'expert_app_checkbox_states',
    LAST_CHAT_MODEL: 'expert_app_last_chat_model',
    GLOBAL_LANGUAGE: 'expert_app_global_language'
} as const;

// === Default Content ===
export const DEFAULT_CONTEXT_EXTRACTION_PROMPT = `You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`;

// === API Configuration ===

// === UI Limits ===

// === Modal Configuration ===

// === File Types ===

// === Version ===
 