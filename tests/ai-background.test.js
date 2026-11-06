'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ai = require('../lib/ai-client');
const scenariosApi = require('../lib/ai-scenarios');
function harness(session = {}) {
  let listener, click, alarmListener;
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
      scripting: { executeScript: async request => {
        calls.push(['script', request]);
        const captured = request.args && (request.args[0] === 'capture' || (typeof request.args[0] === 'string' && ai.ACTIONS[request.args[0]]));
        return [{ frameId: 2, result: { ok: true, value: captured ? { id: 'captured', source: 'Превет', editable: true } : { ok: true } } }];
      } },
      tabs: {
        sendMessage: async (...args) => { calls.push(['tab-message', ...args]); },
        get: async tabId => ({ id: tabId, url: 'https://confluence.example/pages/123' })
      },
      storage: { local: storage(local), session: storage(session) },
      permissions: { contains: async () => true },
      runtime: { onMessage: { addListener: fn => { listener = fn; } } },
      alarms: { create() {}, onAlarm: { addListener: fn => { alarmListener = fn; } } }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../ai-background'), 'utf8'), context);
  const sender = { tab: { id: 7 }, frameId: 2 };
  return {
    context, calls, local, session, created,
    message: (message, from = sender) => new Promise(resolve => { if (listener(message, from, resolve) !== true) resolve(undefined); }),
    menus: () => context.createAIMenus(),
    click: (info, tab = { id: 7 }) => click(info, tab),
    cleanup: () => alarmListener({ name: 'md-ai-cleanup' })
  };
}
function job(extra = {}) { return { tabId: 7, frameId: 2, action: 'spelling', source: 'Превет', created: Date.now(), ...extra }; }
function tasksJob(extra = {}) {
  return job({
    action: 'tasks', uiFrameId: 0, readOnly: true, conversation: [], stage: 'propose',
    pageUrl: 'https://confluence.example/pages/123', insertable: true, ...extra
  });
}
const proposalReply = { total: 2, roles: [{ role: 'back-end', count: 2 }], tasks: [{ title: 'A', role: 'back-end', description: 'd' }, { title: 'B', role: 'back-end', description: 'e' }] };
const docReply = { tasks: [{ number: 1, title: 'A', role: 'back-end', goal: 'g', steps: ['s1', 's2'] }] };
const generatedResult = ai.tasksResult(JSON.stringify(docReply), 'generate');
// Session storage values are created inside the vm context, so their
// prototypes differ from this realm's: compare them through JSON.
const plain = value => JSON.parse(JSON.stringify(value));
const tasksSender = { tab: { id: 7 }, frameId: 0 };
test('AI menus include all predefined and custom actions', () => {
  const h = harness(); h.menus();
  assert.deepEqual(h.created.map(item => item.id), ['md-exporter-ai', ...Object.keys(ai.ACTIONS).filter(action => action !== 'review' && action !== 'tasks').map(action => 'md-ai-' + action)]);
  assert(!Object.keys(ai.ACTIONS).includes('plantuml'));
  assert(!Object.keys(ai.ACTIONS).includes('mermaid'));
  assert(!h.created.some(item => item.id === 'md-ai-tasks'));
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
  const probe = harness();
  probe.menus();
  for (const item of probe.created.filter(entry => entry.id.startsWith('md-ai-'))) {
    const action = item.id.slice(6);
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
test('panel tasks action stores conversation, stage, pageUrl and insertable flag', async () => {
  const h = harness();
  await h.context.openAIFromPanel(7, 'tasks');
  const stored = h.session['aiJob:captured'];
  assert.equal(stored.action, 'tasks');
  assert.deepEqual(plain(stored.conversation), []);
  assert.equal(stored.stage, 'propose');
  assert.equal(stored.pageUrl, 'https://confluence.example/pages/123');
  assert.equal(stored.insertable, true);
  const delivered = h.calls.find(call => call[0] === 'tab-message');
  assert.equal(delivered[2].pageUrl, 'https://confluence.example/pages/123');
  assert.equal(delivered[2].insertable, true);
});
test('tasks propose run sends the selection as data and stores the growing history', async () => {
  const h = harness({ 'aiJob:id': tasksJob() });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const seen = [], reply = JSON.stringify({ total: 1, roles: [{ role: 'back-end', count: 1 }], tasks: [{ title: 'A', role: 'back-end', description: 'd' }] });
  h.context.MDExporterAI.chat = async (settings, messages) => { seen.push(messages); return reply; };
  const response = await h.message({ type: 'md-ai-run', id: 'id', prompt: '' }, tasksSender);
  assert.equal(response.ok, true);
  assert.equal(response.stage, 'propose');
  assert.equal(response.result.format, 'tasks');
  assert.equal(response.result.total, 1);
  assert.equal(seen[0][0].role, 'system');
  assert.deepEqual(JSON.parse(seen[0][1].content), { instruction: 'Предложи декомпозицию выделенного текста на задачи разработки.', selection: 'Превет' });
  const stored = h.session['aiJob:id'];
  assert.equal(stored.stage, 'propose');
  assert.deepEqual(plain(stored.conversation), plain([seen[0][1], { role: 'assistant', content: reply }]));
});
test('tasks iteration appends the user comment to the full stored history', async () => {
  const history = [
    { role: 'user', content: JSON.stringify({ instruction: 'Предложи декомпозицию выделенного текста на задачи разработки.', selection: 'Превет' }) },
    { role: 'assistant', content: JSON.stringify(proposalReply) }
  ];
  const h = harness({ 'aiJob:id': tasksJob({ conversation: history }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const seen = [], reply = JSON.stringify(proposalReply);
  h.context.MDExporterAI.chat = async (settings, messages) => { seen.push(messages); return reply; };
  const response = await h.message({ type: 'md-ai-run', id: 'id', prompt: 'Убери роль QA' }, tasksSender);
  assert.equal(response.ok, true);
  assert.deepEqual(plain(seen[0].slice(1)), plain([...history, { role: 'user', content: 'Убери роль QA' }]));
  assert.equal(h.session['aiJob:id'].conversation.length, 4);
  assert.equal(h.session['aiJob:id'].conversation[3].content, reply);
});
test('tasks run with malformed model JSON is rejected and the history is kept', async () => {
  const history = [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }];
  const h = harness({ 'aiJob:id': tasksJob({ conversation: history }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  h.context.MDExporterAI.chat = async () => 'not json';
  const response = await h.message({ type: 'md-ai-run', id: 'id', prompt: 'правка' }, tasksSender);
  assert.equal(response.ok, false);
  assert.match(response.error, /неверном формате/);
  assert.deepEqual(plain(h.session['aiJob:id'].conversation), history);
  assert.equal(h.session['aiJob:id'].result, undefined);
});
test('tasks iteration without a comment is rejected and the history is kept', async () => {
  const history = [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }];
  const h = harness({ 'aiJob:id': tasksJob({ conversation: history }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const response = await h.message({ type: 'md-ai-run', id: 'id', prompt: '   ' }, tasksSender);
  assert.equal(response.ok, false);
  assert.match(response.error, /изменить в декомпозиции|Создать задачи/);
  assert.deepEqual(plain(h.session['aiJob:id'].conversation), history);
});
test('tasks generate flag switches the job to the generation stage with the page URL', async () => {
  const history = [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'Декомпозиция v2' }];
  const h = harness({ 'aiJob:id': tasksJob({ conversation: history }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const seen = [], reply = JSON.stringify(docReply);
  h.context.MDExporterAI.chat = async (settings, messages) => { seen.push(messages); return reply; };
  const response = await h.message({ type: 'md-ai-run', id: 'id', stage: 'generate', prompt: '' }, tasksSender);
  assert.equal(response.ok, true);
  assert.equal(response.stage, 'generate');
  assert.equal(response.result.format, 'tasks');
  assert.match(seen[0][0].content, /Ссылка на документацию, которую система подставит в каждую задачу: https:\/\/confluence\.example\/pages\/123/);
  assert.match(seen[0][0].content, /"steps"/);
  assert.deepEqual(plain(seen[0].slice(1, -1)), history);
  assert.match(seen[0][seen[0].length - 1].content, /согласована/);
  const stored = h.session['aiJob:id'];
  assert.equal(stored.stage, 'generate');
  assert.equal(stored.conversation.length, 4);
  assert.equal(stored.result.tasks.length, 1);
  assert.equal(stored.conversation[3].content, reply);
});
test('tasks results are never applied over the document', async () => {
  const h = harness({ 'aiJob:id': tasksJob({ readOnly: false, result: generatedResult }) });
  const response = await h.message({ type: 'md-ai-apply', id: 'id' }, tasksSender);
  assert.equal(response.ok, false);
  assert.match(response.error, /не предназначены для замены/);
  assert.equal(h.calls.filter(call => call[0] === 'script').length, 0);
  assert.equal(h.session['aiJob:id'].result, generatedResult);
});
test('tasks chapter is inserted into the editor as a validated rich document', async () => {
  const h = harness({ 'aiJob:id': tasksJob({ stage: 'generate', result: generatedResult }) });
  const response = await h.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(response.ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[0], 'insertChapter');
  assert.equal(execution.args[1][0], 'id');
  assert.equal(execution.target.frameIds[0], 2);
  assert.equal(execution.world, 'MAIN');
  const chapter = execution.args[1][1];
  assert.equal(chapter.type, 'doc');
  const rich = require('../lib/ai-rich-text');
  assert.match(rich.text(chapter), /Задачи на разработку/);
  assert.match(rich.text(chapter), /confluence\.example\/pages\/123/);
  assert.equal(chapter.content[1].type, 'heading');
  assert.equal(chapter.content[1].content[0].text, 'Задача 1. A');
});
test('tasks chapter insert requires the generate stage and an editable page', async () => {
  const early = harness({ 'aiJob:id': tasksJob() });
  const before = await early.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(before.ok, false);
  assert.match(before.error, /Создать задачи/);
  assert.equal(early.calls.filter(call => call[0] === 'script').length, 0);

  const readOnlyPage = harness({ 'aiJob:id': tasksJob({ stage: 'generate', result: generatedResult, insertable: false }) });
  const rejected = await readOnlyPage.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /недоступна для редактирования/);
  assert.equal(readOnlyPage.calls.filter(call => call[0] === 'script').length, 0);
  assert.equal(readOnlyPage.session['aiJob:id'].result, generatedResult);
});
const reviewResult = ai.reviewResult(JSON.stringify({
  score: 65, summary: 'Есть пробелы в критериях приёмки.',
  recommendations: [{ category: 'критерии приёмки', severity: 'major', problem: 'Добавьте измеримые критерии.', evidence: 'Система должна работать быстро.', fix: 'Опишите критерии в разделе 3.' }]
}));
function reviewJob(extra = {}) {
  return job({
    action: 'review', uiFrameId: 0, readOnly: false,
    pageUrl: 'https://confluence.example/pages/123', insertable: true, ...extra
  });
}
test('panel review action stores pageUrl and the insertable flag', async () => {
  const h = harness();
  await h.context.openAIFromPanel(7, 'review');
  const stored = h.session['aiJob:captured'];
  assert.equal(stored.action, 'review');
  assert.equal(stored.pageUrl, 'https://confluence.example/pages/123');
  assert.equal(stored.insertable, true);
  const delivered = h.calls.find(call => call[0] === 'tab-message');
  assert.equal(delivered[2].pageUrl, 'https://confluence.example/pages/123');
  assert.equal(delivered[2].insertable, true);
});
test('review report is inserted into the editor as a validated rich document', async () => {
  const h = harness({ 'aiJob:id': reviewJob({ result: reviewResult }) });
  const response = await h.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(response.ok, true);
  const execution = h.calls.find(call => call[0] === 'script')[1];
  assert.equal(execution.args[0], 'insertChapter');
  assert.equal(execution.args[1][0], 'id');
  assert.equal(execution.target.frameIds[0], 2);
  assert.equal(execution.world, 'MAIN');
  const chapter = execution.args[1][1];
  assert.equal(chapter.type, 'doc');
  const rich = require('../lib/ai-rich-text');
  assert.match(rich.text(chapter), /Проверка качества документации/);
  assert.match(rich.text(chapter), /Готовность к разработке: 65%/);
  assert.equal(chapter.content[2].type, 'heading');
  assert.equal(chapter.content[2].content[0].text, '1. [критерии приёмки · major]');
});
test('review report insert requires a finished analysis, an editable page and a review job', async () => {
  const early = harness({ 'aiJob:id': reviewJob() });
  const before = await early.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(before.ok, false);
  assert.match(before.error, /Проверить документ/);
  assert.equal(early.calls.filter(call => call[0] === 'script').length, 0);

  const readOnlyPage = harness({ 'aiJob:id': reviewJob({ result: reviewResult, insertable: false }) });
  const rejected = await readOnlyPage.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /недоступна для редактирования/);
  assert.equal(readOnlyPage.calls.filter(call => call[0] === 'script').length, 0);
  assert.equal(readOnlyPage.session['aiJob:id'].result, reviewResult);

  const other = harness({ 'aiJob:id': job({ uiFrameId: 0, result: 'text' }) });
  const denied = await other.message({ type: 'md-ai-insert', id: 'id' }, tasksSender);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /задач на разработку и проверки качества/);
  assert.equal(other.calls.filter(call => call[0] === 'script').length, 0);
});
test('tasks jobs live for an hour while point edits live for ten minutes', async () => {
  const h = harness({ 'aiJob:id': tasksJob({ created: Date.now() - 30 * 60 * 1000 }) });
  h.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  h.context.MDExporterAI.chat = async () => JSON.stringify({ total: 1, roles: [], tasks: [{ title: 'A', role: 'r', description: 'd' }] });
  assert.equal((await h.message({ type: 'md-ai-run', id: 'id', prompt: '' }, tasksSender)).ok, true);

  const stale = harness({ 'aiJob:id': tasksJob({ created: Date.now() - 61 * 60 * 1000 }) });
  stale.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const rejected = await stale.message({ type: 'md-ai-run', id: 'id', prompt: '' }, tasksSender);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /устарел/);

  const oldEdit = harness({ 'aiJob:id': job({ created: Date.now() - 11 * 60 * 1000 }) });
  oldEdit.local[ai.KEY] = { baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'model' };
  const expired = await oldEdit.message({ type: 'md-ai-run', id: 'id' });
  assert.equal(expired.ok, false);
  assert.match(expired.error, /устарел/);
});
test('cleanup alarm removes expired jobs but keeps fresh tasks jobs', async () => {
  const h = harness({
    'aiJob:old': job({ created: Date.now() - 11 * 60 * 1000 }),
    'aiJob:old-tasks': tasksJob({ created: Date.now() - 61 * 60 * 1000 }),
    'aiJob:fresh-tasks': tasksJob({ created: Date.now() - 30 * 60 * 1000 })
  });
  await h.cleanup();
  assert.equal(h.session['aiJob:old'], undefined);
  assert.equal(h.session['aiJob:old-tasks'], undefined);
  assert.ok(h.session['aiJob:fresh-tasks']);
});
