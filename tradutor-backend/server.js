import express from 'express';
import cors from 'cors';
import path from 'path';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import { pipeline, env, AutoModel, AutoProcessor, cos_sim } from '@huggingface/transformers';
import { spawn } from 'child_process';
import { config } from 'dotenv';
config(); // Carrega .env ANTES de qualquer process.env

import fs from 'fs';
import crypto from 'crypto';
import db, { canStartSession, startSession, getSessionsToday, getUserInfo } from './src/db/database.js';
import { createClient } from '@supabase/supabase-js';
import { conversationManager } from './src/services/ConversationManager.js';
import { canAccessSession } from './src/services/sessionAccess.js';
import { getRuntimeConfig } from './src/config/runtimeConfig.js';
import { createInMemoryRateLimiter } from './src/config/rateLimiter.js';
import { createRateLimitMiddleware } from './src/config/rateLimitMiddleware.js';
import { getAudioDurationSeconds, isPayloadTooLarge } from './src/config/payloadProtection.js';

// --- AUTH SETUP (SUPABASE) ---
const runtimeConfig = getRuntimeConfig();
const apiRateLimiter = createInMemoryRateLimiter({
    limit: runtimeConfig.rateLimits.apiPerMinute,
    windowMs: 60 * 1000,
    keyPrefix: 'api'
});
const pinRateLimiter = createInMemoryRateLimiter({
    limit: runtimeConfig.rateLimits.pinPerMinute,
    windowMs: 60 * 1000,
    keyPrefix: 'pin'
});
const sessionRateLimiter = createInMemoryRateLimiter({
    limit: runtimeConfig.rateLimits.sessionPerMinute,
    windowMs: 60 * 1000,
    keyPrefix: 'session'
});
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
if (!supabase) {
    console.warn("⚠️ [AUTH] Supabase não configurado no .env. Rodando em modo aberto (sem login exigido).");
}

const requireAuth = async (req, res, next) => {
    if (!supabase && process.env.NODE_ENV === 'development') return next(); // Bypass só em DEV
    
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return res.status(401).json({ error: 'Token JWT ausente.' });

    if (!supabase) return res.status(500).json({ error: 'Servidor não configurado para autenticação.' });
    if (!token) return res.status(401).json({ error: 'Token JWT ausente.' });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        console.warn(`🔒 [AUTH] Token inválido ou expirado. IP: ${req.ip}`);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
    
    // Auto-cria o user no SQLite local para contabilizar limites
    try {
        const stmt = db.prepare(`INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)`);
        stmt.run(user.id, user.email);
    } catch (e) {}
    
    req.user = user;
    next();
};

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error('\n[!] UNCAUGHT EXCEPTION:', err.message);
    console.error(err.stack);
    // Não fechamos o processo, PM2 vai reiniciar se precisarmos dar exit()
    // mas evitamos quedas por erros aleatórios.
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n[!] UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// -------------------------------------------------------------------
// FILA DE TRANSCRIÇÃO (TranscriptionQueue)
// Garante que o Whisper processa UM job por vez (maxConcurrent = 1).
// Evita saturação de CPU/GPU em falas contínuas (vídeos, streams).
// -------------------------------------------------------------------
class TranscriptionQueue {
    constructor({ maxConcurrent = 1, maxQueueDepth = runtimeConfig.rateLimits.maxQueueSize, jobTimeoutMs = runtimeConfig.rateLimits.queueTimeoutMs } = {}) {
        this.maxConcurrent = maxConcurrent;
        this.maxQueueDepth = maxQueueDepth;
        this.jobTimeoutMs = jobTimeoutMs;
        this.running = 0;
        this.queue = []; // [{fn, resolve, reject, isPartial}]
    }

    get depth() { return this.queue.length; }
    get isBusy() { return this.running >= this.maxConcurrent; }
    get isFull() { return this.queue.length >= this.maxQueueDepth; }

