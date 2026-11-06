(function () {
  'use strict';
  if (window.__mdExporterAIShortcutsInstalled) return;
  window.__mdExporterAIShortcutsInstalled = true;
  const shortcuts = window.MDExporterAIShortcuts;
  if (!shortcuts || !chrome.runtime || !chrome.runtime.sendMessage) return;

  function isEditable(element) {
    if (!element) return false;
    if (element.isContentEditable) return true;
    if (element.closest && element.closest('[contenteditable="true"], [contenteditable=""], .mce-content-body')) return true;
    return /^(INPUT|TEXTAREA)$/.test(element.tagName || '');
  }

  function hasSelection(action) {
    if (action === 'table' && document.querySelector('td[data-mce-selected], th[data-mce-selected]')) return true;
    const active = document.activeElement;
    if (/^(INPUT|TEXTAREA)$/.test(active && active.tagName || '')) {
      return typeof active.selectionStart === 'number' && active.selectionEnd > active.selectionStart;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString()) return false;
    return true;
  }

  document.addEventListener('keydown', event => {
    if (document.activeElement && document.activeElement.id === 'md-exporter-ai-dialog') return;
    const action = shortcuts.actionForEvent(event);
    if (!action || !hasSelection(action)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({ type: 'md-ai-shortcut', action });
  }, true);
})();
