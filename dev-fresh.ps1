#!/usr/bin/env pwsh
# Fresh Development Start Script
# This script ensures a completely clean development environment

Write-Host "🧹 Starting fresh development environment..." -ForegroundColor Green

# Kill any existing Vite processes
Write-Host "🔪 Killing existing Vite processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Clear Vite cache
Write-Host "🗑️ Clearing Vite cache..." -ForegroundColor Yellow
if (Test-Path "node_modules/.vite") {
    Remove-Item "node_modules/.vite" -Recurse -Force -ErrorAction SilentlyContinue
}

# Clear dist folder
Write-Host "🗑️ Clearing dist folder..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force -ErrorAction SilentlyContinue
}

# Clear browser cache instruction
Write-Host "🌐 IMPORTANT: Please clear your browser cache or open in incognito mode!" -ForegroundColor Red
Write-Host "   Chrome: Ctrl+Shift+Del, Firefox: Ctrl+Shift+Del" -ForegroundColor Red

# Start Vite with fresh cache
Write-Host "🚀 Starting Vite development server..." -ForegroundColor Green
npm run dev -- --force

Write-Host "✅ Development server started!" -ForegroundColor Green
Write-Host "💡 If you still have issues, try:" -ForegroundColor Cyan
Write-Host "   1. Open browser in incognito/private mode" -ForegroundColor Cyan
Write-Host "   2. Hard refresh: Ctrl+Shift+R (Chrome) or Ctrl+F5 (Firefox)" -ForegroundColor Cyan
Write-Host "   3. Disable browser cache in DevTools (F12 → Network → Disable Cache)" -ForegroundColor Cyan 