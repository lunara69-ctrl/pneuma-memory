/**
 * Importer UI logic
 */

const backBtn = document.getElementById('back-btn');
const fileInput = document.getElementById('file-input');
const fileStatus = document.getElementById('file-status');
const markerLucky = document.getElementById('marker-lucky');
const markerKinia = document.getElementById('marker-kinia');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const rawChat = document.getElementById('raw-chat');
const sessionIdInput = document.getElementById('session-id');
const previewBtn = document.getElementById('preview-btn');
const importBtn = document.getElementById('import-btn');
const previewContent = document.getElementById('preview-content');
const statusMsg = document.getElementById('status-msg');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');

// Ustaw domyślne daty (ostatni tydzień)
const now = new Date();
const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
dateTo.value = toDatetimeLocal(now);
dateFrom.value = toDatetimeLocal(weekAgo);

function toDatetimeLocal(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Załaduj plik MD
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileStatus.textContent = `Ładuję: ${file.name}...`;
    const reader = new FileReader();
    reader.onload = (ev) => {
        rawChat.value = ev.target.result;
        fileStatus.textContent = `✓ ${file.name} (${Math.round(file.size/1024)} KB)`;
        setStatus(`Plik załadowany. Kliknij "Preview chunków" żeby sprawdzić.`);
    };
    reader.readAsText(file, 'utf-8');
});

backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
});

// Preview
previewBtn.addEventListener('click', async () => {
    const content = rawChat.value.trim();
    if (!content) { setStatus('Wklej chat lub załaduj plik.', true); return; }

    setStatus('Analizuję...');
    const chunks = parseChat(content, markerLucky.value, markerKinia.value);

    if (chunks.length === 0) {
        setStatus(`Nie znaleziono par. Sprawdź znaczniki: "${markerLucky.value}" i "${markerKinia.value}"`, true);
        renderPreview([]);
        return;
    }

    setStatus(`Znaleziono ${chunks.length} par Q-A.`);
    renderPreview(chunks.slice(0, 8));
});

// Import
importBtn.addEventListener('click', async () => {
    const content = rawChat.value.trim();
    if (!content) { setStatus('Wklej chat lub załaduj plik.', true); return; }

    const chunks = parseChat(content, markerLucky.value, markerKinia.value);
    if (chunks.length === 0) {
        setStatus('Brak par do importu. Sprawdź znaczniki.', true);
        return;
    }

    const sessionId = sessionIdInput.value.trim() || `import_${Date.now()}`;
    const from = dateFrom.value ? new Date(dateFrom.value) : null;
    const to = dateTo.value ? new Date(dateTo.value) : null;

    importBtn.disabled = true;
    progressBar.style.display = 'block';
    setStatus(`Importuję ${chunks.length} par... sesja: ${sessionId}`);

    const result = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chunks,
            sessionId,
            dateFrom: from?.toISOString(),
            dateTo: to?.toISOString()
        })
    }).then(r => r.json());

    progressFill.style.width = '100%';
    importBtn.disabled = false;

    if (result.error) {
        setStatus(`Błąd: ${result.error}`, true);
    } else {
        setStatus(`✓ Zapisano ${result.saved} par | Pominięto ${result.skipped} | Sesja: ${result.sessionId}`);
        renderPreview(chunks.slice(0, 5), true);
    }
});

// Parser - działa w renderer (bez Node.js)
function parseChat(content, luckyMarker, kiniaMarker) {
    const pairs = [];
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n---\n/);

    let currentQuestion = null;

    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        // Skip YAML frontmatter
        if (trimmed.startsWith('---') && trimmed.includes('title:')) continue;

        const luckyRe = new RegExp('^' + escapeRe(luckyMarker) + '\\s*', 'm');
        const kiniaRe = new RegExp('^' + escapeRe(kiniaMarker) + '\\s*', 'm');

        if (luckyRe.test(trimmed)) {
            const text = trimmed.replace(luckyRe, '').trim();
            if (text.length >= 5) currentQuestion = text;

        } else if (kiniaRe.test(trimmed)) {
            const text = trimmed.replace(kiniaRe, '').trim();
            if (text.length >= 10 && currentQuestion) {
                pairs.push({ question: currentQuestion, answer: text });
                currentQuestion = null;
            }
        }
    }
    return pairs;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectTopicSimple(text) {
    const lower = text.toLowerCase();
    const MAP = {
        'lmstudio': ['lmstudio', 'lm studio', 'kv cache', 'preset', 'jinja', 'vram'],
        'llm': ['llm', 'model', 'claude', 'gemini', 'qwen', 'temperature', 'token'],
        'pneuma': ['pneuma', 'kinia', 'kronikarz', 'intuicja'],
        'agent': ['agent', 'worker', 'supervisor', 'bash'],
        'filozofia': ['świadomość', 'przemij', 'ichi', 'ajahn', 'życie'],
    };
    let best = 'general', bestScore = 0;
    for (const [topic, kws] of Object.entries(MAP)) {
        const score = kws.filter(k => lower.includes(k)).length;
        if (score > bestScore) { bestScore = score; best = topic; }
    }
    return best;
}

function renderPreview(chunks, imported = false) {
    if (chunks.length === 0) {
        previewContent.innerHTML = '<div class="preview-empty">Brak par do podglądu.</div>';
        return;
    }

    const label = imported ? ' (zaimportowane)' : '';
    let html = `<div class="chunk-list">`;
    chunks.forEach((c, i) => {
        const topic = detectTopicSimple(c.question + ' ' + c.answer);
        html += `
        <div class="chunk-item">
            <div class="chunk-meta">#${i+1}${label}</div>
            <div class="chunk-q">Q: ${esc(c.question.substring(0, 200))}${c.question.length > 200 ? '...' : ''}</div>
            <div class="chunk-a">A: ${esc(c.answer.substring(0, 300))}${c.answer.length > 300 ? '...' : ''}</div>
            <span class="chunk-topic">${topic}</span>
        </div>`;
    });
    if (chunks.length > 8) {
        html += `<div class="preview-empty">... i ${chunks.length - 8} więcej par</div>`;
    }
    html += '</div>';
    previewContent.innerHTML = html;
}

function setStatus(msg, isError = false) {
    statusMsg.textContent = msg;
    statusMsg.className = 'status-msg' + (isError ? ' error' : '');
}

function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
