# OverTalk — Roadmap para SaaS

> Planejamento estratégico para evoluir o OverTalk de protótipo funcional para SaaS vendável.
> Mantendo a essência "analog warmth, modern precision" e respeitando as regras do `AGENTS.md`.

---

## Stack Técnico Recomendado

| Decisão | Escolha | Motivo |
|---|---|---|
| **Database** | SQLite via `better-sqlite3` | Zero config, single VPS, sync API |
| **Auth** | Supabase Auth (hosted) | Grátis, email/password + Google, JWT |
| **Pagamento** | Stripe | SDK CommonJS, webhooks, subscriptions |
| **Deploy** | Single GPU VPS (Hetzner ~€30-50/mês) | GPU CUDA, sem duplicar modelo |
| **Processos** | PM2 | Auto-restart, monitoria |
| **Proxy** | Nginx | SSL, static frontend, proxy reverso |
| **Frontend Prod** | Vite build → nginx | Sem Node pra servir |

## Pricing

| Tier | Preço | Features |
|---|---|---|
| **Free** | $0 | 3 sessões/dia, 5 min, PTT, pt↔en |
| **Pro** | **$12/mo** | Ilimitado, VAD, 20 pares de idioma |
| **Business** | **$49/mo** | White-label, SLA, suporte prioritário |

---

## Fase 0: Production Hardening (~3-5 dias)

**Objetivo:** Código rodando em VPS com resiliência. Já dá pra mostrar pra early adopters.

### Tasks
1. **PM2 config** — `backend/ecosystem.config.js`
   - Backend Node + Python translation server como processos gerenciados
   - Auto-restart em crash, logs em arquivo, `max_memory_restart: 2G`
2. **Nginx config** — `deploy/nginx/overtalk.conf`
   - Servir frontend buildado como static
   - Proxy `/api/` → `:3001`
   - Proxy `/ws` → `:8081` com suporte WebSocket
3. **Vite build pra produção** — `frontend/vite.config.js`
4. **Health endpoint aprimorado** — `GET /health`
5. **Crash recovery do Whisper** — auto-reload de modelo se falhar
6. **`.env.production.example`**
7. **`deploy.sh`** — build + reiniciar PM2

**Arquivos:** Criar ~4, modificar ~2
**Complexidade:** Baixa

---

## Fase 1: MVP SaaS "Sellable" (~1.5-2 semanas)

**Objetivo:** Primeiros clientes pagantes. Sign up, pagamento, uso real.

### Tasks
1. **SQLite Database** — `backend/src/db/database.js`
   - Tabelas: `users`, `subscriptions`, `sessions`, `usage_log`
2. **Supabase Auth** — `authService.js` + `middleware/auth.js`
3. **Rate Limit por Tier** — Free: 3 sessões/dia, Pro/Business: ilimitado
4. **Stripe Billing** — `billingService.js`
5. **Proteger rotas** — session create/claim exigem auth
6. **Frontend Auth** — login.html, `src/auth/login.js`
7. **Docker + Deploy** — Dockerfile ou docker-compose

**Arquivos:** Criar ~9, modificar ~4
**Complexidade:** Média-Alta

---

## Fase 2: Produção Polida (~2-3 semanas)

**Objetivo:** Retenção de clientes.

- Histórico persistido (SQLite)
- Página "Minha Conta"
- Admin dashboard
- Sentry (error tracking)
- UptimeRobot (monitoria)
- Fallback Whisper → API OpenAI
- Backup SQLite (cron → S3/B2)

---

## Fase 3: Proteção da infraestrutura (~4-6 semanas)

- Rate Limit
- SSE
- Queue
- Payload
- Backpressure
- Timeout
- Observabilidade básica

## Fase 4: Observabilidade e beta fechado (~2-3 semanas)

- Winston
- Métricas
- Logs
- Latência
- Uso de RAM
- Uso de CPU

## Fase 5: Beta fechado (~2-3 semanas)

- Coletar métricas reais de uso
- p95/p99 de latência
- tempo médio de sessão
- traduções/dia
- conexões SSE/sessão
- profundidade média da fila
- rejeições (429/503)
- consumo de RAM
- consumo de CPU

## Fase 6: Ajustes baseados em dados (~2-3 semanas)

- limites operacionais baseados em evidência
- definição de planos e cobrança

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Whisper crash | PM2 + crash recovery (Fase 0) |
| GPU saturada | Fila FIFO + monitorar (Fase 1) |
| Tradução cai | PM2 restart (Fase 0) + fallback API (Fase 2) |
| Abuso free tier | Rate limit (Fase 1) |
| Perda de dados | SQLite (Fase 1) + backup (Fase 2) |
