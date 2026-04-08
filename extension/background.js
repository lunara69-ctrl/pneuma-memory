/**
 * Pneuma - Background Service Worker
 * Relay między content script a side panel + otwieranie side panelu
 */

// Otwórz side panel po kliknięciu ikony
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Relay wiadomości: content → side panel i side panel → content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Content script → side panel (intuicja preview)
  if (msg.type === 'intuicja_preview') {
    // Dołącz tabId żeby side panel mógł odesłać decyzję
    chrome.runtime.sendMessage({ ...msg, tabId: sender.tab?.id });
    sendResponse({ ok: true });
    return;
  }

  // Content script → side panel (kronikarz preview)
  if (msg.type === 'kronikarz_preview') {
    chrome.runtime.sendMessage({ ...msg, tabId: sender.tab?.id });
    sendResponse({ ok: true });
    return;
  }

  // Side panel → content script (decyzja intuicja/kronikarz)
  if (msg.type === 'intuicja_decision' || msg.type === 'kronikarz_decision') {
    if (msg.tabId) {
      chrome.tabs.sendMessage(msg.tabId, msg);
    }
    sendResponse({ ok: true });
    return;
  }

  sendResponse({ ok: true });
});
