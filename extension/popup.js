const PNEUMA_URL = 'http://localhost:3333';

const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const sessionIdEl = document.getElementById('session-id');
const logContainer = document.getElementById('log-container');

// Sprawdź status serwera
fetch(`${PNEUMA_URL}/api/status`)
  .then(r => {
    if (r.ok) return r.json();
    throw new Error('offline');
  })
  .then(data => {
    dot.className = 'status-dot ok';
    statusText.textContent = `localhost:${data.port || 3333}`;
  })
  .catch(() => {
    dot.className = 'status-dot err';
    statusText.textContent = 'serwer offline';
  });

// Pobierz aktywną sesję z aktywnej karty
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  chrome.scripting?.executeScript({
    target: { tabId: tabs[0].id },
    func: () => sessionStorage.getItem('pneuma_session')
  }).then(results => {
    const sid = results?.[0]?.result;
    sessionIdEl.textContent = sid || 'brak (otwórz chat)';
  }).catch(() => {
    sessionIdEl.textContent = 'brak uprawnień';
  });
});

// Załaduj log Kronikarza
function loadLog() {
  chrome.storage.local.get('chronicleLog', ({ chronicleLog = [] }) => {
    if (!chronicleLog.length) {
      logContainer.innerHTML = '<div class="log-empty">Brak wpisów w tej sesji.</div>';
      return;
    }
    logContainer.innerHTML = chronicleLog.map(e => `
      <div class="log-entry">
        <div class="log-ts">${e.ts} · ${e.sessionId || ''}</div>
        <div class="log-q">Q: ${esc(e.question)}</div>
        <div class="log-a">A: ${esc(e.answer)}...</div>
      </div>
    `).join('');
  });
}

function esc(s = '') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadLog();
// Odśwież co 3s gdy popup otwarty
setInterval(loadLog, 3000);

document.getElementById('open-import').addEventListener('click', () => {
  chrome.tabs.create({ url: `${PNEUMA_URL}/import` });
});

document.getElementById('clear-log').addEventListener('click', () => {
  chrome.storage.local.set({ chronicleLog: [] });
  loadLog();
});
