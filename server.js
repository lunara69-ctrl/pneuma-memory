/**
 * Pneuma Chat Server
 * Express + WebSocket - serwowany lokalnie, dostępny przez WG/SSL
 *
 * Uruchomienie: node server.js
 * Chat:         http://localhost:3333
 * Zdalnie:      https://twoja-domena.wg/
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { getDb, saveQA, getSessionHistory, sessionExists } = require('./src/db/db');
const { buildMemoryBlock, detectTopic } = require('./src/pneuma/intuicja');
const { chronicle } = require('./src/pneuma/kronikarz');
const { streamWithMemory } = require('./src/api/claude');
const { logInjection } = require('./src/pneuma/memoryGit');

const PORT = process.env.PORT || 3333;
const app = express();
const server = http.createServer(app);

// CORS - pozwól wtyczce Chrome na dostęp do localhost
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Static - serwuj renderer/ jako publiczny folder
app.use(express.static(path.join(__dirname, 'src/renderer')));
app.use(express.json());

// Importer endpoint (REST - nie potrzebuje WS)
app.post('/api/import', async (req, res) => {
    const { chunks, sessionId, dateFrom, dateTo } = req.body;
    if (!chunks?.length) return res.json({ error: 'Brak chunks', saved: 0, skipped: 0 });

    let saved = 0, skipped = 0;
    const sid = sessionId || `import_${Date.now()}`;

    for (const chunk of chunks) {
        if (!chunk.question || chunk.question.length < 5 || !chunk.answer || chunk.answer.length < 10) {
            skipped++; continue;
        }
        const combined = chunk.question + ' ' + chunk.answer;
        const { topic, keywords } = detectTopic(combined);
        const tags = [...new Set([topic, ...keywords])].filter(t => t !== 'general').slice(0, 5);
        saveQA(sid, chunk.question.substring(0, 2000), chunk.answer.substring(0, 3000), topic, tags);
        saved++;
    }

    console.log(`[Import] ✓ ${saved} zapisane | ${skipped} pominięte | sesja: ${sid}`);
    res.json({ saved, skipped, sessionId: sid });
});

// Status serwera (dla wtyczki)
app.get('/api/status', (req, res) => {
  res.json({ ok: true, port: PORT, version: '0.2.0' });
});

// Memory block dla wtyczki (content script pyta przed każdym send)
app.post('/api/memory', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.json({ memoryBlock: '' });
  try {
    const { memoryBlock, qaIds, diaryIds, topic } = await buildMemoryBlock(message, sessionId || 'ext');
    // Log injection async
    if (memoryBlock) {
      setImmediate(() => logInjection(sessionId || 'ext', message, memoryBlock, qaIds, diaryIds, topic));
    }
    res.json({ memoryBlock, topic });
  } catch (err) {
    res.json({ memoryBlock: '', error: err.message });
  }
});

// Kronikarz endpoint dla wtyczki (po otrzymaniu odpowiedzi AI)
app.post('/api/chronicle', async (req, res) => {
  const { question, answer, sessionId } = req.body;
  if (!question || !answer) return res.json({ ok: false });
  const { topic } = detectTopic(question + ' ' + answer);
  setImmediate(() => chronicle(sessionId || 'ext', question, answer, topic));
  res.json({ ok: true, topic });
});

// Sprawdź czy sesja istnieje i zwróć jej historię
app.get('/api/session/:id', (req, res) => {
    const { id } = req.params;
    if (!sessionExists(id)) return res.json({ exists: false, messages: [] });
    const messages = getSessionHistory(id, 100);
    res.json({ exists: true, messages });
});

// Routy stron
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'src/renderer/index.html')));
app.get('/import', (req, res) => res.sendFile(path.join(__dirname, 'src/renderer/importer.html')));

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    const connId = uuidv4().substring(0, 8);
    console.log(`[WS] Połączono: ${connId}`);

    ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'chat') {
            await handleChat(ws, msg);
        } else if (msg.type === 'new_session') {
            ws.sessionId = uuidv4();
            ws.send(JSON.stringify({ type: 'session', sessionId: ws.sessionId }));
        } else if (msg.type === 'restore_session') {
            // Klient ma zapisany session ID - potwierdzamy
            ws.sessionId = msg.sessionId;
            ws.send(JSON.stringify({ type: 'session', sessionId: ws.sessionId }));
        }
    });

    ws.on('close', () => console.log(`[WS] Rozłączono: ${connId}`));
    ws.on('error', (e) => console.error(`[WS] Błąd ${connId}:`, e.message));

    // Wyślij session ID przy połączeniu
    const sessionId = uuidv4();
    ws.sessionId = sessionId;
    ws.send(JSON.stringify({ type: 'session', sessionId }));
});

async function handleChat(ws, msg) {
    const { message, sessionId } = msg;
    if (!message?.trim()) return;

    const sid = sessionId || ws.sessionId;

    // 1. Intuicja
    const { memoryBlock, qaIds, diaryIds, topic } = await buildMemoryBlock(message, sid);

    ws.send(JSON.stringify({ type: 'debug', text: `Intuicja: topic=${topic} | qa=${qaIds.length} diary=${diaryIds.length}` }));

    // 2. Stream do klienta
    let fullResponse = '';

    await streamWithMemory(
        message,
        memoryBlock,
        process.env.SYSTEM_PROMPT || null,
        (chunk) => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'chunk', text: chunk }));
            }
            fullResponse += chunk;
        },
        (_, err) => {
            if (err) {
                ws.send(JSON.stringify({ type: 'error', text: err.message }));
                return;
            }
            ws.send(JSON.stringify({ type: 'done', topic }));

            // 3. Kronikarz async
            setImmediate(() => chronicle(sid, message, fullResponse, topic));

            // 4. Git log
            if (memoryBlock) {
                setImmediate(() => logInjection(sid, message, memoryBlock, qaIds, diaryIds, topic));
            }
        }
    );
}

// Start
getDb().then(() => {
    server.listen(PORT, () => {
        console.log(`\n⚡ Pneuma Chat Server`);
        console.log(`   Lokalnie:  http://localhost:${PORT}`);
        console.log(`   Import:    http://localhost:${PORT}/import`);
        console.log(`   WG/SSL:    ustaw reverse proxy na port ${PORT}\n`);
    });
}).catch(err => {
    console.error('DB init failed:', err.message);
    process.exit(1);
});
