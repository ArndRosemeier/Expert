#!/usr/bin/env pwsh

# Pre-commit hook to enforce TypeScript type checking
# Install this by running: git config core.hooksPath ./

Write-Host "🔍 Running pre-commit checks..." -ForegroundColor Blue

# Check if we're in a git repository
if (-not (Test-Path .git)) {
    Write-Host "❌ Not in a git repository" -ForegroundColor Red
    exit 1
}

# Check if package.json exists
if (-not (Test-Path package.json)) {
    Write-Host "❌ package.json not found" -ForegroundColor Red
    exit 1
}

# Run TypeScript type checking
Write-Host "🔧 Running TypeScript type checking..." -ForegroundColor Yellow
$typecheckResult = & npm run typecheck 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ TypeScript type checking failed!" -ForegroundColor Red
    Write-Host $typecheckResult -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix TypeScript errors before committing." -ForegroundColor Yellow
    Write-Host "Run 'npm run typecheck' to see all errors." -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ TypeScript type checking passed" -ForegroundColor Green

# Run linting
Write-Host "📋 Running ESLint..." -ForegroundColor Yellow
$lintResult = & npm run lint 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Linting failed!" -ForegroundColor Red
    Write-Host $lintResult -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix linting errors before committing." -ForegroundColor Yellow
    Write-Host "Run 'npm run lint:fix' to auto-fix some errors." -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Linting passed" -ForegroundColor Green

Write-Host "🚀 All pre-commit checks passed! Proceeding with commit..." -ForegroundColor Green
exit 0 