    // Adiciona um job à fila. Descarta parciais se a fila estiver cheia.
    enqueue(fn, { isPartial = false } = {}) {
        return new Promise((resolve, reject) => {
            if (this.isFull) {
                if (isPartial) {
                    // Parcial descartado silenciosamente — não vale saturar o servidor
                    console.warn(`⚡ [QUEUE] Parcial descartado (fila cheia: ${this.queue.length}/${this.maxQueueDepth})`);
                    return resolve(null); // Sinaliza descarte
                }
                // Para finais: substitui o último parcial da fila, se houver
                const oldPartialIdx = this.queue.findLastIndex(j => j.isPartial);
                if (oldPartialIdx !== -1) {
                    const [dropped] = this.queue.splice(oldPartialIdx, 1);
                    dropped.reject(new Error('DROPPED_BY_FINAL'));
                    console.warn(`⚡ [QUEUE] Parcial antigo removido para dar lugar a job final.`);
                } else {
                    // Fila cheia de finais: rejeita o mais antigo
                    const [dropped] = this.queue.splice(0, 1);
                    dropped.reject(new Error('QUEUE_OVERFLOW'));
                    console.warn(`⚠️ [QUEUE] Overflow! Job mais antigo descartado.`);
                }
            }
            this.queue.push({ fn, resolve, reject, isPartial });
            this._tick();
        });
    }

    _tick() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
        const job = this.queue.shift();
        this.running++;
        broadcastQueueStatus();

        const timeoutId = setTimeout(() => {
            job.reject(new Error('JOB_TIMEOUT'));
        }, this.jobTimeoutMs);

        Promise.resolve()
            .then(() => job.fn())
            .then(result => { clearTimeout(timeoutId); job.resolve(result); })
            .catch(err => { clearTimeout(timeoutId); job.reject(err); })
            .finally(() => {
                this.running--;
                broadcastQueueStatus();
                this._tick(); // Processa próximo
            });
    }
}

const transcriptionQueue = new TranscriptionQueue({
    maxConcurrent: 1,
    maxQueueDepth: runtimeConfig.rateLimits.maxQueueSize,
    jobTimeoutMs: runtimeConfig.rateLimits.queueTimeoutMs
});

function broadcastQueueStatus() {
    // Broadcast for the default session for now (we'll implement per-session queues later)
    broadcastEvent('default-session', {
        type: 'queue_status',
        running: transcriptionQueue.running,
        depth: transcriptionQueue.depth,
        isBusy: transcriptionQueue.isBusy,
    });
}

// Pasta ÚNICA de cache para evitar confusão no Windows
env.allowLocalModels = false;
env.cacheDir = path.join(process.cwd(), '.cache'); 

console.log(`[CONFIG] Limites carregados: fila=${runtimeConfig.rateLimits.maxQueueSize}, timeoutFila=${runtimeConfig.rateLimits.queueTimeoutMs}ms, audioMax=${runtimeConfig.rateLimits.maxAudioDurationSeconds}s`);

const app = express();
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options(/(.*)/, cors({ origin: true, credentials: true }));
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));

// Memória de Vozes (Persistência no Disco)
const SPEAKERS_FILE = path.join(process.cwd(), 'speakers.json');

// Carrega as vozes salvas ao iniciar (na sessão default)
function loadSpeakers() {
    try {
        if (fs.existsSync(SPEAKERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SPEAKERS_FILE, 'utf8'));
            const session = conversationManager.getUserSession(null);
            if (!session) {
                console.log(`[BACKUP] Nenhuma sessão ativa para restaurar vozes salvas.`);
                return;
            }
            for (let name in data) {
                session.speakers[name] = new Float32Array(Object.values(data[name]));
            }
            console.log(`📂 [BACKUP] Carregadas ${Object.keys(session.speakers).length} vozes salvas no HD.`);
        }
    } catch (e) { console.error("❌ Falha ao carregar speakers.json:", e.message); }
}
loadSpeakers();

