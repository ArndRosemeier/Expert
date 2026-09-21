# Code Quality Automation Script
# Run this regularly to maintain code quality

Write-Host "🔍 Running Comprehensive Code Quality Checks..." -ForegroundColor Cyan
Write-Host ""

# 1. Type Checking
Write-Host "📝 Step 1/3: Type Checking..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Type check failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Type check passed!" -ForegroundColor Green
Write-Host ""

# 2. Linting
Write-Host "🔧 Step 2/3: Linting..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Linting failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Linting passed!" -ForegroundColor Green
Write-Host ""

# 3. Code Duplication Check
Write-Host "🔄 Step 3/3: Checking for Code Duplication..." -ForegroundColor Yellow
npm run duplication:report
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Duplications found - see report for details" -ForegroundColor Yellow
} else {
    Write-Host "✅ No significant duplications!" -ForegroundColor Green
}
Write-Host ""

# Summary
Write-Host "📊 Quality Check Complete!" -ForegroundColor Cyan
Write-Host "View duplication report at: jscpd-report\html\index.html" -ForegroundColor Blue
Write-Host ""
