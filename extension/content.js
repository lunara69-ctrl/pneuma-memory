/**
 * Pneuma Memory - Content Script
 *
 * Działa na stronie chatu (claude.ai, chatgpt, gemini).
 * 1. Przechwytuje submit wiadomości
 * 2. Pobiera memory block z lokalnego serwera Pneumy
 * 3. Dołącza do wiadomości przed wysłaniem
 * 4. Po odpowiedzi AI → wysyła do Kronikarza
 */

const PNEUMA_URL = 'http://localhost:3333';
const SITE = window.location.hostname;

// --- SELEKTORY per platforma ---

const SELECTORS = {
  'claude.ai': {
    input:  'div[contenteditable="true"].ProseMirror, fieldset div[contenteditable="true"]',
    submit: 'button[aria-label="Send message"], button[aria-label="Send Message"]',
    response: '[data-testid="assistant-message"] .prose, [data-testid="assistant-message"], .font-claude-message, [data-is-streaming] .prose, div[class*="Message"] .prose'
  },
  'chatgpt.com': {
    input:  'div#prompt-textarea[contenteditable="true"], textarea[placeholder]',
    submit: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
    response: '[data-message-author-role="assistant"] .markdown'
  },
  'gemini.google.com': {
    input:  'div.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]',
    submit: 'button.send-button, button[aria-label="Send message"]',
    response: 'model-response .response-content'
  }
};

function getSel() {
  for (const [host, sel] of Object.entries(SELECTORS)) {
    if (SITE.includes(host)) return sel;
  }
  return SELECTORS['claude.ai']; // fallback
}

// --- STATUS BADGE ---

let badge = null;

function createBadge() {
  badge = document.createElement('div');
  badge.id = 'pneuma-badge';
  badge.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: #1a1a2e; color: #4a9eff;
    border: 1px solid #2a3a5a; border-radius: 8px;
    padding: 6px 12px; font-size: 12px; font-family: monospace;
    z-index: 99999; opacity: 0.85; pointer-events: none;
    transition: opacity 0.3s;
  `;
  badge.textContent = '⚡ Pneuma';
  document.body.appendChild(badge);
}

function setBadge(text, color = '#4a9eff') {
  if (!badge) createBadge();
  badge.style.color = color;
  badge.textContent = `⚡ ${text}`;
  badge.style.opacity = '1';
  clearTimeout(badge._timer);
  badge._timer = setTimeout(() => badge.style.opacity = '0.4', 3000);
}

// --- ZNAJDŹ INPUT ---

function findInput() {
  const sel = getSel();
  for (const s of sel.input.split(', ')) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

// --- POBIERZ TEKST Z INPUT ---

function getInputText(el) {
  if (el.tagName === 'TEXTAREA') return el.value;
  return el.innerText || el.textContent || '';
}

// --- WSTAW TEKST DO INPUT ---

function insertText(el, text) {
  el.focus();

  if (el.tagName === 'TEXTAREA') {
    el.value += '\n\n' + text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return;
  }

  // contenteditable - kursor na koniec + execCommand
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand('insertText', false, '\n\n' + text);
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

// --- SUBMIT ---

function submitMessage() {
  const selectors = getSel();
  for (const s of selectors.submit.split(', ')) {
    const btn = document.querySelector(s);
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
  }
  // Fallback: Enter key
  const input = findInput();
  if (input) {
    ['keydown','keypress','keyup'].forEach(type => {
      input.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    });
    return true;
  }
  return false;
}

// --- MEMORY BLOCK Z SERWERA ---

async function fetchMemoryBlock(message) {
  try {
    const res = await fetch(`${PNEUMA_URL}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: getSessionId() })
    });
    if (!res.ok) return { memoryBlock: null, topic: 'general' };
    const data = await res.json();
    return { memoryBlock: data.memoryBlock || null, topic: data.topic || 'general' };
  } catch {
    return { memoryBlock: null, topic: 'general' };
  }
}

// --- SESSION ID ---

function getSessionId() {
  let id = sessionStorage.getItem('pneuma_session');
  if (!id) {
    id = 'ext_' + Date.now().toString(36);
    sessionStorage.setItem('pneuma_session', id);
  }
  return id;
}

// --- DECYZJE ZE SIDE PANELU ---

let pendingIntuicjaResolve = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'intuicja_decision' && pendingIntuicjaResolve) {
    pendingIntuicjaResolve(msg.approved);
    pendingIntuicjaResolve = null;
  }
});

function waitForIntuicjaDecision(timeoutMs = 30000) {
  return new Promise(resolve => {
    pendingIntuicjaResolve = resolve;
    // Auto-zatwierdź po timeout (user nie reaguje)
    setTimeout(() => {
      if (pendingIntuicjaResolve) {
        pendingIntuicjaResolve = null;
        resolve(true);
      }
    }, timeoutMs);
  });
}

// --- INTERCEPT SUBMIT ---

let lastQuestion = '';
let intercepting = false;

function interceptSubmit(e) {
  const input = findInput();
  if (!input) return;

  const text = getInputText(input).trim();
  if (!text || intercepting) return;

  // Enter bez Shift = submit (dla claude.ai/chatgpt)
  if (e.type === 'keydown' && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    handleSend(input, text);
    return;
  }
}

function interceptButtonClick(e) {
  const input = findInput();
  if (!input || intercepting) return;

  const text = getInputText(input).trim();
  if (!text) return;

  const selectors = getSel();
  const isSubmitBtn = selectors.submit.split(', ').some(s => e.target.closest(s));
  if (!isSubmitBtn) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  handleSend(input, text);
}

