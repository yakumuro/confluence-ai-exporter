'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ai = require('../lib/ai-client');
const scenariosApi = require('../lib/ai-scenarios');
function harness(session = {}) {
  let listener, click;
  const calls = [], local = {}, created = [];
  const storage = values => ({
    get: async key => key === null ? { ...values } : { [key]: values[key] },
    set: async data => Object.assign(values, data),
    remove: async keys => { for (const key of [].concat(keys)) delete values[key]; },
    setAccessLevel: async data => calls.push(['access', data])
  });
  const context = {
    importScripts() {}, console, URL, Date,
    MDExporterAI: { ...ai, transform: async () => 'Исправленный текст' },
    MDExporterAIScenarios: scenariosApi,
    showBadge() {},
    chrome: {
      contextMenus: { create: data => created.push(data), onClicked: { addListener: fn => { click = fn; } } },
      scripting: { executeScript: async request => { calls.push(['script', request]); return [{ result: { ok: true, value: request.args && request.args[0] === 'capture' ? { id: 'captured', source: 'Превет' } : { ok: true } } }]; } },
      tabs: { sendMessage: async (...args) => { calls.push(['tab-message', ...args]); } },
      storage: { local: storage(local), session: storage(session) },
      permissions: { contains: async () => true },
      runtime: { onMessage: { addListener: fn => { listener = fn; } } },
      alarms: { create() {}, onAlarm: { addListener() {} } }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../ai-background'), 'utf8'), context);
  const sender = { tab: { id: 7 }, frameId: 2 };
  return {
    context, calls, local, session, created,
    message: (message, from = sender) => new Promise(resolve => { if (listener(message, from, resolve) !== true) resolve(undefined); }),
    menus: () => context.createAIMenus(),
    click: (info, tab = { id: 7 }) => click(info, tab)
  };
}
function job(extra = {}) { return { tabId: 7, frameId: 2, action: 'spelling', source: 'Превет', created: Date.now(), ...extra }; }
test('AI menus include all predefined and custom actions', () => {
  const h = harness(); h.menus();
  assert.deepEqual(h.created.map(item => item.id), ['md-exporter-ai', ...Object.keys(ai.ACTIONS).map(action => 'md-ai-' + action)]);
  assert(!Object.keys(ai.ACTIONS).includes('plantuml'));
  assert(!Object.keys(ai.ACTIONS).includes('mermaid'));
});
test('export persistence is relayed to the sender tab key, not arbitrary storage keys', async () => {
  const h = harness();
  const response = await h.message({ type: 'MD_EXPORT_PERSIST_JOB', tabId: 99, job: { state: 'running' } });
  assert.equal(response.ok, true);
  assert.equal(h.local['job:7'].state, 'running');
  assert.equal(h.local['job:99'], undefined);
});
test('AI dialog opens in locked state when API key is not configured', async () => {
  const h = harness();
  await h.click({ menuItemId: 'md-ai-spelling', frameId: 2 });
  const delivered = h.calls.find(call => call[0] === 'tab-message');
  assert.equal(delivered[2].locked, true);
});
test('AI dialog opens unlocked once an API key is stored', async () => {
  const h = harness();
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  await h.click({ menuItemId: 'md-ai-spelling', frameId: 2 });
  const delivered = h.calls.find(call => call[0] === 'tab-message');
  assert.equal(delivered[2].locked, false);
});
test('dialog button request opens the extension settings page', async () => {
  const h = harness();
  let opened = 0;
  h.context.chrome.runtime.openOptionsPage = async () => { opened += 1; };
  const response = await h.message({ type: 'md-ai-open-settings' }, { tab: { id: 7 }, frameId: 0 });
  assert.equal(response.ok, true);
  assert.equal(opened, 1);
});
test('AI requests read stored source, persist result and apply only confirmed result', async () => {
  const h = harness({ 'aiJob:id': job() });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'test-secret', model: 'model' };
  const response = await h.message({ type: 'md-ai-run', id: 'id', source: 'injected' });
  assert.equal(response.result, 'Исправленный текст');
  assert.equal(h.session['aiJob:id'].source, 'Превет');
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  const applied = await h.message({ type: 'md-ai-apply', id: 'id', result: 'injected' });
  assert.equal(applied.ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[0], 'apply');
  assert.equal(execution.args[1][1], 'Исправленный текст');
  assert.equal(execution.args[1][2], 'replace');
  assert.equal(execution.world, 'MAIN'); assert.equal(execution.target.frameIds[0], 2);
  assert.equal(h.session['aiJob:id'], undefined);
});
test('rich formatting result is stored and applied as validated structured data, not UI-supplied HTML', async () => {
  const source = { format: 'rich-text', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Риск' }] }] } };
  const rich = { format: 'rich-text', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Риск', bold: true, color: '#ff0000' }] }] } };
  const h = harness({ 'aiJob:id': job({ action: 'format', source, uiFrameId: 0 }) });
  const sender = { tab: { id: 7 }, frameId: 0 };
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  h.context.MDExporterAI.transform = async (settings, action, selected, prompt) => {
    assert.equal(action, 'format'); assert.deepEqual(selected, source); assert.equal(prompt, 'Риск жирным и красным'); return rich;
  };
  assert.deepEqual((await h.message({ type: 'md-ai-run', id: 'id', prompt: 'Риск жирным и красным' }, sender)).result, rich);
  assert.deepEqual(h.session['aiJob:id'].result, rich);
  assert.equal((await h.message({ type: 'md-ai-apply', id: 'id', result: '<script>injected</script>' }, sender)).ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.deepEqual(execution.args[1][1], rich); assert.equal(execution.target.frameIds[0], 2);
});
test('preview confirmation survives a service-worker restart', async () => {
  const session = { 'aiJob:id': job({ result: 'saved response' }) };
  const freshWorker = harness(session);
  assert.equal((await freshWorker.message({ type: 'md-ai-apply', id: 'id' })).ok, true);
});
test('cross-tab, cross-frame, expired and premature application are rejected', async () => {
  for (const [stored, sender] of [
    [job({ result: 'text' }), { tab: { id: 8 }, frameId: 2 }],
    [job({ result: 'text' }), { tab: { id: 7 }, frameId: 3 }],
    [job({ created: Date.now() - 600001, result: 'text' }), undefined],
    [job(), undefined]
  ]) {
    const h = harness({ 'aiJob:id': stored });
    const result = await h.message({ type: 'md-ai-apply', id: 'id' }, sender);
    assert.equal(result.ok, false);
    assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  }
});
test('retry reuses the saved selection and replaces only the stored AI result', async () => {
  const h = harness({ 'aiJob:id': job() });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'test-secret', model: 'model' };
  const selected = [];
  h.context.MDExporterAI.transform = async (settings, action, source) => {
    selected.push(source);
    return selected.length === 1 ? 'Первый результат' : 'Новый результат';
  };
  assert.equal((await h.message({ type: 'md-ai-run', id: 'id' })).result, 'Первый результат');
  assert.equal((await h.message({ type: 'md-ai-run', id: 'id' })).result, 'Новый результат');
  assert.deepEqual(selected, ['Превет', 'Превет']);
  assert.equal(h.session['aiJob:id'].source, 'Превет');
  assert.equal(h.session['aiJob:id'].result, 'Новый результат');
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  await h.message({ type: 'md-ai-apply', id: 'id' });
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[1][1], 'Новый результат');
});
test('read-only complex selections can be analyzed but never replaced', async () => {
  const h = harness({ 'aiJob:id': job({ readOnly: true, result: 'Исправленный текст' }) });
  const response = await h.message({ type: 'md-ai-apply', id: 'id' });
  assert.equal(response.ok, false);
  assert.match(response.error, /только для анализа|копирования/);
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  assert.equal(h.session['aiJob:id'].result, 'Исправленный текст');
});
test('requirements analysis can be retried but never applied over the document', async () => {
  const review = { format: 'review', score: 65, summary: 'Есть пробелы', recommendations: [{ text: 'Добавьте критерии', impact: 10 }] };
  const h = harness({ 'aiJob:id': job({ action: 'review', result: review }) });
  assert.equal((await h.message({ type: 'md-ai-apply', id: 'id' })).ok, false);
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  assert.deepEqual(h.session['aiJob:id'].result, review);
});
test('cancellation removes pending request state', async () => {
  const h = harness({ 'aiJob:id': job({ result: 'text' }) });
  assert.equal((await h.message({ type: 'md-ai-close', id: 'id' })).ok, true);
  assert.equal(h.session['aiJob:id'], undefined);
  assert.equal((await h.message({ type: 'md-ai-apply', id: 'id' })).ok, false);
});
test('all context actions capture in the clicked iframe but open their dialog in the top frame', async () => {
  for (const action of Object.keys(ai.ACTIONS)) {
    const h = harness();
    await h.click({ menuItemId: 'md-ai-' + action, frameId: 2 });
    const capture = h.calls.find(call => call[0] === 'script' && call[1].args && call[1].args[0] === 'capture')[1];
    assert.equal(capture.target.frameIds[0], 2);
    assert.equal(capture.args[1][0], action);
    const ui = h.calls.find(call => call[0] === 'script' && call[1].files && call[1].files.includes('content/ai-ui.js'))[1];
    assert.equal(ui.target.frameIds[0], 0);
    const delivered = h.calls.find(call => call[0] === 'tab-message');
    assert.equal(delivered[2].action, action); assert.equal(delivered[3].frameId, 0);
    assert.equal(h.session['aiJob:captured'].uiFrameId, 0);
    assert.equal(h.session['aiJob:captured'].frameId, 2);
  }
});
test('application can be confirmed to insert the answer after the original selection', async () => {
  const h = harness({ 'aiJob:id': job({ uiFrameId: 0, result: 'Добавленный текст' }) });
  const response = await h.message({ type: 'md-ai-apply', id: 'id', mode: 'after' }, { tab: { id: 7 }, frameId: 0 });
  assert.equal(response.ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[1][2], 'after');
});
test('cell-edit results cannot be inserted after selected cells', async () => {
  const h = harness({ 'aiJob:id': job({ action: 'table', uiFrameId: 0, result: { cells: [{ id: 'c0', text: 'да' }] } }) });
  const response = await h.message({ type: 'md-ai-apply', id: 'id', mode: 'after' }, { tab: { id: 7 }, frameId: 0 });
  assert.equal(response.ok, false);
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
});
test('free-instruction scenario is saved, deduplicated and returned without exposing AI settings', async () => {
  const h = harness();
  const prompt = 'Сократи текст, сохранив смысл';
  const created = await h.message({ type: 'md-ai-save-scenario', name: 'Сократить текст', prompt });
  assert.equal(created.ok, true);
  assert.equal(created.created, true);
  assert.equal(created.scenario.prompt, prompt);
  assert.equal(created.scenarios.custom.length, 1);
  assert.equal(h.local[scenariosApi.KEY][0].name, 'Сократить текст');
  const duplicate = await h.message({ type: 'md-ai-save-scenario', name: 'Сократить текст', prompt });
  assert.equal(duplicate.created, false);
  assert.equal(h.local[scenariosApi.KEY].length, 1);
  const updated = await h.message({
    type: 'md-ai-save-scenario', scenarioId: created.scenario.id,
    name: 'Сделать саммари', prompt: 'Подготовь краткое саммари'
  });
  assert.equal(updated.updated, true);
  assert.equal(h.local[scenariosApi.KEY][0].name, 'Сделать саммари');
  assert.equal(h.local[scenariosApi.KEY][0].prompt, 'Подготовь краткое саммари');
  assert.equal(h.local[ai.KEY], undefined);
});
test('free-instruction scenario rejects empty and oversized prompts', async () => {
  const h = harness();
  for (const prompt of ['', ' '.repeat(4), 'x'.repeat(4001)]) {
    const response = await h.message({ type: 'md-ai-save-scenario', name: 'Scenario', prompt });
    assert.equal(response.ok, false);
  }
  assert.equal((await h.message({ type: 'md-ai-save-scenario', name: '', prompt: 'valid prompt' })).ok, false);
  assert.equal((await h.message({ type: 'md-ai-save-scenario', name: 'x'.repeat(65), prompt: 'valid prompt' })).ok, false);
  assert.equal(h.local[scenariosApi.KEY], undefined);
});
test('top-frame dialog can run and apply to its saved iframe, but the editor frame cannot impersonate it', async () => {
  const h = harness({ 'aiJob:id': job({ uiFrameId: 0 }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  assert.equal((await h.message({ type: 'md-ai-run', id: 'id' })).ok, false);
  const sender = { tab: { id: 7 }, frameId: 0 };
  assert.equal((await h.message({ type: 'md-ai-run', id: 'id' }, sender)).ok, true);
  assert.equal((await h.message({ type: 'md-ai-apply', id: 'id' }, sender)).ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.target.frameIds[0], 2);
});
test('editor errors reach the dialog and do not destroy the pending result', async () => {
  const h = harness({ 'aiJob:id': job({ uiFrameId: 0, result: 'replacement' }) });
  h.context.chrome.scripting.executeScript = async () => [{ result: { ok: false, error: 'Документ изменился' } }];
  const response = await h.message({ type: 'md-ai-apply', id: 'id' }, { tab: { id: 7 }, frameId: 0 });
  assert.equal(response.ok, false); assert.equal(response.error, 'Документ изменился');
  assert.equal(h.session['aiJob:id'].result, 'replacement');
});
test('top-frame dialog cancellation discards the selection in its original iframe', async () => {
  const h = harness({ 'aiJob:id': job({ uiFrameId: 0 }) });
  assert.equal((await h.message({ type: 'md-ai-close', id: 'id' }, { tab: { id: 7 }, frameId: 0 })).ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[0], 'discard'); assert.equal(execution.target.frameIds[0], 2);
});
