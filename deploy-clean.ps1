# Expert Application - Complete Clean Deployment Script
# This script completely wipes the remote directory and uploads fresh files

param()

$ErrorActionPreference = "Stop"

$FTP_SERVER = "ftp.futuremagic.de"
$FTP_USER = "12529-Pyrion"
$FTP_REMOTE_PATH = "/webseiten/Expert/"

Write-Host "Starting COMPLETE CLEAN deployment..." -ForegroundColor Red
Write-Host "This will delete ALL files in the remote Expert directory!" -ForegroundColor Yellow

try {
    Write-Host "Cleaning build folder..." -ForegroundColor Yellow
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force "dist"
    }

    Write-Host "Building application..." -ForegroundColor Yellow
    npm run build

    Write-Host "Copying .htaccess..." -ForegroundColor Yellow
    Copy-Item "public/.htaccess" "dist/.htaccess" -Force

    if (Test-Path "dist/index.html") {
        Write-Host "Build successful!" -ForegroundColor Green
        
        # Try to get password from multiple sources
        $FTP_PASSWORD = $env:FTP_PASSWORD
        
        # If not in current session, try to refresh from user environment
        if (-not $FTP_PASSWORD) {
            try {
                $FTP_PASSWORD = [Environment]::GetEnvironmentVariable("FTP_PASSWORD", "User")
                if ($FTP_PASSWORD) {
                    Write-Host "Retrieved password from user environment variables" -ForegroundColor Green
                    $env:FTP_PASSWORD = $FTP_PASSWORD  # Set for current session
                }
            } catch {
                # Ignore errors
            }
        }
        
        # If still no password, prompt user
        if (-not $FTP_PASSWORD) {
            Write-Host "Enter FTP password:" -ForegroundColor Yellow
            $SecurePassword = Read-Host -AsSecureString
            $FTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
        } else {
            Write-Host "Using stored password" -ForegroundColor Green
        }
        
        Write-Host "COMPLETELY CLEANING remote directory..." -ForegroundColor Red
        
        # Function to recursively delete everything in remote directory
        function Remove-FTPDirectory {
            param([string]$RemotePath)
            
            try {
                # List directory contents
                $listRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$RemotePath")
                $listRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails
                $listRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
                
                $response = $listRequest.GetResponse()
                $responseStream = $response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($responseStream)
                $listing = $reader.ReadToEnd()
                $reader.Close()
                $response.Close()
                
                $lines = $listing.Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)
                
                foreach ($line in $lines) {
                    if ($line.Trim() -and -not $line.StartsWith("total")) {
                        # Parse FTP listing (basic parsing)
                        $parts = $line.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
                        if ($parts.Length -gt 0) {
                            $fileName = $parts[-1]  # Last part is usually filename
                            $isDirectory = $line.StartsWith("d")
                            
                            if ($fileName -and $fileName -ne "." -and $fileName -ne "..") {
                                $fullPath = "$RemotePath$fileName"
                                
                                if ($isDirectory) {
                                    Write-Host "Removing directory: $fileName" -ForegroundColor Red
                                    Remove-FTPDirectory "$fullPath/"
                                    
                                    # Remove empty directory
                                    try {
                                        $rmDirRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$fullPath")
                                        $rmDirRequest.Method = [System.Net.WebRequestMethods+Ftp]::RemoveDirectory
                                        $rmDirRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
                                        $rmDirResponse = $rmDirRequest.GetResponse()
                                        $rmDirResponse.Close()
                                    } catch {
                                        Write-Host "Could not remove directory $fileName" -ForegroundColor Gray
                                    }
                                } else {
                                    Write-Host "Removing file: $fileName" -ForegroundColor Red
                                    try {
                                        $deleteRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$fullPath")
                                        $deleteRequest.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
                                        $deleteRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
                                        $deleteResponse = $deleteRequest.GetResponse()
                                        $deleteResponse.Close()
                                    } catch {
                                        Write-Host "Could not remove file $fileName" -ForegroundColor Gray
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {
                Write-Host "Could not list directory $RemotePath" -ForegroundColor Gray
            }
        }
        
        # Clean the main directory
        Remove-FTPDirectory $FTP_REMOTE_PATH
        
        Write-Host "Uploading fresh files..." -ForegroundColor Green
        
        $files = Get-ChildItem -Path "dist" -Recurse -File
        $uploaded = 0
        
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring((Resolve-Path "dist").Path.Length + 1).Replace('\', '/')
            $remoteFile = "$FTP_REMOTE_PATH$relativePath"
            
            # Create directory if needed
            $pathParts = $relativePath.Split('/')
            if ($pathParts.Length -gt 1) {
                $currentPath = $FTP_REMOTE_PATH
                for ($i = 0; $i -lt ($pathParts.Length - 1); $i++) {
                    $currentPath = "$currentPath$($pathParts[$i])/"
                    try {
                        $mkdirRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$currentPath")
                        $mkdirRequest.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
                        $mkdirRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
                        $mkdirResponse = $mkdirRequest.GetResponse()
                        $mkdirResponse.Close()
                        Write-Host "Created directory: $($pathParts[$i])" -ForegroundColor Blue
                    } catch {
                        # Directory might already exist, ignore error
                    }
                }
            }
            
            try {
                $ftpRequest = [System.Net.FtpWebRequest]::Create("ftp://$FTP_SERVER$remoteFile")
                $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
                $ftpRequest.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASSWORD)
                $ftpRequest.UseBinary = $true
                $ftpRequest.UsePassive = $true
                
                $fileContent = [System.IO.File]::ReadAllBytes($file.FullName)
                $ftpRequest.ContentLength = $fileContent.Length
                $requestStream = $ftpRequest.GetRequestStream()
                $requestStream.Write($fileContent, 0, $fileContent.Length)
                $requestStream.Close()
                
                $response = $ftpRequest.GetResponse()
                $response.Close()
                
                $uploaded++
                Write-Host "Uploaded: $relativePath" -ForegroundColor Green
            } catch {
                Write-Host "Failed: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
                throw
            }
        }
        
        Write-Host ""
        Write-Host "COMPLETE CLEAN DEPLOYMENT finished! Uploaded $uploaded files." -ForegroundColor Green
        Write-Host "App should now work at: https://futuremagic.de/Expert/" -ForegroundColor Cyan
        
    } else {
        throw "Build failed - no index.html found"
    }
} catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} 