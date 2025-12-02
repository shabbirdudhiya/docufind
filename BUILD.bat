@echo off
title DocuFind - Production Build
color 0B

echo.
echo ============================================
echo   DocuFind Production Build (Windows + Mac)
echo ============================================
echo.

echo Building for Windows and macOS...
echo This may take a few minutes...
echo.

call npm run dist:winmac

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo Build FAILED! Check the errors above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   BUILD SUCCESSFUL!
echo ============================================
echo.
echo Your installers are in the 'dist' folder:
echo.
dir /b dist\*.exe dist\*.dmg dist\*.zip 2>nul
echo.
echo Opening dist folder...
start "" "dist"
echo.
pause
