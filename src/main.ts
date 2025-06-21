import { initialize } from './event-handlers';

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    console.log('Clean start requested. Clearing local storage...');
    localStorage.removeItem('openrouter_api_key');
    localStorage.removeItem('openrouter_model_purposes');
    localStorage.removeItem('expert_app_prompts');
    localStorage.removeItem('expert_app_settings_profiles');
    localStorage.removeItem('expert_app_settings_last_profile');
    localStorage.removeItem('expert_app_current_project');
    
    // Redirect to the same page without the query parameter
    window.location.href = window.location.pathname;
}

document.addEventListener('DOMContentLoaded', initialize); 