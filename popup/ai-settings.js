(function () {
  'use strict';
  const api = MDExporterAI;
  const scenariosApi = MDExporterAIScenarios;
  const key = document.getElementById('apiKey');
  const config = document.getElementById('config');
  const model = document.getElementById('model');
  const status = document.getElementById('status');
  const load = document.getElementById('loadModels');
  const scenarioList = document.getElementById('scenarioList');
  const scenarioEditor = document.getElementById('scenarioEditor');
  const scenarioEditorName = document.getElementById('scenarioName');
  const scenarioEditorPrompt = document.getElementById('scenarioPrompt');
  const scenarioEditorStatus = document.getElementById('scenarioEditorStatus');
  const scenarioEditorSave = document.getElementById('saveScenarioChanges');
  const scenarioEditorCancel = document.getElementById('cancelScenarioEdit');
  let busy = false;
  let savedScenarios = [];
  let editingScenarioId = null;
  function read() { return { ...api.config(JSON.parse(config.value)), apiKey: key.value.trim() }; }
  function options(ids, selected) {
    model.replaceChildren();
    for (const id of [...new Set([selected, ...ids].filter(Boolean))]) {
      const option = document.createElement('option'); option.value = id; option.textContent = id; model.appendChild(option);
    }
    if (selected) model.value = selected;
  }
  async function permission(cfg) {
    const granted = await chrome.permissions.request({ origins: [api.originPattern(cfg.baseUrl)] });
    if (!granted) throw new Error('Доступ к адресу AI-провайдера не разрешен.');
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll('input, textarea, select, button')) control.disabled = value;
  }
  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status' + (type ? ' ' + type : '');
  }
  function showError(error) { showStatus(error.message, 'error'); }
  const toggleKey = document.getElementById('toggleKey');
  if (toggleKey) toggleKey.onclick = () => {
    const visible = key.type === 'text';
    key.type = visible ? 'password' : 'text';
    toggleKey.setAttribute('aria-label', visible ? 'Показать API-ключ' : 'Скрыть API-ключ');
  };
  function openScenarioEditor(scenario) {
    editingScenarioId = scenario.id;
    scenarioEditorName.value = scenario.name;
    scenarioEditorPrompt.value = scenario.prompt;
    scenarioEditorStatus.textContent = '';
    scenarioEditor.showModal();
    scenarioEditorName.focus();
  }
  function renderScenarios(values) {
    savedScenarios = scenariosApi.sanitize(values);
    scenarioList.replaceChildren();
    if (!savedScenarios.length) {
      const empty = document.createElement('p');
      empty.className = 'scenario-empty'; empty.textContent = 'Сохраненных сценариев пока нет.';
      scenarioList.appendChild(empty);
      return;
    }
    for (const scenario of savedScenarios) {
      const row = document.createElement('div'); row.className = 'scenario-row';
      const name = document.createElement('span'); name.textContent = scenario.name; name.className = 'scenario-name';
      const actions = document.createElement('div'); actions.className = 'scenario-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Редактировать'; edit.className = 'scenario-edit';
      edit.onclick = () => openScenarioEditor(scenario);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить'; remove.className = 'scenario-delete';
      remove.onclick = async () => {
        if (!window.confirm('Удалить сценарий «' + scenario.name + '»?')) return;
        remove.disabled = true;
        try {
          const next = savedScenarios.filter(item => item.id !== scenario.id);
          await chrome.storage.local.set({ [scenariosApi.KEY]: next });
          renderScenarios(next);
          status.textContent = 'Сценарий удален.';
        } catch (error) { showError(error); remove.disabled = false; }
      };
      actions.append(edit, remove); row.append(name, actions); scenarioList.appendChild(row);
    }
  }
  scenarioEditorCancel.onclick = () => scenarioEditor.close();
  scenarioEditorSave.onclick = async () => {
    const name = scenarioEditorName.value.trim(), prompt = scenarioEditorPrompt.value.trim();
    if (!name || name.length > scenariosApi.MAX_NAME_LENGTH) {
      scenarioEditorStatus.textContent = 'Название должно содержать от 1 до 64 символов.';
      return;
    }
    if (!prompt || prompt.length > scenariosApi.MAX_PROMPT_LENGTH) {
      scenarioEditorStatus.textContent = 'Инструкция должна содержать от 1 до 4000 символов.';
      return;
    }
    const next = savedScenarios.map(item => item.id === editingScenarioId ? { ...item, name, prompt } : item);
    const clean = scenariosApi.sanitize(next);
    if (clean.length !== next.length) {
      scenarioEditorStatus.textContent = 'Другой сценарий уже использует эту инструкцию.';
      return;
    }
    scenarioEditorSave.disabled = true;
    try {
      await chrome.storage.local.set({ [scenariosApi.KEY]: clean });
      renderScenarios(clean);
      scenarioEditor.close();
      status.textContent = 'Сценарий обновлен.';
    } catch (error) { scenarioEditorStatus.textContent = error.message; }
    finally { scenarioEditorSave.disabled = false; }
  };
  model.onchange = () => {
    try { const cfg = read(); config.value = JSON.stringify({ baseUrl: cfg.baseUrl, model: model.value }, null, 2); }
    catch (error) { showError(error); }
  };
  load.onclick = async () => {
    if (busy) return;
    try {
      const cfg = read();
      // Request host access directly from a user gesture, before any awaited work.
      const allowed = permission(cfg);
      setBusy(true); status.textContent = 'Получение списка моделей…';
      await allowed;
      const ids = await api.models(cfg);
      if (!ids.length) throw new Error('Провайдер вернул пустой список моделей.');
      const selected = ids.includes(cfg.model) ? cfg.model : ids[0];
      options(ids, selected);
      config.value = JSON.stringify({ baseUrl: cfg.baseUrl, model: selected }, null, 2);
      status.textContent = 'Выберите основную модель и нажмите «Сохранить».';
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };
  document.getElementById('aiForm').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    try {
      const cfg = read();
      if (!cfg.apiKey || !cfg.model) throw new Error('Укажите API-ключ и основную модель.');
      const allowed = permission(cfg);
      setBusy(true); await allowed;
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await chrome.storage.local.set({ [api.KEY]: cfg });
      options(Array.from(model.options).map(option => option.value), cfg.model);
      status.textContent = 'Настройки AI сохранены.';
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };
  document.getElementById('remove').onclick = async () => {
    try {
      await chrome.storage.local.remove(api.KEY); key.value = '';
      config.value = JSON.stringify({ baseUrl: 'https://api.openai.com/v1', model: '' }, null, 2);
      options([], ''); status.textContent = 'Настройки и ключ удалены.';
    } catch (error) { showError(error); }
  };
  setBusy(true);
  chrome.storage.local.get([api.KEY, scenariosApi.KEY]).then(data => {
    const cfg = data[api.KEY] || { baseUrl: 'https://api.openai.com/v1', model: '' };
    key.value = cfg.apiKey || '';
    config.value = JSON.stringify({ baseUrl: cfg.baseUrl, model: cfg.model }, null, 2);
    options([], cfg.model);
    renderScenarios(data[scenariosApi.KEY]);
  }).catch(showError).finally(() => setBusy(false));
})();
