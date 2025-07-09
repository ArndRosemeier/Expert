#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced bulk fix script for floating promises
 * Adds 'void' operator to common floating promise patterns
 */

function fixFloatingPromises(content) {
    let fixed = content;
    let changes = 0;
    
    // Pattern 1: setTimeout(() => { ... })
    fixed = fixed.replace(/(\s+)(setTimeout\()/g, (match, indent, func) => {
        changes++;
        return `${indent}void ${func}`;
    });
    
    // Pattern 2: setInterval(() => { ... })
    fixed = fixed.replace(/(\s+)(setInterval\()/g, (match, indent, func) => {
        changes++;
        return `${indent}void ${func}`;
    });
    
    // Pattern 3: Promise-returning method calls without await/void
    // Match: someObject.promiseMethod() at start of line
    fixed = fixed.replace(/^(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*\([^)]*\))(;\s*$)/gm, 
        (match, indent, call, ending) => {
            // Skip if already has void or await
            if (call.includes('await ') || call.includes('void ')) {
                return match;
            }
            // Only fix if it looks like a promise (common method names)
            if (call.match(/\.(initialize|loadConfig|save|load|update|refresh|close|show|hide|generate|process|create|delete|fetch|post|get|put)\(/)) {
                changes++;
                return `${indent}void ${call}${ending}`;
            }
            return match;
        }
    );
    
    // Pattern 4: import().then() chains
    fixed = fixed.replace(/^(\s+)(import\([^)]+\)\.then\([^}]+\}[^;]*)(;\s*$)/gm, 
        (match, indent, chain, ending) => {
            if (!chain.includes('void ')) {
                changes++;
                return `${indent}void ${chain}${ending}`;
            }
            return match;
        }
    );
    
    // Pattern 5: Modal/dialog method calls that return promises
    fixed = fixed.replace(/^(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*\.(show|open|close|destroy|modal)\([^)]*\))(;\s*$)/gm,
        (match, indent, call, ending) => {
            if (!call.includes('await ') && !call.includes('void ')) {
                changes++;
                return `${indent}void ${call}${ending}`;
            }
            return match;
        }
    );
    
    // Pattern 6: Service method calls (common async patterns)
    fixed = fixed.replace(/^(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*Service\.[a-zA-Z_$][a-zA-Z0-9_$]*\([^)]*\))(;\s*$)/gm,
        (match, indent, call, ending) => {
            if (!call.includes('await ') && !call.includes('void ')) {
                changes++;
                return `${indent}void ${call}${ending}`;
            }
            return match;
        }
    );
    
    // Pattern 7: Promise constructor or static methods
    fixed = fixed.replace(/^(\s+)(Promise\.(resolve|reject|all|race)\([^)]*\))(;\s*$)/gm,
        (match, indent, call, ending) => {
            if (!call.includes('await ') && !call.includes('void ')) {
                changes++;
                return `${indent}void ${call}${ending}`;
            }
            return match;
        }
    );
    
    // Pattern 8: this.methodName() calls that are likely async
    fixed = fixed.replace(/^(\s+)(this\.[a-zA-Z_$][a-zA-Z0-9_$]*\([^)]*\))(;\s*$)/gm,
        (match, indent, call, ending) => {
            if (!call.includes('await ') && !call.includes('void ')) {
                // Only fix if method name suggests it's async
                if (call.match(/this\.(save|load|update|refresh|close|show|hide|generate|process|create|delete|fetch|initialize|destroy|render)\(/)) {
                    changes++;
                    return `${indent}void ${call}${ending}`;
                }
            }
            return match;
        }
    );
    
    return { content: fixed, changes };
}

function fixTypesInFile(content) {
    let fixed = content;
    let changes = 0;
    
    // Replace error?: any with error?: unknown
    fixed = fixed.replace(/error\?\s*:\s*any/g, () => {
        changes++;
        return 'error?: unknown';
    });
    
    // Replace catch (e: any) with catch (e: unknown)
    fixed = fixed.replace(/catch\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*any\s*\)/g, (match, varName) => {
        changes++;
        return `catch (${varName}: unknown)`;
    });
    
    // Replace callback parameters like (e: any) => with (e: unknown) =>
    fixed = fixed.replace(/\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*any\s*\)\s*=>/g, (match, varName) => {
        changes++;
        return `(${varName}: unknown) =>`;
    });
    
    // Replace function parameters: any with : unknown
    fixed = fixed.replace(/:\s*any\b(?!\[\])/g, () => {
        changes++;
        return ': unknown';
    });
    
    return { content: fixed, changes };
}

function processFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const promiseResult = fixFloatingPromises(content);
    const typeResult = fixTypesInFile(promiseResult.content);
    
    const totalChanges = promiseResult.changes + typeResult.changes;
    
    if (totalChanges > 0) {
        fs.writeFileSync(filePath, typeResult.content);
        console.log(`✅ Fixed ${filePath}: ${promiseResult.changes} floating promises, ${typeResult.changes} type issues`);
        return true;
    } else {
        console.log(`ℹ️  No changes needed in ${filePath}`);
        return false;
    }
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node fix-floating-promises.js <file1> [file2] ...');
        console.log('Example: node fix-floating-promises.js src/ui/project-ui.ts');
        process.exit(1);
    }
    
    let totalFixed = 0;
    
    for (const filePath of args) {
        if (processFile(filePath)) {
            totalFixed++;
        }
    }
    
    console.log(`\n🎉 Processed ${args.length} files, made changes to ${totalFixed} files`);
}

// ES module main detection
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    main();
}

export { fixFloatingPromises, fixTypesInFile, processFile }; 