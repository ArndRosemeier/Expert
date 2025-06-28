/**
 * Simple test to verify AI log retrieval is working
 */

import { AILogService } from './AILogService';

export async function testAILogRetrieval(): Promise<void> {
    console.log('🧪 Testing AI Log Retrieval...');
    
    try {
        const aiLogService = AILogService.getInstance();
        
        // Try to get all logs
        const logs = await aiLogService.getAllLogs();
        
        console.log(`📊 Retrieved ${logs.length} AI log entries`);
        
        if (logs.length > 0) {
            console.log('✅ AI Log retrieval working correctly');
            console.log('📋 Sample log:', {
                id: logs[0].id,
                timestamp: logs[0].timestamp,
                purpose: logs[0].purpose,
                model: logs[0].model,
                hasPrompt: !!logs[0].prompt,
                hasResponse: !!logs[0].response
            });
        } else {
            console.log('⚠️ No logs found - either none exist or there\'s still an issue');
        }
        
    } catch (error) {
        console.error('❌ AI Log retrieval test failed:', error);
        throw error;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    (window as any).testAILogRetrieval = testAILogRetrieval;
} 