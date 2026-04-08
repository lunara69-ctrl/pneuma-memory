const PNEUMA_URL = 'http://localhost:3333';

// --- STATUS ---
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');

function checkStatus() {
  fetch(`${PNEUMA_URL}/api/status`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      dot.className = 'status-dot ok';
      statusText.textContent = `localhost:${d.port}`;
    })
    .catch(() => {
      dot.className = 'status-dot err';
      statusText.textContent = 'serwer offline';
    });
}
checkStatus();
setInterval(checkStatus, 10000);

// --- STAN ---
let pendingIntuicja = null;  // { question, memoryBlock, topic, tabId }
let pendingKronikarz = null; // { question, answer, sessionId, tabId }

// --- INTUICJA UI ---
const badgeIntuicja  = document.getElementById('badge-intuicja');
const previewIntuicja = document.getElementById('preview-intuicja');
const btnsIntuicja   = document.getElementById('btns-intuicja');
const topicBar       = document.getElementById('topic-bar');
const topicPill      = document.getElementById('topic-pill');

function showIntuicja(data) {
  pendingIntuicja = data;

  badgeIntuicja.textContent = 'przegląd';
  badgeIntuicja.className = 'section-badge warn';

  if (data.topic && data.topic !== 'general') {
    topicPill.textContent = '# ' + data.topic;
    topicBar.className = 'topic-bar show';
  } else {
    topicBar.className = 'topic-bar';
  }

  if (data.memoryBlock) {
    previewIntuicja.textContent = data.memoryBlock.trim();
    previewIntuicja.className = 'preview has-content';
    btnsIntuicja.className = 'btn-row show';
  } else {
    previewIntuicja.textContent = 'Brak dopasowań w pamięci dla tego pytania.';
    previewIntuicja.className = 'preview';
    // Auto-pass gdy brak pamięci
    sendDecision('intuicja', true);
  }

  document.getElementById('footer-info').textContent =
    'Q: ' + (data.question || '').substring(0, 60);
}

function clearIntuicja(status, label) {
  badgeIntuicja.textContent = label;
  badgeIntuicja.className = 'section-badge ' + status;
  btnsIntuicja.className = 'btn-row';
  topicBar.className = 'topic-bar';
  previewIntuicja.textContent = 'Czekam na następne pytanie...';
  previewIntuicja.className = 'preview';
  pendingIntuicja = null;
}

document.getElementById('btn-intuicja-ok').addEventListener('click', () => {
  sendDecision('intuicja', true);
  clearIntuicja('ok', 'zatwierdzone');
});

document.getElementById('btn-intuicja-skip').addEventListener('click', () => {
  sendDecision('intuicja', false);
  clearIntuicja('', 'pominięte');
});

// --- KRONIKARZ UI ---
const badgeKronikarz   = document.getElementById('badge-kronikarz');
const previewKronikarz = document.getElementById('preview-kronikarz');
const btnsKronikarz    = document.getElementById('btns-kronikarz');

function showKronikarz(data) {
  pendingKronikarz = data;

  badgeKronikarz.textContent = 'przegląd';
  badgeKronikarz.className = 'section-badge warn';

  previewKronikarz.innerHTML =
    `<div class="diary-q">Q: ${esc(data.question.substring(0, 120))}</div>` +
    `<div class="diary-a">A: ${esc(data.answer.substring(0, 300))}${data.answer.length > 300 ? '...' : ''}</div>`;
  previewKronikarz.className = 'preview has-content';
  btnsKronikarz.className = 'btn-row show';
}

function clearKronikarz(status, label) {
  badgeKronikarz.textContent = label;
  badgeKronikarz.className = 'section-badge ' + status;
  btnsKronikarz.className = 'btn-row';
  previewKronikarz.textContent = 'Brak odpowiedzi do zapisania...';
  previewKronikarz.className = 'preview';
  pendingKronikarz = null;
}

document.getElementById('btn-kronikarz-ok').addEventListener('click', () => {
  if (!pendingKronikarz) return;
  // Wyślij do serwera
  fetch(`${PNEUMA_URL}/api/chronicle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: pendingKronikarz.question,
      answer:   pendingKronikarz.answer,
      sessionId: pendingKronikarz.sessionId
    })
  }).then(() => clearKronikarz('ok', 'zapisano ✓'))
    .catch(() => clearKronikarz('', 'błąd zapisu'));
});

document.getElementById('btn-kronikarz-skip').addEventListener('click', () => {
  clearKronikarz('', 'pominięto');
});

// --- KOMUNIKACJA Z CONTENT SCRIPT (przez background) ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'intuicja_preview') {
    showIntuicja(msg);
  }
  if (msg.type === 'kronikarz_preview') {
    showKronikarz(msg);
  }
});

function sendDecision(type, approved) {
  chrome.runtime.sendMessage({
    type: type + '_decision',
    approved,
    tabId: type === 'intuicja' ? pendingIntuicja?.tabId : pendingKronikarz?.tabId
  });
}

function esc(s = '') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
