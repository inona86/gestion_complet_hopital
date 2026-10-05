@echo off
echo.
echo  =============================================
echo   MediBase — Demarrage du serveur local
echo  =============================================
echo.

cd /d "%~dp0backend"

echo  [1/2] Verification des dependances...

IF NOT EXIST node_modules (
    echo  Installation des dependances...
    call npm install
) ELSE (
    echo  Dependances deja installees.
)

echo.
echo  [2/2] Demarrage du serveur...
echo.
echo  ➜  Ouvrir : http://localhost:3000
echo.

node server.js

pause