function saveSpeakers(session) {
    try {
        fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(session.speakers, null, 2));
    } catch (e) { console.error("❌ Falha ao salvar no HD:", e.message); }
}

// --- SESSION MANAGER E TÚNEL ---
let currentTunnelUrl = "";

console.log(`\n🔐 ==============================================`);
console.log(`🔐 Sessões privadas agora são isoladas por usuário/sessão.`);
console.log(`🔐 ==============================================\n`);

app.get('/api/pin', (req, res) => {
    res.json({ url: currentTunnelUrl });
});

const apiRateLimitMiddleware = createRateLimitMiddleware({
    limiter: apiRateLimiter,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Limite de requisições atingido. Tente novamente em instantes.',
    logLabel: 'api'
});

const pinRateLimitMiddleware = createRateLimitMiddleware({
    limiter: pinRateLimiter,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Limite de PIN atingido. Tente novamente em instantes.',
    logLabel: 'pin'
});

const sessionRateLimitMiddleware = createRateLimitMiddleware({
    limiter: sessionRateLimiter,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Limite de sessões atingido. Tente novamente em instantes.',
    logLabel: 'session'
});

app.post('/api/pair', express.json(), pinRateLimitMiddleware, async (req, res) => {
    const { pin } = req.body;
    const authToken = req.headers.authorization?.split(' ')[1] || req.query.token;
    let session = conversationManager.getSessionByPin(pin);

    if (authToken && supabase) {
        const { data: { user }, error } = await supabase.auth.getUser(authToken);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
        }

        if (!session || session.userId !== user.id || session.pinExpiresAt <= Date.now()) {
            console.warn(`[SECURITY] Pareamento negado para usuário ${user.id} com PIN ${pin}`);
            return res.status(401).json({ success: false, error: 'PIN Inválido' });
        }
    }

    if (session) {
        const token = crypto.randomUUID();
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        session.validTokens.set(token, expiresAt);
        console.log(`✅ Dispositivo Autorizado na Sessão ${session.id}.`);
        res.json({ success: true, token, sessionId: session.id });
        setTimeout(() => broadcastEvent(session.id, { type: 'device_connected', count: session.validTokens.size }), 100);
    } else {
        console.log(`❌ Tentativa falha de conexão (PIN Incorreto: ${pin})`);
        res.status(401).json({ success: false, error: "PIN Inválido" });
    }
});

