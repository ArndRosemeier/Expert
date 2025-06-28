# Deploy to DomainFactory - Expert Application
# This script builds the project for production hosting on domainfactory

# Stop on errors
$ErrorActionPreference = "Stop"

Write-Host "🚀 Building Expert Application for DomainFactory..." -ForegroundColor Cyan

try {
    # Clean previous build
    if (Test-Path "dist") {
        Write-Host "🧹 Cleaning previous build..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force "dist"
    }

    # Build for production
    Write-Host "🔨 Building for production..." -ForegroundColor Yellow
    npm run build:production

    # Check if build was successful
    if (Test-Path "dist/index.html") {
        Write-Host "✅ Build completed successfully!" -ForegroundColor Green
        
        # Display deployment information
        Write-Host ""
        Write-Host "📦 Deployment Files Ready!" -ForegroundColor Cyan
        Write-Host "================================" -ForegroundColor Cyan
        Write-Host "Build output location: $(Resolve-Path 'dist')" -ForegroundColor White
        Write-Host ""
        Write-Host "📁 Files to upload to your domainfactory domain:" -ForegroundColor Yellow
        Get-ChildItem -Path "dist" -Recurse | ForEach-Object {
            $relativePath = $_.FullName.Replace((Resolve-Path "dist").Path, "").TrimStart('\')
            Write-Host "   $relativePath" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "🌐 Deployment Instructions:" -ForegroundColor Cyan
        Write-Host "============================" -ForegroundColor Cyan
        Write-Host "1. Log into your DomainFactory control panel" -ForegroundColor White
        Write-Host "2. Navigate to File Manager or use FTP/SFTP" -ForegroundColor White
        Write-Host "3. Upload ALL files from the 'dist' folder to your domain's root directory" -ForegroundColor White
        Write-Host "   (usually 'html' or 'public_html' folder)" -ForegroundColor White
        Write-Host "4. Ensure index.html is in the root of your web directory" -ForegroundColor White
        Write-Host ""
        Write-Host "📋 FTP/SFTP Details (you'll need these from DomainFactory):" -ForegroundColor Yellow
        Write-Host "   • Server: your-domain.de (or ftp.your-domain.de)" -ForegroundColor Gray
        Write-Host "   • Username: your FTP username" -ForegroundColor Gray
        Write-Host "   • Password: your FTP password" -ForegroundColor Gray
        Write-Host "   • Port: 21 (FTP) or 22 (SFTP)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "🔧 Optional: You can also create a ZIP file of the dist folder" -ForegroundColor Cyan
        Write-Host "    and extract it directly on your server if your hosting supports it." -ForegroundColor Cyan
        
        # Offer to create a ZIP file
        Write-Host ""
        $createZip = Read-Host "Would you like to create a ZIP file for easy upload? (y/n)"
        if ($createZip -eq 'y' -or $createZip -eq 'Y') {
            $zipName = "expert-production-$(Get-Date -Format 'yyyy-MM-dd-HHmm').zip"
            Write-Host "📦 Creating ZIP file: $zipName" -ForegroundColor Yellow
            Compress-Archive -Path "dist\*" -DestinationPath $zipName -Force
            Write-Host "✅ ZIP file created: $(Resolve-Path $zipName)" -ForegroundColor Green
            Write-Host "   Upload and extract this ZIP file to your domain's root directory." -ForegroundColor Gray
        }
        
    } else {
        throw "Build failed - index.html not found in dist folder"
    }

} catch {
    Write-Host "❌ Deployment preparation failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Ready for deployment to DomainFactory!" -ForegroundColor Green 