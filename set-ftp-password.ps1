# Helper script to set FTP password as environment variable
# This allows automated deployment without typing password each time

Write-Host "Setting FTP Password for automated deployment..." -ForegroundColor Cyan

# Get password securely
$SecurePassword = Read-Host "Enter your FTP password" -AsSecureString
$Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))

# Set environment variable for current session
$env:FTP_PASSWORD = $Password

# Set environment variable permanently for current user
[Environment]::SetEnvironmentVariable("FTP_PASSWORD", $Password, "User")

Write-Host "FTP password has been set!" -ForegroundColor Green
Write-Host "You can now run 'npm run deploy:domainfactory' without entering password." -ForegroundColor Yellow
Write-Host ""
Write-Host "Security Note: Password is stored in your user environment variables." -ForegroundColor Red
Write-Host "To remove it later, delete the FTP_PASSWORD environment variable." -ForegroundColor Gray 