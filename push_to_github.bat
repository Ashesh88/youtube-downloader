@echo off
title Push to GitHub - TubePull
cd /d "%~dp0"

echo ========================================================
echo   Pushing TubePull to GitHub (Ashesh88)
echo ========================================================
echo.

set /p REPO_NAME="Enter your GitHub repository name (default: youtube-downloader): "
if "%REPO_NAME%"=="" set REPO_NAME=youtube-downloader

set REPO_URL=https://github.com/Ashesh88/%REPO_NAME%.git

echo.
echo Target Repository: %REPO_URL%
echo.
echo [1/3] Adding git remote...
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo [2/3] Setting branch to main...
git branch -M main

echo [3/3] Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Code successfully pushed to GitHub!
    echo URL: https://github.com/Ashesh88/%REPO_NAME%
    echo ========================================================
) else (
    echo.
    echo [NOTE] Agar repository GitHub par exist nahi karti:
    echo 1. Browser me https://github.com/new kholein
    echo 2. Repository name daalein: %REPO_NAME%
    echo 3. 'Create repository' dabayein aur yeh script dobara chalayein!
)

echo.
pause
