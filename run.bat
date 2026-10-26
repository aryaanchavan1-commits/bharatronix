@echo off
REM ============================================================
REM  BHARATRONIX - ERP Software Store
REM  One-click launcher for Windows
REM  Usage:  run.bat        (production build + start)
REM          run.bat dev    (development mode with hot reload)
REM ============================================================
setlocal
title Bharatronix ERP Store
cd /d "%~dp0"

echo.
echo  ==============================================
echo   BHARATRONIX  ^|  ERP Software Store
echo   Founded by Parth Ambre ^& Aryan Chavan
echo  ==============================================
echo.

REM --- 1. Check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo         Download it from https://nodejs.org  (v20 or newer^)
    pause
    exit /b 1
)
echo [1/6] Node.js found:
node -v

REM --- 2. Environment file ---
if not exist ".env" (
    echo [2/6] Creating .env with default local database URL...
    echo DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db> .env
    echo       Edit .env if your PostgreSQL credentials differ.
) else (
    echo [2/6] .env found.
)

REM --- 3. Install dependencies ---
if not exist "node_modules" (
    echo [3/6] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [3/6] Dependencies already installed.
)

REM --- 4. Create database tables ---
echo [4/6] Syncing database schema...
call npx drizzle-kit push --force
if errorlevel 1 (
    echo [WARN] Could not sync schema. Is PostgreSQL running and DATABASE_URL correct?
    echo        Get a free cloud database at https://neon.tech and put its URL in .env
)

REM --- 5. Seed products ---
echo [5/6] Seeding Bharatronix product catalog...
call node scripts/seed.mjs

REM --- 6. Build & launch ---
if /i "%1"=="dev" (
    echo [6/6] Starting DEVELOPMENT server at http://localhost:3000
    call npm run dev
) else (
    echo [6/6] Building for production...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed. See messages above.
        pause
        exit /b 1
    )
    echo.
    echo  ==============================================
    echo   Store is live at  http://localhost:3000
    echo   Press Ctrl+C to stop the server.
    echo  ==============================================
    echo.
    call npm run start
)

endlocal
pause