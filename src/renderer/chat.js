/**
 * Pneuma Chat UI - WebSocket client z session persistence
 *
 * Przy otwarciu:
 *   - jeśli localStorage ma session ID → sprawdź w DB
 *   - jeśli sesja istnieje w DB → załaduj historię, kontynuuj
 *   - jeśli nie ma → nowa sesja, czysta rozmowa
 */

const messagesEl = document.getElementById('messages');
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const debugPanel = document.getElementById('debug-panel');
const sessionInfo = document.getElementById('session-info');

const LS_KEY = 'pneuma_session_id';

let ws = null;
let sessionId = null;
let isStreaming = false;
let currentAssistantEl = null;
let currentContent = '';

const WS_URL = window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`;

// --- SESSION RESTORE ---

async function initSession() {
    const saved = localStorage.getItem(LS_KEY);

    if (saved) {
        setDebug('Sprawdzam sesję...');
        try {
            const res = await fetch(`/api/session/${saved}`);
            const data = await res.json();

            if (data.exists && data.messages.length > 0) {
                sessionId = saved;
                sessionInfo.textContent = `session: ${sessionId.substring(0, 8)}... (${data.messages.length} wiad.)`;
                renderHistory(data.messages);
                setDebug(`✓ Przywrócono sesję | ${data.messages.length} wiadomości`);
                return;
            }
        } catch (_) {}
    }

    // Nowa sesja - serwer wyśle przez WS po połączeniu
    sessionId = null;
    setDebug('Nowa sesja - łączę...');
}

function renderHistory(messages) {
    messagesEl.innerHTML = '';
    const separator = document.createElement('div');
    separator.style.cssText = 'text-align:center;font-size:11px;color:#444;padding:8px 0;';
    separator.textContent = `─── historia sesji (${messages.length} par) ───`;
    messagesEl.appendChild(separator);

    for (const row of messages) {
        addMessage('user', row.question);
        const aEl = addMessage('assistant', row.answer);
        if (row.topic) {
            const meta = document.createElement('div');
            meta.className = 'message-meta';
            meta.innerHTML = `<span class="memory-indicator">topic: ${row.topic}</span>`;
            aEl.appendChild(meta);
        }
    }

    // Separator "nowe wiadomości"
    const sep2 = document.createElement('div');
    sep2.style.cssText = 'text-align:center;font-size:11px;color:#4a9eff;padding:8px 0;';
    sep2.textContent = '─── kontynuacja ───';
    messagesEl.appendChild(sep2);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// --- WEBSOCKET ---

function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        sendBtn.disabled = false;
        // Jeśli mamy sessionId z localStorage - powiedz serwerowi
        if (sessionId) {
            ws.send(JSON.stringify({ type: 'restore_session', sessionId }));
        }
    };

    ws.onclose = () => {
        setDebug('Rozłączono - rekonektuję za 2s...');
        sendBtn.disabled = true;
        setTimeout(connect, 2000);
    };

    ws.onerror = () => setDebug('Błąd WebSocket');

    ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        switch (msg.type) {
            case 'session':
                sessionId = msg.sessionId;
                localStorage.setItem(LS_KEY, sessionId);
                sessionInfo.textContent = `session: ${sessionId.substring(0, 8)}...`;
                break;

            case 'debug':
                setDebug(msg.text);
                break;

            case 'chunk':
                if (!currentAssistantEl) {
                    currentAssistantEl = addMessage('assistant', '');
                    currentContent = '';
                }
                currentContent += msg.text;
                const metaEl = currentAssistantEl.querySelector('.message-meta');
                currentAssistantEl.textContent = currentContent;
                if (metaEl) currentAssistantEl.appendChild(metaEl);
                currentAssistantEl.classList.add('streaming');
                messagesEl.scrollTop = messagesEl.scrollHeight;
                break;

            case 'done':
                if (currentAssistantEl) {
                    currentAssistantEl.classList.remove('streaming');
                    const meta = document.createElement('div');
                    meta.className = 'message-meta';
                    meta.innerHTML = `<span class="memory-indicator">topic: ${msg.topic || 'general'}</span>`;
                    currentAssistantEl.appendChild(meta);
                }
                currentAssistantEl = null;
                setDebug(`✓ Kronikarz zapisuje | topic: ${msg.topic || 'general'}`);
                isStreaming = false;
                sendBtn.disabled = false;
                input.focus();
                break;

            case 'error':
                if (currentAssistantEl) {
                    currentAssistantEl.textContent = `[Błąd: ${msg.text}]`;
                    currentAssistantEl.classList.remove('streaming');
                    currentAssistantEl.style.color = '#ff6060';
                    currentAssistantEl = null;
                }
                setDebug(`✗ ${msg.text}`);
                isStreaming = false;
                sendBtn.disabled = false;
                break;
        }
    };
}

// --- SEND ---

function sendMessage() {
    const text = input.value.trim();
    if (!text || isStreaming || !ws || ws.readyState !== WebSocket.OPEN) return;

    input.value = '';
    input.style.height = 'auto';
    isStreaming = true;
    sendBtn.disabled = true;

    addMessage('user', text);
    setDebug('Intuicja: analizuje temat...');

    ws.send(JSON.stringify({ type: 'chat', message: text, sessionId }));
}

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
}

function setDebug(text) { debugPanel.textContent = text; }

// Nowa sesja - czyści localStorage i UI
document.getElementById('new-session-btn').addEventListener('click', () => {
    localStorage.removeItem(LS_KEY);
    messagesEl.innerHTML = '';
    sessionId = null;
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'new_session' }));
    }
    setDebug('Nowa sesja');
});

document.getElementById('importer-btn').addEventListener('click', () => {
    window.location.href = '/import';
});

input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
});

input.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

sendBtn.addEventListener('click', sendMessage);

// --- INIT ---
initSession().then(() => connect());
