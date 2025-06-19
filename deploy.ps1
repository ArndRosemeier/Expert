# This script builds the project and deploys it to GitHub Pages.

# Stop on errors
$ErrorActionPreference = "Stop"

# Inform the user
Write-Host "Starting deployment to GitHub Pages..."

try {
    # Run the deployment script from package.json
    npm run deploy

    Write-Host "Deployment script finished successfully." -ForegroundColor Green
    Write-Host "Please ensure your repository is configured to use the 'gh-pages' branch for GitHub Pages."
}
catch {
    Write-Host "Deployment failed." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    # Exit with a non-zero status code to indicate failure
    exit 1
} 