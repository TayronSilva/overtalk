@echo off
echo ==============================================
echo       DESLIGANDO SISTEMA OVERTALK
echo ==============================================
echo Desligando PM2...
pm2 stop all
pm2 delete all
echo.
echo Forcando parada de processos residuais (Node / Cloudflared)...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo.
echo Procurando e parando o Hotkey Bridge...
powershell -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -match 'hotkey_bridge.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo Tudo desligado com sucesso!
pause
