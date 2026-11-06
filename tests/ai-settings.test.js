'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ai = require('../lib/ai-client');
const scenariosApi = require('../lib/ai-scenarios');
async function settingsPage(stored, grant = true, savedScenarios = []) {
  function element() {
    return {
      value: '', textContent: '', options: [], children: [], disabled: false,
      replaceChildren() { this.options = []; this.children = []; this.value = ''; },
      appendChild(node) {
        this.children.push(node);
        if (Array.isArray(this.options) && 'value' in node) { this.options.push(node); if (!this.value) this.value = node.value; }
        return node;
      },
      append(...nodes) { nodes.forEach(node => this.appendChild(node)); },
      focus() { this.focused = true; },
      showModal() { this.open = true; },
      close() { this.open = false; }
    };
  }
  const elements = Object.fromEntries(['apiKey', 'config', 'model', 'status', 'loadModels', 'save', 'remove', 'aiForm', 'scenarioList', 'scenarioEditor', 'scenarioName', 'scenarioPrompt', 'scenarioEditorStatus', 'saveScenarioChanges', 'cancelScenarioEdit'].map(id => [id, element()]));
  const local = { [scenariosApi.KEY]: savedScenarios };
  if (stored) local[ai.KEY] = stored;
  const permissions = [];
  const confirmations = [];
  let discover;
  const context = {
    URL, console,
    window: { confirm: message => { confirmations.push(message); return true; } },
    MDExporterAI: { ...ai, models: async cfg => { discover = cfg; return ['model-a', 'model-b']; } },
    MDExporterAIScenarios: scenariosApi,
    document: { getElementById: id => elements[id], querySelectorAll: () => Object.values(elements), createElement: () => element() },
    chrome: {
      storage: { local: {
        get: async keys => Array.isArray(keys) ? Object.fromEntries(keys.filter(key => key in local).map(key => [key, local[key]])) : keys === null ? { ...local } : { [keys]: local[keys] },
        set: async data => Object.assign(local, data), remove: async key => { delete local[key]; }, setAccessLevel: async () => {}
      } },
      permissions: { request: async request => { permissions.push(request); return grant; } }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../popup/ai-settings'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, local, permissions, confirmations, discovered: () => discover };
}
test('settings restore the local key and selected model', async () => {
  const page = await settingsPage({ baseUrl: 'https://example.test/v1', model: 'model-b', apiKey: 'secret' });
  assert.equal(page.elements.apiKey.value, 'secret');
  assert.equal(page.elements.model.value, 'model-b');
  assert.equal(page.elements.loadModels.disabled, false);
});
test('model discovery uses entered token and selected model updates JSON', async () => {
  const page = await settingsPage(); const el = page.elements;
  el.apiKey.value = 'new-key';
  el.config.value = JSON.stringify({ baseUrl: 'http://localhost:11434/v1', model: '' });
  await el.loadModels.onclick();
  assert.equal(page.discovered().apiKey, 'new-key');
  assert.equal(page.permissions[0].origins[0], 'http://localhost/*');
  assert.equal(el.model.options.length, 2);
  el.model.value = 'model-b'; el.model.onchange();
  assert.equal(JSON.parse(el.config.value).model, 'model-b');
  await el.aiForm.onsubmit({ preventDefault() {} });
  assert.equal(page.local[ai.KEY].model, 'model-b');
  assert.equal(page.local[ai.KEY].apiKey, 'new-key');
});
test('manual model from JSON is saved without requiring discovery', async () => {
  const page = await settingsPage();
  page.elements.apiKey.value = 'key';
  page.elements.config.value = JSON.stringify({ baseUrl: 'https://example.test/v1', model: 'manual-model' });
  await page.elements.aiForm.onsubmit({ preventDefault() {} });
  assert.equal(page.local[ai.KEY].model, 'manual-model');
  assert.equal(page.discovered(), undefined);
});
test('denied host permission and invalid JSON do not overwrite settings', async () => {
  const page = await settingsPage(undefined, false);
  page.elements.apiKey.value = 'key';
  page.elements.config.value = JSON.stringify({ baseUrl: 'https://example.test/v1', model: 'model' });
  await page.elements.aiForm.onsubmit({ preventDefault() {} });
  assert.equal(page.local[ai.KEY], undefined);
  assert.match(page.elements.status.textContent, /не разрешен/);
  page.elements.config.value = '{invalid';
  await page.elements.loadModels.onclick();
  assert.equal(page.discovered(), undefined);
});
test('deleting settings clears persistent credentials and visible key', async () => {
  const page = await settingsPage({ baseUrl: 'https://example.test/v1', model: 'model', apiKey: 'secret' });
  await page.elements.remove.onclick();
  assert.equal(page.local[ai.KEY], undefined); assert.equal(page.elements.apiKey.value, '');
});
test('scenario settings show compact rows, edit in a dialog and confirm deletion', async () => {
  const saved = [
    { id: 'scenario-1', name: 'Сократить', prompt: 'Сократи, сохранив смысл' },
    { id: 'scenario-2', name: 'Саммари', prompt: 'Подготовь саммари' }
  ];
  const page = await settingsPage({ baseUrl: 'https://example.test/v1', model: 'model', apiKey: 'secret' }, true, saved);
  assert.equal(page.elements.scenarioList.children.length, 2);
  const row = page.elements.scenarioList.children[0];
  const actions = row.children[1];
  assert.equal(row.children[0].textContent, 'Сократить');
  await actions.children[0].onclick();
  assert.equal(page.elements.scenarioEditor.open, true);
  assert.equal(page.elements.scenarioName.value, 'Сократить');
  page.elements.scenarioName.value = 'Сократить текст';
  page.elements.scenarioPrompt.value = 'Сократи, сохранив смысл и факты';
  await page.elements.saveScenarioChanges.onclick();
  assert.equal(page.local[scenariosApi.KEY][0].name, 'Сократить текст');
  assert.equal(page.local[scenariosApi.KEY][0].prompt, 'Сократи, сохранив смысл и факты');
  assert.equal(page.elements.scenarioEditor.open, false);
  const removeSecond = page.elements.scenarioList.children[1].children[1].children[1];
  await removeSecond.onclick();
  assert.equal(page.confirmations.length, 1);
  assert.match(page.confirmations[0], /Удалить сценарий «Саммари»/);
  assert.deepEqual(page.local[scenariosApi.KEY].map(item => item.id), ['scenario-1']);
  assert.equal(page.local[ai.KEY].apiKey, 'secret');
});
