# Script to check what files are actually on the FTP server
param()

$ErrorActionPreference = "Stop"

$FTP_SERVER = "ftp.futuremagic.de"
$FTP_USER = "12529-Pyrion"
$FTP_REMOTE_PATH = "/webseiten/Expert/"

Write-Host "Checking FTP server contents..." -ForegroundColor Cyan

$FTP_PASSWORD = $env:FTP_PASSWORD
if (-not $FTP_PASSWORD) {
    Write-Host "Enter FTP password:" -ForegroundColor Yellow
    $SecurePassword = Read-Host -AsSecureString
    $FTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
}

try {
    Write-Host "`nFiles in root Expert directory:" -ForegroundColor Green
    
    # List main directory
    $listRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$FTP_REMOTE_PATH")
    $listRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
    $listRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
    
    $response = $listRequest.GetResponse()
    $responseStream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($responseStream)
    $listing = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    
    $files = $listing.Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)
    foreach ($file in $files) {
        if ($file.Trim()) {
            Write-Host "  $file" -ForegroundColor White
        }
    }
    
    Write-Host "`nFiles in assets directory:" -ForegroundColor Green
    
    # List assets directory
    $assetsRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$FTP_REMOTE_PATH" + "assets/")
    $assetsRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
    $assetsRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
    
    $assetsResponse = $assetsRequest.GetResponse()
    $assetsResponseStream = $assetsResponse.GetResponseStream()
    $assetsReader = New-Object System.IO.StreamReader($assetsResponseStream)
    $assetsListing = $assetsReader.ReadToEnd()
    $assetsReader.Close()
    $assetsResponse.Close()
    
    $assetsFiles = $assetsListing.Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)
    $count = 0
    foreach ($file in $assetsFiles) {
        if ($file.Trim()) {
            $count++
            Write-Host "  $file" -ForegroundColor White
        }
    }
    
    Write-Host "`nSummary:" -ForegroundColor Yellow
    Write-Host "Local dist/assets has: 11 files" -ForegroundColor Green
    Write-Host "Remote FTP assets has: $count files" -ForegroundColor $(if ($count -eq 11) { "Green" } else { "Red" })
    
    if ($count -ne 11) {
        Write-Host "`n⚠️  PROBLEM: Remote assets folder has $count files but should have exactly 11!" -ForegroundColor Red
        Write-Host "This is why your website doesn't work - conflicting files!" -ForegroundColor Red
        Write-Host "`nSolution: Run 'npm run deploy:clean' again or create a stronger cleanup script." -ForegroundColor Yellow
    } else {
        Write-Host "`n✅ File count matches! The problem might be elsewhere." -ForegroundColor Green
    }
    
} catch {
    Write-Host "Error checking FTP: $($_.Exception.Message)" -ForegroundColor Red
} 