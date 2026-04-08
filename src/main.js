const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { buildMemoryBlock } = require('./pneuma/intuicja');
const { chronicle } = require('./pneuma/kronikarz');
const { streamWithMemory } = require('./api/claude');
const { logInjection } = require('./pneuma/memoryGit');
const { getDb, saveQA } = require('./db/db');
const { detectTopic } = require('./pneuma/intuicja');

let mainWindow;
let currentSessionId = uuidv4();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'renderer/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'Pneuma Debug Chat',
        backgroundColor: '#1a1a2e'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    if (process.env.DEBUG === 'true') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {
    await getDb();
    createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- CHAT IPC ---

ipcMain.on('chat:stream', async (event, { message, sessionId }) => {
    const { memoryBlock, qaIds, diaryIds, topic } = await buildMemoryBlock(message, sessionId || currentSessionId);

    let fullResponse = '';

    await streamWithMemory(
        message,
        memoryBlock,
        null,
        (chunk) => { event.sender.send('chat:chunk', { chunk }); },
        (fullText, err) => {
            if (err) { event.sender.send('chat:error', { error: err.message }); return; }
            fullResponse = fullText;
            event.sender.send('chat:done', { topic });
            setImmediate(() => chronicle(sessionId || currentSessionId, message, fullResponse, topic));
            if (memoryBlock) {
                setImmediate(() => logInjection(sessionId || currentSessionId, message, memoryBlock, qaIds, diaryIds, topic));
            }
        }
    );
});

ipcMain.handle('session:new', () => { currentSessionId = uuidv4(); return currentSessionId; });
ipcMain.handle('session:get', () => currentSessionId);

// --- NAWIGACJA ---

ipcMain.on('nav:importer', () => {
    mainWindow.loadFile(path.join(__dirname, 'renderer/importer.html'));
    mainWindow.setTitle('Pneuma / Import Historyczny');
});

ipcMain.on('nav:chat', () => {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    mainWindow.setTitle('Pneuma Debug Chat');
});

// --- IMPORTER IPC ---

ipcMain.handle('import:chunks', async (event, { chunks, sessionId, dateFrom, dateTo }) => {
    try {
        let saved = 0;
        let skipped = 0;

        for (const chunk of chunks) {
            if (!chunk.question || !chunk.answer) { skipped++; continue; }
            if (chunk.question.length < 5 || chunk.answer.length < 10) { skipped++; continue; }

            const combined = chunk.question + ' ' + chunk.answer;
            const { topic, keywords } = detectTopic(combined);
            const tags = [...new Set([topic, ...keywords])].filter(t => t !== 'general').slice(0, 5);

            const q = chunk.question.substring(0, 2000);
            const a = chunk.answer.substring(0, 3000);

            saveQA(sessionId, q, a, topic, tags);
            saved++;
        }

        console.log(`[Importer] ✓ Zapisano: ${saved} | Pominięto: ${skipped} | Sesja: ${sessionId}`);
        return { saved, skipped, sessionId };

    } catch (err) {
        console.error('[Importer] Error:', err.message);
        return { error: err.message, saved: 0, skipped: 0, sessionId };
    }
});
