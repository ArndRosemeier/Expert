#!/usr/bin/env node

/**
 * Script to clean up excessive logging in the codebase
 * Removes debug logs, makes system logs conditional, and reduces verbosity
 */

const fs = require('fs');
const path = require('path');

// Patterns to remove completely (debug/development logs)
const REMOVE_PATTERNS = [
    // Debug comments in logs
    /console\.log\(['"'][^'"]*Debug[^'"]*['"]\s*[,)][\s\S]*?\);?/gi,
    /console\.log\(['"'][^'"]*debug[^'"]*['"]\s*[,)][\s\S]*?\);?/gi,
    
    // OpenRouter debug logs
    /console\.log\('OpenRouter [^']*'[^;]*;/gi,
    
    // Workflow completion logs (too verbose)
    /console\.log\(`✅ AI (appended|replaced)[^`]*`[^;]*;/gi,
    /console\.log\('✅ AI (appended|replaced)[^']*'[^;]*;/gi,
    
    // Button click debug logs
    /console\.log\('🔴 Close button clicked[^;]*;/gi,
    
    // Command failure collection logs (internal debug)
    /console\.log\(`📝 Command failure collected[^`]*`[^;]*;/gi,
    
    // UI refresh logs (too verbose)
    /console\.log\('🔄 Triggered main UI refresh[^;]*;/gi,
    
    // hasUnsavedChanges debug logs
    /console\.log\('🔍 hasUnsavedChanges[^;]*;/gi,
    
    // Reset logs (too verbose for normal operation)
    /console\.log\('🔄 Reset (outline|context)[^;]*;/gi,
    
    // Coherence analysis completion logs (too verbose)
    /console\.log\('Coherence analysis completed[^;]*;/gi,
];

// Patterns to make conditional (wrap in debug flag)
const CONDITIONAL_PATTERNS = [
    // Model selector logs
    /console\.log\('🔄 Fetched \$\{[^}]*\} models from OpenRouter'\);/gi,
    /console\.log\('🔍 Current model selections[^;]*;/gi,
    /console\.log\('🔍 Model selections after validation[^;]*;/gi,
    /console\.log\('💾 Saving updated model selections[^;]*;/gi,
    /console\.log\(`📋 Pre-fetched endpoint information[^`]*`[^;]*;/gi,
    
    // Generation logs
    /console\.log\(`🎯 Bulk generation complete[^`]*`[^;]*;/gi,
    /console\.log\(`🔍 Auto-starting coherence analysis[^`]*`[^;]*;/gi,
    /console\.log\(`⏭️ Skipping auto-coherence check[^`]*`[^;]*;/gi,
    /console\.log\(`🔍 Coherence analysis (started|completed)[^`]*`[^;]*;/gi,
    /console\.log\(`⚠️ Coherence modal will be shown[^`]*`[^;]*;/gi,
];

// Files to process
const SRC_DIR = './src';

function getAllTypeScriptFiles(dir) {
    const files = [];
    
    function walkDir(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            
            if (entry.isDirectory()) {
                walkDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                files.push(fullPath);
            }
        }
    }
    
    walkDir(dir);
    return files;
}

function cleanupFile(filePath) {
    console.log(`Processing: ${filePath}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let changes = 0;
    
    // Remove patterns completely
    for (const pattern of REMOVE_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
            content = content.replace(pattern, '');
            changes += matches.length;
        }
    }
    
    // Make patterns conditional
    for (const pattern of CONDITIONAL_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
            content = content.replace(pattern, (match) => {
                return `if (process.env.NODE_ENV === 'development') { ${match} }`;
            });
            changes += matches.length;
        }
    }
    
    // Write back if changes were made
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log(`  ✅ Cleaned ${changes} logging statements`);
        return changes;
    } else {
        console.log(`  ⚪ No changes needed`);
        return 0;
    }
}

// Special handling for VersionService (make startup logs conditional)
function cleanupVersionService() {
    const filePath = './src/VersionService.ts';
    if (!fs.existsSync(filePath)) return 0;
    
    console.log(`Processing: ${filePath} (special handling)`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Make version logs conditional - only show in development or when explicitly requested
    const versionLogPattern = /console\.log\('🚀 Application Version Info:'\);[\s\S]*?console\.log\(`\s*Full Version: \$\{[^}]*\}`\);/;
    
    if (versionLogPattern.test(content)) {
        content = content.replace(versionLogPattern, (match) => {
            return `if (process.env.NODE_ENV === 'development' || process.env.SHOW_VERSION_INFO === 'true') {\n        ${match.replace(/\n\s*/g, '\n        ')}\n    }`;
        });
        
        fs.writeFileSync(filePath, content);
        console.log(`  ✅ Made version logs conditional`);
        return 1;
    }
    
    return 0;
}

// Main execution
function main() {
    console.log('🧹 Cleaning up excessive logging...\n');
    
    const files = getAllTypeScriptFiles(SRC_DIR);
    let totalChanges = 0;
    
    // Clean up regular files
    for (const file of files) {
        if (!file.includes('VersionService.ts')) {
            totalChanges += cleanupFile(file);
        }
    }
    
    // Special handling for VersionService
    totalChanges += cleanupVersionService();
    
    console.log(`\n🎉 Cleanup complete! Made ${totalChanges} changes across ${files.length} files.`);
    
    if (totalChanges > 0) {
        console.log('\n📝 Next steps:');
        console.log('1. Test the application to ensure functionality is preserved');
        console.log('2. Check console output to verify cleaner logging');
        console.log('3. Set NODE_ENV=development if you need debug logs during development');
    }
}

main();
