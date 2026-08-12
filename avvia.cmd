@echo off
rem Avvia il Gestore sessioni Claude Code compilato.
rem Fare doppio clic su questo file.
rem
rem Serve l'artefatto in .\out, prodotto da "npm run build". Se manca, questo
rem script lo costruisce da solo prima di avviare.

cd /d "%~dp0"

if not exist "out\main\index.js" (
  echo Artefatto assente: compilo...
  call npm run build || goto :errore
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron non risulta installato. Eseguire prima:
  echo    npm install
  echo Se npm dice di aver finito ma questo file continua a mancare, eseguire:
  echo    node node_modules\electron\install.js
  goto :errore
)

rem ELECTRON_ENABLE_LOGGING porta la console dell'interfaccia in questa finestra:
rem serve per capire cosa succede se qualcosa non va.
set ELECTRON_ENABLE_LOGGING=1

echo Avvio del Gestore sessioni Claude Code...
echo Chiudere la finestra dell'applicazione per terminare.
echo.
"node_modules\electron\dist\electron.exe" .
goto :fine

:errore
echo.
echo Avvio non riuscito.
pause
exit /b 1

:fine
