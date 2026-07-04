import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRuntimeConfig } from '../config/runtimeConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'overtalk.db');
const db = new Database(dbPath);
const runtimeConfig = getRuntimeConfig();
const FREE_LIMIT = runtimeConfig.rateLimits.maxDailySessions;

// Inicialização das tabelas
const initDb = () => {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                tier TEXT DEFAULT 'free',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                duration INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rating INTEGER,
                category TEXT,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("[DB] Banco de dados (SQLite) inicializado com sucesso.");
    } catch (error) {
        console.error("[DB] Falha ao inicializar o banco de dados:", error);
    }
};

initDb();

// --- LIMITE DE SESSÕES POR DIA ---
export function getSessionsToday(userId) {
    const row = db.prepare(`
        SELECT COUNT(*) as count FROM sessions
        WHERE user_id = ? AND DATE(start_time) = DATE('now')
    `).get(userId);
    return row?.count || 0;
}

export function canStartSession(userId, tier) {
    if (tier === 'pro' || tier === 'business') return true;
    return getSessionsToday(userId) < FREE_LIMIT;
}

export function startSession(userId) {
    return db.prepare(`INSERT INTO sessions (user_id) VALUES (?)`).run(userId).lastInsertRowid;
}

export function getUserInfo(userId) {
    return db.prepare(`SELECT id, email, tier, created_at FROM users WHERE id = ?`).get(userId);
}

export default db;
