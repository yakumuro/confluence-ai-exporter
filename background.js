/** Service worker: AI context menu and the persistent Chrome side panel. */
'use strict';

importScripts('ai-background.js');

function createMenu() {
  chrome.contextMenus.removeAll(function () {
    createAIMenus();
  });
}

createMenu();
chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(error => console.warn('[MD Exporter] Не удалось настроить боковую панель:', error.message));
}

chrome.runtime.onMessage.addListener(function (message, sender, respond) {
  if (!message || message.type !== 'md-ai-open-panel') return;
  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId) || !MDExporterAI.ACTIONS[message.action]) {
    respond({ ok: false, error: 'Некорректная команда AI.' });
    return;
  }
  openAIFromPanel(tabId, message.action)
    .then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});
