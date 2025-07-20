#!/usr/bin/env pwsh

# Setup script for robust TypeScript type checking enforcement
# Run this once to configure your development environment

Write-Host "🔧 Setting up robust TypeScript type checking..." -ForegroundColor Blue

# Check if we're in a git repository
if (-not (Test-Path .git)) {
    Write-Host "❌ Not in a git repository" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing/updating dependencies..." -ForegroundColor Yellow
npm install

# Configure git hooks
Write-Host "🔗 Configuring git hooks..." -ForegroundColor Yellow
git config core.hooksPath ./.git/hooks

# Create hooks directory if it doesn't exist
$hooksDir = "./.git/hooks"
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force
}

# Copy pre-commit hook
$preCommitHook = "$hooksDir/pre-commit"
Copy-Item "./pre-commit-hook.ps1" $preCommitHook -Force

# Make pre-commit hook executable (if on Unix-like system)
if ($IsLinux -or $IsMacOS) {
    chmod +x $preCommitHook
}

# Run initial type check to show current status
Write-Host "🔍 Running initial type check..." -ForegroundColor Yellow
$typecheckResult = & npm run typecheck 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  There are currently TypeScript errors:" -ForegroundColor Yellow
    Write-Host $typecheckResult -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Summary:" -ForegroundColor Blue
    Write-Host "  • Type checking is now enforced on every commit" -ForegroundColor White
    Write-Host "  • Fix the above errors to be able to commit" -ForegroundColor White
    Write-Host "  • Use 'npm run typecheck' to check types manually" -ForegroundColor White
    Write-Host "  • Use 'npm run typecheck:watch' for live type checking" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 To fix all current errors at once:" -ForegroundColor Green
    Write-Host "  npm run fix-all" -ForegroundColor Cyan
} else {
    Write-Host "✅ No TypeScript errors found!" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Setup complete! TypeScript type checking is now enforced." -ForegroundColor Green
Write-Host ""
Write-Host "📚 Available commands:" -ForegroundColor Blue
Write-Host "  npm run typecheck         - Check types once" -ForegroundColor White
Write-Host "  npm run typecheck:watch   - Watch and check types continuously" -ForegroundColor White
Write-Host "  npm run check-all          - Run both type checking and linting" -ForegroundColor White
Write-Host "  npm run fix-all            - Auto-fix linting, then check types" -ForegroundColor White
Write-Host ""
Write-Host "🔒 From now on:" -ForegroundColor Yellow
Write-Host "  • All builds require clean type checking" -ForegroundColor White
Write-Host "  • All commits require clean type checking" -ForegroundColor White
Write-Host "  • CI/CD will enforce type checking" -ForegroundColor White 