const requireConversationOwnership = async (req, res, next) => {
    const sid = req.query.sessionId || req.body?.sessionId;
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    let session = sid ? conversationManager.getSession(sid) : undefined;
    let authUser = null;

    if (!session && token && supabase) {
        const { data: { user } } = await supabase.auth.getUser(token);
        authUser = user;
        if (user) {
            session = conversationManager.getUserSession(user.id);
        }
    }

    if (!session) {
        return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const access = canAccessSession({
        session,
        authUser,
        token,
        currentTime: Date.now(),
    });

    if (access.allowed) {
        req.session = session;
        return next();
    }

    if (token && supabase && authUser) {
        console.warn(`🔒 [SECURITY] Tentativa de acesso não autorizado à sessão ${sid} pelo usuário ${authUser.id}`);
        return res.status(403).json({ error: 'Forbidden: Você não é o dono desta conversa.' });
    }

    if (!supabase) {
        if (process.env.NODE_ENV === 'development') {
            req.session = session;
            return next();
        }
        console.error(`🚨 [CRÍTICO] Falha catastrófica: Servidor em produção sem Supabase inicializado. Acesso negado por segurança.`);
        return res.status(500).json({ error: 'Configuração de segurança ausente.' });
    }

    console.warn(`🔒 [SECURITY] Acesso negado à sessão ${sid}. IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: JWT ou Token Pareado necessário.' });
}

const MAX_HISTORY = 50;

app.get('/api/session/stats', requireConversationOwnership, (req, res) => {
    const session = req.session;
    const stats = session.stats;
    
    const avgLatency = stats.latencies.length
        ? Math.round(stats.latencies.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, stats.latencies.length))
        : 0;
        
    res.json({
        startedAt: stats.startedAt,
        wordCount: stats.wordCount,
        messageCount: stats.messageCount,
        avgLatency,
        connectedDevices: session.validTokens.size,
        pin: session.pin,
        tunnelUrl: currentTunnelUrl,
    });
});

// --- ACCOUNT INFO ---
app.get('/api/account', requireAuth, (req, res) => {
    // Se Supabase não configurado, req.user não existe (modo bypass)
    const userId = req.user?.id;
    const email = req.user?.email || 'dev@local';
    
    const user = userId ? getUserInfo(userId) : null;
    const sessionsToday = userId ? getSessionsToday(userId) : 0;
    const tier = user?.tier || 'free';
    const limit = (tier === 'free') ? 3 : Infinity;
    
    res.json({
        email,
        tier,
        sessionsToday,
        sessionLimit: limit === Infinity ? null : limit,
        canStart: userId ? canStartSession(userId, tier) : true,
        memberSince: user?.created_at || null
    });
});

// --- START SESSION (com rate limit) ---
app.post('/api/session/start', requireAuth, sessionRateLimitMiddleware, apiRateLimitMiddleware, (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        // Bypass dev
        const session = conversationManager.createSession();
        return res.json({ success: true, sessionId: session.id, pin: session.pin }); 
    }
    
    const user = getUserInfo(userId);
    const tier = user?.tier || 'free';
    if (!canStartSession(userId, tier)) {
        const used = getSessionsToday(userId);
        return res.status(429).json({
            error: 'Limite diário atingido',
            message: `Plano Free: ${used}/3 sessões usadas hoje. Faça upgrade para Pro para acesso ilimitado.`,
            upgrade: true
        });
    }
    startSession(userId);
    const session = conversationManager.createSession(null, userId);
    console.log(`👤 [SESSION] Nova sessão ${session.id} criada para o usuário ${userId}`);
    res.json({ success: true, sessionId: session.id, pin: session.pin });
});

app.get('/api/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: {
            rss: Math.round(memory.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB'
        },
        queue: {
            running: transcriptionQueue.running,
            depth: transcriptionQueue.depth,
            maxDepth: transcriptionQueue.maxQueueDepth,
            isBusy: transcriptionQueue.isBusy,
        }
    });
});

app.get('/api/session/export', requireConversationOwnership, (req, res) => {
    const session = req.session;
    const lines = session.history.map((m, i) => {
        const time = new Date(m.id || Date.now()).toLocaleTimeString('pt-BR');
        const who = m.source === 'mic' ? 'VOCÊ' : (m.speaker || 'SISTEMA');
        return `[${time}] ${who}\n  Original:  ${m.original}\n  Tradução:  ${m.translated}\n`;
    });
    const content = `OverTalk — Sessão exportada em ${new Date().toLocaleString('pt-BR')}\n${'─'.repeat(60)}\n\n${lines.join('\n')}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="overtalk-sessao-${Date.now()}.txt"`);
    res.send(content);
});

function addToHistory(sessionId, data) {
    if (data.isPartial) return; // Não salva parciais no histórico
    const session = conversationManager.getSession(sessionId);
    
    data.id = Date.now() + Math.random(); // Identificador Único
    session.history.push(data);
    if (session.history.length > MAX_HISTORY) session.history.shift();
}

// Rota de Sincronização Bruta (Bypass de Bloqueios da Cloudflare)
app.get('/history_sync', requireConversationOwnership, (req, res) => {
    const session = req.session;
    res.json(session.history);
});

let transcriber = null;
let voiceModel = null;
let voiceProcessor = null;
let modelPromise = null;
let voicePromise = null;

async function getTranscriber() {
    if (transcriber) return transcriber;
    if (modelPromise) return modelPromise;

    modelPromise = (async () => {
        // Trocado para 'base' focado em maior precisão de entendimento (accuracy) em vez de velocidade extrema.
        const modelName = 'Xenova/whisper-base';
        console.log("------------------------------------------------------------------");
        console.log(`📥 CARREGANDO MODELO TRANSCRIÇÃO: ${modelName.toUpperCase()}...`);
        console.log("------------------------------------------------------------------");
        try {
            transcriber = await pipeline('automatic-speech-recognition', modelName, {
                progress_callback: (data) => {
                    if (data.status === 'progress') {
                        process.stdout.write(`\r📥 Baixando ${data.file}: ${data.progress.toFixed(1)}%   `);
                    } else if (data.status === 'done') {
                        process.stdout.write(`\r✅ OK: ${data.file}           \n`);
                    }
                }
            });
            console.log(`\n✅ MODELO TRANSCRIÇÃO PRONTO.`);
            return transcriber;
        } catch(e) {
            console.error(`\n❌ ERRO TRANSCRIÇÃO:`, e.message);
            modelPromise = null;
            throw e;
        }
    })();
    return modelPromise;
}

async function getVoiceModel() {
    if (voiceModel && voiceProcessor) return { model: voiceModel, processor: voiceProcessor };
    if (voicePromise) return voicePromise;

    voicePromise = (async () => {
        const model_id = 'Xenova/unispeech-sat-base-plus-sv';
        console.log("------------------------------------------------------------------");
        console.log(`📥 CARREGANDO MODELO IDENTIDADE: ${model_id.toUpperCase()}...`);
        console.log("------------------------------------------------------------------");
        try {
            voiceProcessor = await AutoProcessor.from_pretrained(model_id);
            voiceModel = await AutoModel.from_pretrained(model_id);
            console.log("✅ MODELO IDENTIDADE DE VOZ PRONTO!");
            return { model: voiceModel, processor: voiceProcessor };
        } catch(e) {
            console.error("❌ ERRO IDENTIDADE:", e.message);
            voicePromise = null;
            throw e;
        }
    })();
    return voicePromise;
}

// Inicia carregamentos
getTranscriber().catch(() => {});
getVoiceModel().catch(() => {});

function broadcastEvent(sessionId, data) {
    const session = conversationManager.getSession(sessionId);
    if (!session) return;
    
    if (data.type === 'translation') {
        addToHistory(session.id, data);
        if (!data.isPartial) {
            // Count words for stats
            const words = (data.translated || '').trim().split(/\s+/).filter(Boolean).length;
            session.stats.wordCount += words;
            session.stats.messageCount++;
            session.stats.lastActive = Date.now();
        }
    }
    const message = `data: ${JSON.stringify(data)}\n\n`;
    session.clients.forEach(client => client.res.write(message));
}

// Heartbeat (Pulse) e Cleanup Routine
setInterval(() => {
    const now = Date.now();
    for (const session of conversationManager.conversations.values()) {
        session.clients.forEach(c => c.res.write(`data: ${JSON.stringify({ type: 'heartbeat', time: now })}\n\n`));
    }
    
    // Roda o cleanup a cada 60 segundos
    const removed = conversationManager.cleanup();
    if (removed > 0) {
        console.log(`🧹 [CLEANUP] ${removed} sessões inativas removidas da memória.`);
    }
}, 15000);

app.get('/events', requireConversationOwnership, (req, res) => {
    const session = req.session;

    if (!conversationManager.canAcceptClient(session)) {
        console.warn(`[SSE] Limite de conexões atingido para sessão ${session.id}`);
        return res.status(429).json({ error: 'Limite de conexões SSE atingido.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Accel-Buffering', 'no'); // CRITICO: Força o Cloudflare a nao buffar a stream
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Envia o histórico imediatamente ao conectar
    if (session.history.length > 0) {
        const historyMessage = `data: ${JSON.stringify({ type: 'history', messages: session.history })}\n\n`;
        res.write(historyMessage);
    }

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    session.clients.add(newClient);
    session.stats.lastActive = Date.now();
    
    console.log(`📡 Dispositivo conectado na Sessão ${session.id} (ID: ${clientId})`);
    req.on('close', () => { session.clients.delete(newClient); });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'mobile.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'mobile.html'));
});

// --- GERENCIAMENTO DE VOZES ---
app.get('/list_speakers', requireConversationOwnership, (req, res) => {
    const session = req.session;
    res.json(Object.keys(session.speakers));
});

app.post('/delete_speaker', requireConversationOwnership, (req, res) => {
    const name = req.query.name;
    const session = req.session;
    
    if (session.speakers[name]) {
        delete session.speakers[name];
        saveSpeakers(session);
        console.log(`🗑️ Voz de [${name.toUpperCase()}] removida da sessão ${session.id}.`);
        return res.json({ success: true });
    }
    res.status(404).send("Não encontrado.");
});

app.post('/register_voice', requireConversationOwnership, apiRateLimitMiddleware, async (req, res) => {
    try {
        const name = req.query.name;
        const session = req.session;
        
        if (!name) return res.status(400).send("Nome necessário.");

        if (isPayloadTooLarge(req.body, runtimeConfig.rateLimits.maxPayloadBytes)) {
            console.warn(`[PAYLOAD] Registro de voz rejeitado por tamanho excessivo. sessão=${session.id}, bytes=${req.body?.length || 0}`);
            return res.status(413).json({ error: 'Payload excede o tamanho máximo permitido.' });
        }
        
        // CORREÇÃO CRÍTICA: Converte Buffer do Node para Float32Array de forma segura
        const audioBuffer = Buffer.from(req.body);
        const float32Audio = new Float32Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 4);
        const { model, processor } = await getVoiceModel();
        
        // LIMITAÇÃO DE TEMPO: usa o limte configurado para treinar (garante consistência)
        const maxAudioDurationSeconds = runtimeConfig.rateLimits.maxAudioDurationSeconds;
        const MAX_SAMPLES_ID = 16000 * maxAudioDurationSeconds;
        const idAudio = float32Audio.length > MAX_SAMPLES_ID 
            ? float32Audio.slice(0, MAX_SAMPLES_ID) 
            : float32Audio;

        const inputs = await processor(idAudio);
        const { embeddings } = await model(inputs);
        
        session.speakers[name] = embeddings.data;
        saveSpeakers(session); // Salva no HD
        console.log(`✅ Voz de [${name.toUpperCase()}] registrada com sucesso na Sessão ${session.id}!`);
        res.json({ success: true, name: name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/translate', requireConversationOwnership, async (req, res) => {
    const source = req.query.source || 'system';
    const isPartial = req.query.isPartial === 'true';
    const session = req.session;
    session.stats.lastActive = Date.now();

    if (isPayloadTooLarge(req.body, runtimeConfig.rateLimits.maxPayloadBytes)) {
        console.warn(`[PAYLOAD] Requisição /translate rejeitada por tamanho excessivo. source=${source}, bytes=${req.body?.length || 0}`);
        return res.status(413).json({ error: 'Payload excede o tamanho máximo permitido.' });
    }

    // CORREÇÃO CRÍTICA: Converte Buffer do Node para Float32Array de forma segura
    const audioBuffer = Buffer.from(req.body);
    const float32Audio = new Float32Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 4);

    // Diagnóstico de áudio no Servidor
    if (float32Audio.length > 0) {
        let maxAmp = 0;
        for (let i = 0; i < float32Audio.length; i++) {
            const abs = Math.abs(float32Audio[i]);
            if (abs > maxAmp) maxAmp = abs;
        }
        console.log(`🎤 [${source.toUpperCase()}] Áudio recebido: ${(float32Audio.length / 16000).toFixed(2)}s | Pico: ${maxAmp.toFixed(4)} | Fila: ${transcriptionQueue.depth}/${transcriptionQueue.maxQueueDepth} | Rodando: ${transcriptionQueue.running}`);
    }

    // Enfileira o job de transcrição — parciais são descartados se a fila estiver cheia
    let result;
    try {
        result = await transcriptionQueue.enqueue(async () => {
            // ---- Job começa aqui (dentro da fila, execução serial) ----

            // 1. Identificação de Voz (Speaker ID)
            let identifiedSpeaker = (source === 'mic') ? 'Você' : 'Native';

            if (source === 'system' && !isPartial) {
                try {
                    const { model, processor } = await getVoiceModel();

                    // LIMITAÇÃO DE TEMPO: pega no máximo o trecho configurado para identificação de voz
                    const maxAudioDurationSeconds = runtimeConfig.rateLimits.maxAudioDurationSeconds;
                    const MAX_SAMPLES_ID = 16000 * maxAudioDurationSeconds;
                    const idAudio = float32Audio.length > MAX_SAMPLES_ID
                        ? float32Audio.slice(0, MAX_SAMPLES_ID)
                        : float32Audio;

                    const inputs = await processor(idAudio);
                    const { embeddings } = await model(inputs);
                    const currentEmbedding = embeddings.data;

                    let scores = [];
                    for (const [name, savedEmbedding] of Object.entries(session.speakers)) {
                        const similarity = cos_sim(currentEmbedding, savedEmbedding);
                        scores.push({ name, similarity });
                    }
                    scores.sort((a, b) => b.similarity - a.similarity);

                    if (scores.length > 0) {
                        const best = scores[0];
                        const secondBest = scores[1] || { similarity: 0 };
                        console.log(`📊 DIAGNÓSTICO: ${scores.map(s => `${s.name}: ${(s.similarity*100).toFixed(1)}%`).join(' | ')}`);
                        if (best.similarity > 0.85 && (best.similarity - secondBest.similarity) > 0.05) {
                            identifiedSpeaker = best.name;
                        } else {
                            console.warn(`⚠️ INDECISO: Diferença muito pequena (${((best.similarity - secondBest.similarity)*100).toFixed(1)}%) ou confiança baixa.`);
                        }
                    }
                } catch (vErr) { console.error('Erro ID Voz:', vErr.message); }
            }

            // 2. Transcrição (ASR)
            const asr = await getTranscriber();
            const sourceLang = (source === 'mic') ? 'pt' : 'en';
            const output = await asr(float32Audio, {
                language: sourceLang,
                task: 'transcribe',
                num_beams: 3,
                repetition_penalty: 1.1
            });

            const originalText = output.text.trim();

            if (!originalText) {
                console.log(`📝 [${source.toUpperCase()}] Silêncio ou áudio não compreendido.`);
                return { original: '', translated: '', speaker: identifiedSpeaker, discarded: false };
            }
            console.log(`📝 [${source.toUpperCase()}] Transcrito: "${originalText}" -> Traduzindo...`);

            // 3. Tradução (NMT)
            const targetLang = (source === 'mic') ? 'en' : 'pt';
            let translatedText = '[Erro de Tradução]';
            try {
                const textUrlEncoded = encodeURIComponent(originalText);
                const url = `https://translate.google.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${textUrlEncoded}`;
                const fetchRes = await fetch(url);
                const json = await fetchRes.json();
                translatedText = json[0].map(item => item[0]).join('');
            } catch (tErr) {
                console.error('⚠️ Falha na API de Tradução:', tErr.message);
            }

            broadcastEvent(session.id, {
                type: 'translation',
                source,
                speaker: identifiedSpeaker,
                original: originalText,
                translated: translatedText,
                isPartial,
            });

            return { original: originalText, translated: translatedText, speaker: identifiedSpeaker, discarded: false };
            // ---- Fim do job ----
        }, { isPartial });
    } catch (err) {
        // Erros esperados da fila (overflow, timeout, drop)
        if (err.message === 'DROPPED_BY_FINAL' || err.message === 'QUEUE_OVERFLOW') {
            return res.json({ original: '', translated: '', speaker: 'SISTEMA', discarded: true });
        }
        if (err.message === 'JOB_TIMEOUT') {
            console.error(`⏱️ [QUEUE] Job expirou após ${transcriptionQueue.jobTimeoutMs}ms`);
            return res.status(503).json({ error: 'Transcrição demorou demais. Tente um trecho menor.' });
        }
        console.error('❌ Erro Crítico na Fila:', err.message);
        return res.status(200).json({
            original: 'ERRO DE SISTEMA',
            translated: 'Instabilidade detectada. Aguardando reconexão...',
            speaker: 'SISTEMA'
        });
    }

    // result === null significa parcial descartado pela fila (fila cheia)
    if (result === null) {
        return res.json({ original: '', translated: '', speaker: 'SISTEMA', discarded: true });
    }

    res.json(result);
});