async function handleSend(input, originalText) {
  intercepting = true;
  lastQuestion = originalText;
  setBadge('Intuicja...', '#f0a500');

  const { memoryBlock, topic } = await fetchMemoryBlock(originalText);

  // Wyślij podgląd do side panelu i czekaj na decyzję
  chrome.runtime.sendMessage({
    type: 'intuicja_preview',
    memoryBlock,
    topic,
    question: originalText.substring(0, 120)
  });

  const approved = await waitForIntuicjaDecision(30000);

  if (approved && memoryBlock) {
    // Wyczyść input i wpisz oryginalne pytanie + memory block
    if (input.tagName === 'TEXTAREA') {
      input.value = '';
    } else {
      input.innerHTML = '';
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    insertText(input, originalText.trim() + memoryBlock);
    setBadge('Memory OK ✓', '#2d9e6b');
  } else if (!memoryBlock) {
    setBadge('Bez pamięci', '#888');
  } else {
    setBadge('Pominięto pamięć', '#888');
  }

  // Wyślij
  setTimeout(() => {
    submitMessage();
    intercepting = false;
    watchForResponse();
  }, 150);
}

// --- OBSERWUJ ODPOWIEDŹ AI ---

let responseObserver = null;
let lastResponseText = '';

function watchForResponse() {
  if (responseObserver) responseObserver.disconnect();
  setBadge('Czekam na odpowiedź...', '#4a9eff');

  if (SITE.includes('claude.ai')) {
    watchForResponseClaude();
  } else {
    watchForResponseGeneric();
  }
}

function watchForResponseClaude() {
  // action-bar-retry pojawia się TYLKO przy odpowiedziach asystenta (nie przy user-message)
  const copyBefore = document.querySelectorAll('[data-testid="action-bar-retry"]').length;
  setBadge('Czekam...', '#4a9eff');

  const obs = new MutationObserver(() => {
    const copyNow = document.querySelectorAll('[data-testid="action-bar-retry"]').length;
    if (copyNow > copyBefore) {
      obs.disconnect();
      setBadge('Streaming...', '#4a9eff');
      // Krótkie opóźnienie żeby DOM się ustabilizował
      setTimeout(() => {
        const text = extractLastAssistantMessage();
        if (text && text.length > 20 && text !== lastResponseText) {
          lastResponseText = text;
          finishChronicle(text);
        } else {
          setBadge('Gotowa', '#2d9e6b');
        }
      }, 600);
    }
  });

  obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  setTimeout(() => obs.disconnect(), 180000);
}

function extractLastAssistantMessage() {
  // action-bar-retry jest TYLKO przy odpowiedziach asystenta - użyj jako anchor
  const retryBtns = document.querySelectorAll('[data-testid="action-bar-retry"]');
  if (retryBtns.length) {
    const lastRetry = retryBtns[retryBtns.length - 1];
    // Idź w górę szukając kontenera z tekstem
    let node = lastRetry;
    for (let i = 0; i < 8; i++) {
      node = node.parentElement;
      if (!node) break;
      // Szukaj poprzedniego rodzeństwa bez testid (to jest blok tekstu odpowiedzi)
      const prev = node.previousElementSibling;
      if (prev && !prev.getAttribute('data-testid')) {
        const t = prev.innerText || prev.textContent || '';
        if (t.length > 30) return t;
      }
      // Albo cały kontener minus tekst przycisków
      const fullText = (node.innerText || '').replace(/Copy|Retry|Edit/g, '').trim();
      if (fullText.length > 100) return fullText;
    }
  }
  return '';
}

function watchForResponseGeneric() {
  const container = document.querySelector('main, [role="main"], body');
  if (!container) return;

  let stableTimer = null;
  let lastText = '';

  responseObserver = new MutationObserver(() => {
    const responseText = getLastAIResponse();
    if (!responseText || responseText === lastResponseText) return;

    lastText = responseText;
    clearTimeout(stableTimer);

    stableTimer = setTimeout(() => {
      if (lastText === getLastAIResponse() && lastText.length > 20) {
        lastResponseText = lastText;
        responseObserver.disconnect();
        finishChronicle(lastText);
      }
    }, 2000);
  });

  responseObserver.observe(container, { childList: true, subtree: true, characterData: true });
}

function finishChronicle(text) {
  setBadge('Kronikarz — sprawdź panel', '#f0a500');
  // Wyślij podgląd do side panelu - użytkownik decyduje czy zapisać
  chrome.runtime.sendMessage({
    type: 'kronikarz_preview',
    question: lastQuestion,
    answer: text,
    sessionId: getSessionId()
  });
}

function getLastAIResponse() {
  const sel = getSel();
  for (const s of sel.response.split(', ')) {
    const els = document.querySelectorAll(s.trim());
    if (els.length) {
      const text = els[els.length - 1].innerText || els[els.length - 1].textContent || '';
      if (text.length > 20) return text;
    }
  }
  return '';
}

// --- INIT ---

function init() {
  setBadge('Gotowa', '#2d9e6b');

  // Nasłuchuj Enter (capture phase żeby przechwycić przed sitem)
  document.addEventListener('keydown', interceptSubmit, { capture: true });
  // Nasłuchuj klik przycisku submit
  document.addEventListener('click', interceptButtonClick, { capture: true });

  // Sprawdź połączenie z serwerem
  fetch(`${PNEUMA_URL}/api/status`)
    .then(r => r.ok ? setBadge('Połączono ✓', '#2d9e6b') : setBadge('Serwer offline', '#e74c3c'))
    .catch(() => setBadge('Serwer offline', '#e74c3c'));
}

// Poczekaj na załadowanie DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 1000); // claude.ai renderuje asynchronicznie
}
