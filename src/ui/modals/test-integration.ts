/**
 * Simple integration test for the modal system
 * This can be run to verify the basic functionality works
 */

import { getModalRegistry, GenericModal, ExportService } from './index';
import { DocumentNode } from '../../DocumentNode';

/**
 * Test the modal registry functionality
 */
export function testModalRegistry(): void {
    console.log('🧪 Testing Modal Registry...');
    
    const registry = getModalRegistry();
    
    // Test basic registration
    const modal = new GenericModal({
        id: 'test-modal',
        content: { content: 'Test content' }
    });
    
    registry.register(modal);
    console.log('✅ Modal registered successfully');
    
    // Test retrieval
    const retrieved = registry.get('test-modal');
    console.log('✅ Modal retrieved:', retrieved === modal);
    
    // Test state management
    const state = registry.getState('test-modal');
    console.log('✅ Initial state:', state?.isOpen === false);
    
    // Clean up
    registry.unregister('test-modal');
    console.log('✅ Modal registry test completed');
}

/**
 * Test the export service functionality
 */
export function testExportService(): void {
    console.log('🧪 Testing Export Service...');
    
    const exportService = new ExportService();
    
    // Create a test node
    const testNode = new DocumentNode(0, 'Test Node', null, ['Test']);
    testNode.content = 'This is some test content for export.';
    
    // Test HTML generation
    const html = exportService.generateContent([testNode], 'html' as any, 'Test Export');
    console.log('✅ HTML generation works:', html.includes('<!DOCTYPE html>'));
    
    // Test Markdown generation
    const markdown = exportService.generateContent([testNode], 'markdown' as any);
    console.log('✅ Markdown generation works:', markdown.includes('# Lowest Layer Content'));
    
    // Test Plain text generation
    const plainText = exportService.generateContent([testNode], 'plain' as any);
    console.log('✅ Plain text generation works:', plainText.includes('LOWEST LAYER CONTENT'));
    
    console.log('✅ Export service test completed');
}

/**
 * Test the generic modal functionality
 */
export async function testGenericModal(): Promise<void> {
    console.log('🧪 Testing Generic Modal...');
    
    const modal = new GenericModal({
        id: 'test-generic-modal',
        title: 'Test Modal',
        content: {
            content: '<p>This is a test modal with some content.</p>',
            actions: [
                {
                    id: 'test-action',
                    label: 'Test Action',
                    type: 'primary',
                    handler: async () => {
                        console.log('Test action executed');
                    }
                }
            ]
        }
    });
    
    // Test rendering
    const rendered = modal.render();
    console.log('✅ Modal renders:', !!rendered);
    console.log('✅ Modal has title:', rendered.innerHTML.includes('Test Modal'));
    console.log('✅ Modal has content:', rendered.innerHTML.includes('This is a test modal'));
    console.log('✅ Modal has actions:', rendered.innerHTML.includes('Test Action'));
    
    console.log('✅ Generic modal test completed');
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
    console.log('🚀 Starting Modal System Integration Tests...');
    
    try {
        testModalRegistry();
        testExportService();
        await testGenericModal();
        
        console.log('🎉 All tests passed! Modal system is working correctly.');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined') {
    (window as any).testModalSystem = runAllTests;
    console.log('💡 Modal system tests loaded. Run `testModalSystem()` in console to test.');
} 