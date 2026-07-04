# Histórico do OverTalk

> Registro das sessões de desenvolvimento, decisões arquiteturais e correções de bugs.

---

## 2026-07-04 — Fix: Sobrecarga do Backend com Falas Contínuas (Vídeo/Stream)

### Problema identificado
O backend entrava em colapso ao processar áudio de vídeos ou streams contínuos (sem pausas naturais entre falas). O Whisper recebia múltiplas requisições em paralelo (chunks finais + parciais simultâneos), saturando CPU/GPU sem parar.

### Causa raiz
1. **Backend sem fila:** `/translate` disparava `asr()` e `voiceModel()` em paralelo para cada requisição que chegasse, sem limite de concorrência.
2. **Frontend sem back-pressure:** O `AudioProcessor` enviava novo chunk de áudio imediatamente após o `forceStop()`, mesmo que o servidor ainda estivesse processando o anterior. Parciais eram enviados a cada 1 segundo independente do estado do backend.

### Solução implementada

#### `tradutor-backend/server.js`
- **`TranscriptionQueue` (nova classe):** Fila FIFO com `maxConcurrent = 1` — o Whisper processa exatamente UM job por vez.
  - `maxQueueDepth = 4`: máximo de jobs aguardando. Acima disso, parciais são descartados silenciosamente; finais removem o parcial mais antigo da fila.
  - `jobTimeoutMs = 30000`: job que demorar mais de 30s é rejeitado com erro descritivo.
  - Transmite `queue_status` via SSE em tempo real ao frontend.
- **`/api/health`:** Agora expõe `queue.running`, `queue.depth`, `queue.maxDepth`, `queue.isBusy`.
- **`/translate`:** Refatorado para usar `transcriptionQueue.enqueue()`. Resposta inclui `discarded: true` quando o job foi descartado pela fila.

#### `tradutor-frontend/main.js`
- **Back-pressure por canal (`isSending`):** Cada `AudioProcessor` possui flag `isSending`. Enquanto o backend não responder, nenhum novo chunk final é enviado (o chunk é descartado com aviso no console). Parciais também são bloqueados se `isSending` estiver ativo.
- **`sendAudioToBackend()`:** Recebe referência do processor (`processor = null`), seta `isSending = true` antes do fetch e `false` no `finally`.
- **Handler SSE `queue_status`:** Exibe "⏳ FILA CHEIA" no status do canal sistema quando `depth >= 3`.

---

## 2026-07-03 — Sessão Atual: Dashboard PC Evoluído e Hardening Inicial

### O que foi feito hoje
- Implementação completa do novo visual do **Dashboard PC v2 ("The Radio Room")**.
- Integração do frontend com a rota `/api/session/stats` para exibir:
  - Tempo de Sessão (Timer)
  - Contagem de Palavras e Mensagens
  - Latência e Status do Backend
- Implementação do botão **Exportar** para salvar transcrições `.txt`.
- Integração do canal SSE (`/events`) para detectar quando o celular se conecta (evento `device_connected`), atualizando o painel de Sala Privada para "ONLINE".
- **Bug fix crítico:** Corrigido erro `Cannot read properties of null (reading 'classList')` no botão de ligar o sistema. O frontend estava tentando acessar classes HTML antigas (`.system-node`, `.mic-node`) que foram substituídas pelo novo design (`.card-system`, `.card-mic`).

### Foco Atual Concluído (Production Hardening)
- Tratamento de exceções globais (`uncaughtException`) adicionado.
- PM2 (via Loop Nativo PS1) implementado para auto-restart.
- Seletores de Áudio Virtuais integrados (suporte a VB-Cable sem compartilhar tela).
- Áudio RAW ativado + Upgrade Whisper Base para máxima precisão.

---

## Próximos Passos (Fase 1: MVP SaaS)
De acordo com o ROADMAP, o sistema agora está resiliente e as melhorias de núcleo de IA estão aplicadas. O próximo degrau lógico é transformar o protótipo em um produto monetizável.

**Fase 1: Banco de Dados e Autenticação** ✅ CONCLUÍDA
- Instalado `better-sqlite3`, `@supabase/supabase-js`, `jsonwebtoken` no backend.
- Criado banco de dados local SQLite (`src/db/database.js`) com tabelas `users` e `sessions`.
- Criada tela de Login elegante (`login.html` + `style-login.css`) com suporte a Criar Conta e Entrar.
- Criada lógica de autenticação Supabase (`src/auth.js`) com persistência de sessão.
- Integração do JWT no `main.js`: redirecionamento para `/login.html` se não autenticado.
- Botão de Logout + Badge de email do usuário adicionados ao header do dashboard.
- Middleware `requireAuth` no `server.js` protegendo rotas principais.
- **Rate Limiting implementado:** usuários Free têm limite de 3 sessões/dia via SQLite.
- **Página "Minha Conta"** (`account.html`) com info de tier, uso diário e card de Upgrade.
- `dotenv` integrado corretamente no `server.js` (ESM-compatible).
- Vite proxy configurado para todas as rotas do backend.

**Próximo: Fase 1 restante**
- Integração com **Stripe** para cobrança real (botão de Upgrade funcional).
- Upgrade do tier via webhook do Stripe atualizando o campo `tier` no SQLite.

**Deploy Híbrido (Supabase Bridge) 🚀** ✅ CONCLUÍDO
- Frontend hospedado profissionalmente na **Vercel** (`overtalk.vercel.app`).
- Backend roda localmente via **Cloudflare Tunnel**.
- Tabela `config` criada no Supabase sem Row Level Security (RLS).
- Backend atualiza automaticamente a tabela `config` com a URL efêmera do túnel.
- Frontend busca dinamicamente a `BACKEND_URL` do Supabase antes de conectar.
- Sistema de Feedback anônimo implementado para coletar reviews de beta testers.
- Landing Page (`/landing.html`) adicionada para receber tráfego não logado de forma elegante.