app.get('/trigger', requireConversationOwnership, (req, res) => {
    broadcastEvent(req.session.id, { type: 'ptt_status', state: req.query.state === 'on' ? 'mic_on' : 'mic_off' });
    res.send("OK");
});

// --- FEEDBACK ANÔNIMO ---
app.use(express.json());
app.post('/api/feedback', (req, res) => {
    try {
        const { rating, category, message } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating inválido (1-5).' });
        }
        db.prepare(`INSERT INTO feedback (rating, category, message) VALUES (?, ?, ?)`)
          .run(rating || null, category || 'outro', message || '');
        console.log(`💬 [FEEDBACK] Rating: ${rating}/5 | Categoria: ${category} | "${message?.substring(0,50)}"`);
        res.json({ success: true });
    } catch (e) {
        console.error('[FEEDBACK] Erro ao salvar:', e.message);
        res.status(500).json({ error: 'Falha ao salvar feedback.' });
    }
});

// --- VER FEEDBACKS (rota admin simples) ---
app.get('/api/feedback', (req, res) => {
    const adminKey = req.query.key;
    if (adminKey !== (process.env.ADMIN_KEY || 'overtalk-admin')) {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const rows = db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100`).all();
    res.json(rows);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
    
    // Inicia o túnel automaticamente para poder extrair a URL
    function startTunnel() {
        console.log(`⏳ Iniciando SSH Tunnel (localhost.run) em background...`);
        const cf = spawn('ssh', [
            '-R', `80:127.0.0.1:${PORT}`, 
            'nokey@localhost.run', 
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ServerAliveInterval=60'
        ], { windowsHide: true });
        
        const handleTunnelData = async (d) => {
            const str = d.toString();
            if (str.includes('.lhr.life')) {
                const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
                if (match) {
                    currentTunnelUrl = match[0];
                    process.env.PUBLIC_BACKEND_URL = currentTunnelUrl;
                    console.log(`\n🌐 ==============================================`);
                    console.log(`🌐 LINK PÚBLICO GERADO: ${currentTunnelUrl}/mobile`);
                    console.log(`🌐 ==============================================\n`);
                    
                    if (supabase) {
                        try {
                            const { error } = await supabase.from('config').update({ backend_url: currentTunnelUrl }).eq('id', 1);
                            if (!error) console.log(`✅ Supabase atualizado com o novo backend_url!`);
                            else console.error(`❌ Erro ao atualizar Supabase:`, error.message);
                        } catch (e) { console.error(`❌ Erro de conexão ao atualizar Supabase:`, e.message); }
                    }
                }
            }
        };
        
        cf.stdout.on('data', handleTunnelData);
        cf.stderr.on('data', handleTunnelData);

        cf.on('close', (code) => {
            console.error(`⚠️ SSH Tunnel fechou inesperadamente (código ${code}). Reiniciando em 5 segundos...`);
            setTimeout(startTunnel, 5000);
        });
    }

    startTunnel();
});
