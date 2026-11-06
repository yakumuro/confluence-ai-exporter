(function (root) {
  'use strict';
  const SHORTCUTS = Object.freeze({
    spelling: '1',
    json: '2',
    diagram: '3',
    custom: '4',
    format: '5',
    table: '6',
    review: '7'
  });
  function actionForEvent(event) {
    if (!event || !event.ctrlKey || !event.altKey || !event.shiftKey || event.metaKey || event.repeat) return null;
    const match = String(event.code || '').match(/^(?:Digit|Numpad)([1-7])$/);
    if (!match) return null;
    return Object.keys(SHORTCUTS).find(action => SHORTCUTS[action] === match[1]) || null;
  }
  function label(action) {
    return SHORTCUTS[action] ? 'Ctrl + Alt + Shift + ' + SHORTCUTS[action] : '';
  }
  const api = { SHORTCUTS, actionForEvent, label };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDExporterAIShortcuts = api;
})(globalThis);
