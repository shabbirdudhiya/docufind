# DocuFind Build Script for Windows & macOS
# Run: .\build.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DocuFind Production Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean previous builds
Write-Host "[1/4] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
}
Write-Host "  Done!" -ForegroundColor Green

# Step 2: Install dependencies (if needed)
Write-Host "[2/4] Checking dependencies..." -ForegroundColor Yellow
npm install --silent
Write-Host "  Done!" -ForegroundColor Green

# Step 3: Build Next.js
Write-Host "[3/4] Building Next.js app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

# Step 4: Package for Windows and macOS
Write-Host "[4/4] Packaging for Windows & macOS..." -ForegroundColor Yellow
npx electron-builder --win --mac
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Packaging failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your installers are ready in the 'dist' folder:" -ForegroundColor White
Write-Host ""

# List the built files
if (Test-Path "dist") {
    Get-ChildItem "dist" -File | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Press any key to open the dist folder..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Invoke-Item "dist"
