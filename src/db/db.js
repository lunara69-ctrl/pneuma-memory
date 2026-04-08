/**
 * SQLite via sql.js (pure WASM - no native build)
 * Persistent: ładuje z pliku przy starcie, zapisuje po każdej operacji
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/pneuma.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

// Synchronous accessor - must call getDb() first to init
function requireDb() {
    if (!db) throw new Error('DB not initialized - call getDb() first');
    return db;
}

async function getDb() {
    if (db) return db;

    const SQL = await initSqlJs();

    // Load existing DB or create new
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Init schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);

    persist(); // initial save
    return db;
}

function persist() {
    if (!db) return;
    const data = db.export();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Helper: run + persist
function exec(sql, params = []) {
    requireDb().run(sql, params);
    persist();
}

// Helper: query rows as objects
function query(sql, params = []) {
    const stmt = requireDb().prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Helper: get last insert rowid
function lastId() {
    return requireDb().exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
}

// --- API ---

function saveQA(sessionId, question, answer, topic, tags = []) {
    exec(
        `INSERT INTO raw_qa (session_id, question, answer, topic, tags) VALUES (?,?,?,?,?)`,
        [sessionId, question, answer, topic, JSON.stringify(tags)]
    );
    return lastId();
}

function getQAByTopic(topic, limit = 5) {
    return query(
        `SELECT * FROM raw_qa WHERE topic = ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?`,
        [topic, `%"${topic}"%`, limit]
    );
}

function searchQAByKeywords(keywords, limit = 5) {
    if (!keywords.length) return [];
    const conditions = keywords.map(() => `(question LIKE ? OR answer LIKE ? OR topic LIKE ?)`).join(' OR ');
    const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`, `%${k}%`]);
    params.push(limit);
    return query(`SELECT * FROM raw_qa WHERE ${conditions} ORDER BY created_at DESC LIMIT ?`, params);
}

function getLastQA(sessionId, n = 3) {
    return query(
        `SELECT * FROM raw_qa WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
        [sessionId, n]
    );
}

function saveDiary(sessionId, summary, essay, topics, affect, sourceQaId) {
    exec(
        `INSERT INTO diary (session_id, summary, essay, topics, affect, source_qa_id) VALUES (?,?,?,?,?,?)`,
        [sessionId, summary, essay || null, JSON.stringify(topics), affect, sourceQaId || null]
    );
    return lastId();
}

function getDiaryByTopic(topic, limit = 3) {
    return query(
        `SELECT * FROM diary WHERE topics LIKE ? ORDER BY created_at DESC LIMIT ?`,
        [`%"${topic}"%`, limit]
    );
}

function logMemoryInjection(sessionId, questionPreview, memoryBlockSize, qaIds, diaryIds, topicDetected) {
    exec(
        `INSERT INTO memory_log (session_id, question_preview, memory_block_size, qa_ids_injected, diary_ids_injected, topic_detected) VALUES (?,?,?,?,?,?)`,
        [sessionId, (questionPreview || '').substring(0, 100), memoryBlockSize, JSON.stringify(qaIds), JSON.stringify(diaryIds), topicDetected]
    );
}

// Pobierz całą historię sesji (do przywrócenia UI)
function getSessionHistory(sessionId, limit = 50) {
    return query(
        `SELECT * FROM raw_qa WHERE session_id = ? ORDER BY created_at ASC LIMIT ?`,
        [sessionId, limit]
    );
}

// Sprawdź czy sesja istnieje w bazie
function sessionExists(sessionId) {
    const rows = query(
        `SELECT COUNT(*) as cnt FROM raw_qa WHERE session_id = ?`,
        [sessionId]
    );
    return rows[0]?.cnt > 0;
}

module.exports = {
    getDb,
    requireDb,
    saveQA,
    getSessionHistory,
    sessionExists,
    getQAByTopic,
    searchQAByKeywords,
    getLastQA,
    saveDiary,
    getDiaryByTopic,
    logMemoryInjection
};
