@echo off
title Pneuma Chat Server
cd /d "%~dp0"

echo.
echo  ==============================
echo   Pneuma Chat Server
echo  ==============================
echo.

:: Sprawdz czy node jest dostepny
where node >nul 2>&1
if errorlevel 1 (
    echo  [BLAD] Node.js nie znaleziony. Zainstaluj node.js i sprobuj ponownie.
    pause
    exit /b 1
)

:: Sprawdz czy .env istnieje
if not exist ".env" (
    echo  [UWAGA] Brak pliku .env - kopiuje z .env.example
    copy ".env.example" ".env" >nul
    echo  [INFO] Uzupelnij .env o klucze API przed uruchomieniem
    echo.
)

:: Sprawdz czy node_modules istnieje
if not exist "node_modules" (
    echo  [INFO] Instaluje zaleznosci...
    npm install
    echo.
)

:: Zwolnij port 3333 jesli zajety
echo  [INFO] Sprawdzam port 3333...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R "0\.0\.0\.0:3333 \[::\]:3333"') do (
    echo  [INFO] Zamykam stary proces na porcie 3333 ^(PID %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)

echo  Chat:    http://localhost:3333
echo  Import:  http://localhost:3333/import
echo.
echo  Zatrzymaj: Ctrl+C
echo  ==============================
echo.

node server.js

pause
