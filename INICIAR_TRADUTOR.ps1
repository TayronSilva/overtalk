# Neural Link - Launcher (PowerShell)
# Orchestrator atualizado para PM2 (Background / Invisível)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Limpando processos antigos..." -ForegroundColor Gray
pm2 stop all
pm2 delete all

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "  INICIANDO OVERTALK (BACKGROUND MODE) " -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Cyan

# 1. Ligando o Servidor Node.js (Backend) invisível via PM2
Write-Host "[1/2] Ativando Servidor Backend (PM2 Daemon)..." -ForegroundColor Yellow
cd tradutor-backend
pm2 start server.js --name overtalk-backend
cd ..

# 2. Ativando a Ponte de Teclas (Hotkey) invisível
Write-Host "[2/2] Ativando Hotkey Bridge Global..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File .\hotkey_bridge.ps1" -WindowStyle Hidden

Write-Host "----------------------------------------------------" -ForegroundColor Green
Write-Host "  TUDO PRONTO! SISTEMA ONLINE E INVISÍVEL" -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Green
Write-Host "O frontend agora está na nuvem (Vercel)." -ForegroundColor Gray
Write-Host "Acessando https://overtalk.vercel.app em 3 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Abre a nova interface da nuvem no navegador padrão
Start-Process "https://overtalk.vercel.app"

Write-Host "----------------------------------------------------" -ForegroundColor Green
Write-Host "AVISO: Nenhum terminal ficará aberto. Para desligar o servidor depois," -ForegroundColor Red
Write-Host "abra o Prompt de Comando e digite: pm2 stop all" -ForegroundColor Red
Write-Host "----------------------------------------------------" -ForegroundColor Green

Read-Host "Pressione Enter para fechar este inicializador..."
