# DocuFind Release Script
# Usage: .\release.ps1 [-Message "commit message"]

param(
    [string]$Message = ""
)

# Colors for output
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Warn { param($msg) Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[XX] $msg" -ForegroundColor Red }

# Get version from tauri.conf.json
$tauriConfig = Get-Content "src-tauri/tauri.conf.json" | ConvertFrom-Json
$version = $tauriConfig.version
$tagName = "v$version"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "       DocuFind Release Script         " -ForegroundColor Magenta  
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

Write-Info "Version: $version"
Write-Info "Tag: $tagName"
Write-Host ""

# Check if tag already exists
$existingTag = git tag -l $tagName
if ($existingTag) {
    Write-Err "Tag $tagName already exists!"
    Write-Warn "To release a new version, update 'version' in src-tauri/tauri.conf.json first."
    Write-Host ""
    $currentTags = git tag -l "v*" | Sort-Object -Descending | Select-Object -First 5
    Write-Host "Recent tags:" -ForegroundColor Gray
    $currentTags | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    exit 1
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Info "Uncommitted changes detected:"
    git status --short
    Write-Host ""
    
    if (-not $Message) {
        $Message = Read-Host "Enter commit message (or press Enter for default)"
        if (-not $Message) {
            $Message = "Release $tagName"
        }
    }
    
    Write-Info "Staging all changes..."
    git add .
    
    Write-Info "Committing with message: '$Message'"
    git commit -m $Message
    
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Commit failed!"
        exit 1
    }
    Write-Success "Changes committed"
} else {
    Write-Info "No uncommitted changes"
}

# Push commits to origin
Write-Info "Pushing commits to origin..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Err "Push failed!"
    exit 1
}
Write-Success "Commits pushed"

# Create and push tag
Write-Info "Creating tag $tagName..."
git tag $tagName
if ($LASTEXITCODE -ne 0) {
    Write-Err "Tag creation failed!"
    exit 1
}
Write-Success "Tag created"

Write-Info "Pushing tag to origin..."
git push origin $tagName
if ($LASTEXITCODE -ne 0) {
    Write-Err "Tag push failed!"
    exit 1
}
Write-Success "Tag pushed"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Success "Release $tagName initiated!"
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to: https://github.com/shabbirdudhiya/docufind/actions" -ForegroundColor White
Write-Host "  2. Wait for the build to complete (~5-10 minutes)" -ForegroundColor White
Write-Host "  3. Go to: https://github.com/shabbirdudhiya/docufind/releases" -ForegroundColor White
Write-Host "  4. Edit the draft release and click 'Publish'" -ForegroundColor White
Write-Host ""
Write-Host "Your installed app will auto-detect the update after publishing!" -ForegroundColor Cyan
Write-Host ""
