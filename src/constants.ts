/**
 * Application-wide constants and default values
 * This file centralizes all constants to avoid duplication across the codebase
 */

// === Generation Settings ===
export const DEFAULT_MAX_ITERATIONS = 3;
export const MIN_MAX_ITERATIONS = 1;
export const MAX_MAX_ITERATIONS = 10;

// === UI Configuration ===
export const DEFAULT_PROFILE_NAME = 'default';
export const MAX_PROFILE_NAME_LENGTH = 50;

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
    LAST_CHAT_MODEL: 'expert_app_last_chat_model'
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
export const API_CONFIG = {
    DEFAULT_TIMEOUT: 30000, // 30 seconds
    MAX_RETRIES: 3,
    RATE_LIMIT_DELAY: 1000 // 1 second
} as const;

// === UI Limits ===
export const UI_LIMITS = {
    MAX_GENERATION_COUNT: 20,
    MIN_GENERATION_COUNT: 1,
    MAX_READER_WIDTH: 3200,
    MIN_READER_WIDTH: 600,
    READER_WIDTH_STEP: 50
} as const;

// === Modal Configuration ===
export const MODAL_CONFIG = {
    AUTO_CLOSE_DELAY: 300, // milliseconds
    ANIMATION_DURATION: 200,
    MAX_WIDTH_VW: 80,
    MAX_HEIGHT_VH: 90
} as const;

// === File Types ===
export const SUPPORTED_FILE_TYPES = {
    JSON: '.json',
    TXT: '.txt',
    MD: '.md'
} as const;

// === Version ===
export const VERSION_CONFIG = {
    EXPORT_VERSION: '1.0',
    SCHEMA_VERSION: '1.0'
} as const; 