'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const shortcuts = require('../lib/ai-shortcuts');

test('each AI selection action has its own Ctrl+Alt+Shift shortcut', () => {
  const actions = Object.keys(shortcuts.SHORTCUTS);
  const keys = Object.values(shortcuts.SHORTCUTS);
  assert.equal(actions.length, 7);
  assert.equal(new Set(keys).size, actions.length);
  assert.equal(shortcuts.actionForEvent({ code: 'Digit7', ctrlKey: true, altKey: true, shiftKey: true }), 'review');
  for (const [action, key] of Object.entries(shortcuts.SHORTCUTS)) {
    assert.equal(shortcuts.label(action), 'Ctrl + Alt + Shift + ' + key);
    assert.equal(shortcuts.actionForEvent({ code: 'Digit' + key, ctrlKey: true, altKey: true, shiftKey: true }), action);
    assert.equal(shortcuts.actionForEvent({ code: 'Numpad' + key, ctrlKey: true, altKey: true, shiftKey: true }), action);
  }
});

test('shortcut matching rejects incomplete, modified and repeated key events', () => {
  const base = { code: 'Digit1', ctrlKey: true, altKey: true, shiftKey: true };
  for (const event of [
    { ...base, ctrlKey: false },
    { ...base, altKey: false },
    { ...base, shiftKey: false },
    { ...base, metaKey: true },
    { ...base, repeat: true },
    { ...base, code: 'Key1' }
  ]) assert.equal(shortcuts.actionForEvent(event), null);
  assert.equal(shortcuts.actionForEvent(null), null);
});

test('page shortcut handler consumes selected text, including read-only Confluence macros', () => {
  let keydown;
  const sent = [];
  const editor = { isContentEditable: true };
  const selection = { isCollapsed: false, toString: () => 'selected', anchorNode: { nodeType: 3, parentElement: editor } };
  const document = {
    activeElement: { tagName: 'BODY' },
    querySelector: () => null,
    addEventListener: (type, listener, capture) => { assert.equal(type, 'keydown'); assert.equal(capture, true); keydown = listener; }
  };
  const context = {
    window: { MDExporterAIShortcuts: shortcuts, getSelection: () => selection },
    document,
    chrome: { runtime: { sendMessage: message => sent.push(message) } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../content/ai-shortcuts'), 'utf8'), context);
  const event = {
    code: 'Digit3', ctrlKey: true, altKey: true, shiftKey: true,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  };
  keydown(event);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'md-ai-shortcut');
  assert.equal(sent[0].action, 'diagram');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(event.immediateStopped, true);

  document.activeElement = { tagName: 'BODY' };
  selection.anchorNode.parentElement = { isContentEditable: false };
  keydown({ ...event, code: 'Digit4', prevented: false, stopped: false, immediateStopped: false });
  assert.equal(sent.length, 2);
});

test('table shortcut works for selected TinyMCE cells even without a text range', () => {
  let keydown;
  const sent = [];
  const document = {
    activeElement: { tagName: 'BODY' },
    querySelector: () => ({ tagName: 'TD' }),
    addEventListener: (type, listener) => { keydown = listener; }
  };
  const context = {
    window: { MDExporterAIShortcuts: shortcuts, getSelection: () => ({ isCollapsed: true, toString: () => '' }) },
    document,
    chrome: { runtime: { sendMessage: message => sent.push(message) } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../content/ai-shortcuts'), 'utf8'), context);
  const event = {
    code: 'Digit6', ctrlKey: true, altKey: true, shiftKey: true,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {}
  };
  keydown(event);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'md-ai-shortcut');
  assert.equal(sent[0].action, 'table');
  assert.equal(event.prevented, true);
});
