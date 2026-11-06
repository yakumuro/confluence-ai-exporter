'use strict';
importScripts('lib/ai-rich-text.js', 'lib/ai-client.js', 'lib/ai-shortcuts.js', 'lib/ai-scenarios.js');
const AI_COMMANDS = {
  review: 'Проверить полноту требований…',
  spelling: 'Исправить орфографию и пунктуацию', json: 'Изменить или дополнить JSON/XML…',
  diagram: 'Исправить PlantUML/Mermaid…',
  custom: 'Свободная инструкция…', format: 'Изменить оформление текста…', table: 'Изменить выделенные ячейки таблицы…'
};
function showBadge(tabId, text, color) {
  if (tabId == null) return;
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color });
    chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 4000);
  } catch (_) { /* Tab was closed. */ }
}
function createAIMenus() {
  chrome.contextMenus.create({ id: 'md-exporter-ai', title: 'AI: обработать выделение', contexts: ['selection', 'editable'] }, () => void chrome.runtime.lastError);
  for (const [action, title] of Object.entries(AI_COMMANDS)) chrome.contextMenus.create({ id: 'md-ai-' + action, parentId: 'md-exporter-ai', title, contexts: ['selection', 'editable'] }, () => void chrome.runtime.lastError);
}
async function inEditor(tabId, frameId, operation, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] }, world: 'MAIN', args: [operation, args],
    func: (op, values) => {
      try { return { ok: true, value: window.MDExporterAISelection[op](...values) }; }
      catch (error) { return { ok: false, error: error.message }; }
    }
  });
  const result = results[0] && results[0].result;
  if (!result || !result.ok) throw new Error(result ? result.error : 'Редактор недоступен.');
  return result.value;
}
async function scenariosForUI() {
  const stored = (await chrome.storage.local.get(MDExporterAIScenarios.KEY))[MDExporterAIScenarios.KEY];
  return { presets: MDExporterAIScenarios.PRESETS, custom: MDExporterAIScenarios.sanitize(stored) };
}
function aiUIFiles(action) {
  return ['lib/ai-rich-text.js', 'lib/ai-preview.js', ...(action === 'diagram' ? ['lib/mermaid.min.js'] : []), 'content/ai-ui.js'];
}
async function showAIDialog(tabId, action, snapshot, error) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: aiUIFiles(action) });
    let scenarios = { presets: MDExporterAIScenarios.PRESETS, custom: [] };
    try { scenarios = await scenariosForUI(); } catch (_) { /* Dialog remains usable without saved scenarios. */ }
    await chrome.tabs.sendMessage(tabId, {
      type: 'md-ai-open', action, snapshot, error,
      shortcut: MDExporterAIShortcuts.label(action), scenarios
    }, { frameId: 0 });
  } catch (failure) {
    showBadge(tabId, '!', '#de350b');
    throw failure;
  }
}
async function openAI(tabId, frameId, action) {
  const target = { tabId, frameIds: [frameId] };
  let snapshot, error;
  try {
    await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['lib/ai-rich-text.js', 'content/ai-selection.js'] });
    snapshot = await inEditor(tabId, frameId, 'capture', [action]);
    await chrome.storage.session.set({ ['aiJob:' + snapshot.id]: { tabId, frameId, uiFrameId: 0, action, source: snapshot.source, readOnly: !!snapshot.readOnly, created: Date.now() } });
  } catch (failure) { error = failure.message; }
  await showAIDialog(tabId, action, snapshot, error);
}
async function openAIFromPanel(tabId, action) {
  let snapshot, error;
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', files: ['lib/ai-rich-text.js', 'content/ai-selection.js'] });
    const captures = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true }, world: 'MAIN', args: [action],
      func: requestedAction => {
        try {
          return { ok: true, value: window.MDExporterAISelection.capture(requestedAction) };
        } catch (failure) { return { ok: false, error: failure.message }; }
      }
    });
    const captured = captures.find(item => item.result && item.result.ok);
    if (!captured) {
      const failure = captures.find(item => item.result && item.result.error);
      throw new Error(failure ? failure.result.error : 'Выделите текст в редакторе Confluence.');
    }
    snapshot = captured.result.value;
    await chrome.storage.session.set({ ['aiJob:' + snapshot.id]: { tabId, frameId: captured.frameId, uiFrameId: 0, action, source: snapshot.source, readOnly: !!snapshot.readOnly, created: Date.now() } });
  } catch (failure) { error = failure.message; }
  await showAIDialog(tabId, action, snapshot, error);
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!String(info.menuItemId).startsWith('md-ai-') || !tab || tab.id == null) return;
  const action = info.menuItemId.slice(6);
  if (!AI_COMMANDS[action]) return;
  await openAI(tab.id, info.frameId || 0, action);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message && message.type === 'md-ai-save-scenario' && sender.tab) {
    (async () => {
      const name = typeof message.name === 'string' ? message.name.trim() : '';
      const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
      if (!name || name.length > MDExporterAIScenarios.MAX_NAME_LENGTH) throw new Error('Название сценария должно содержать от 1 до 64 символов.');
      if (!prompt || prompt.length > MDExporterAIScenarios.MAX_PROMPT_LENGTH) throw new Error('Инструкция должна содержать от 1 до 4000 символов.');
      const key = MDExporterAIScenarios.KEY;
      const stored = (await chrome.storage.local.get(key))[key];
      const saved = MDExporterAIScenarios.sanitize(stored);
      const requestedId = typeof message.scenarioId === 'string' ? message.scenarioId : '';
      let index = saved.findIndex(item => item.id === requestedId);
      if (index < 0) index = saved.findIndex(item => item.prompt === prompt);
      const existing = index >= 0 ? saved[index] : null;
      if (existing && saved.some((item, i) => i !== index && item.prompt === prompt)) {
        throw new Error('Другой сценарий уже использует эту инструкцию.');
      }
      const scenario = existing
        ? { ...existing, name, prompt }
        : {
          id: 'scenario-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
          name,
          prompt
        };
      if (!existing) {
        if (saved.length >= MDExporterAIScenarios.MAX_SCENARIOS) throw new Error('Достигнут лимит сохраненных сценариев.');
        saved.push(scenario);
      } else saved[index] = scenario;
      await chrome.storage.local.set({ [key]: saved });
      return { ok: true, scenario, created: !existing, updated: !!existing, scenarios: { presets: MDExporterAIScenarios.PRESETS, custom: saved } };
    })().then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message && message.type === 'md-ai-shortcut' && sender.tab && sender.tab.id != null && AI_COMMANDS[message.action]) {
    openAI(sender.tab.id, sender.frameId ?? 0, message.action)
      .then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message && message.type === 'MD_EXPORT_PERSIST_JOB' && sender.tab && message.job && typeof message.job === 'object') {
    chrome.storage.local.set({ ['job:' + sender.tab.id]: message.job }).then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  }
  if (!message || !['md-ai-run', 'md-ai-apply', 'md-ai-close'].includes(message.type) || !sender.tab) return;
  (async () => {
    const key = 'aiJob:' + message.id;
    const job = (await chrome.storage.session.get(key))[key];
    if (!job || job.tabId !== sender.tab.id || (job.uiFrameId ?? job.frameId) !== sender.frameId || Date.now() - job.created > 600000) throw new Error('Запрос устарел. Выделите фрагмент заново.');
    if (message.type === 'md-ai-close') {
      await chrome.storage.session.remove(key);
      await inEditor(job.tabId, job.frameId, 'discard', [message.id]);
      return { ok: true };
    }
    if (message.type === 'md-ai-apply') {
      if (job.readOnly) throw new Error('Этот фрагмент доступен только для анализа и копирования результата.');
      if (job.action === 'review') throw new Error('Анализ требований не предназначен для замены текста.');
      if (job.result == null) throw new Error('Результат еще не получен.');
      const mode = message.mode === undefined ? 'replace' : message.mode;
      if (!['replace', 'after'].includes(mode) || (job.action === 'table' && mode !== 'replace')) throw new Error('Неизвестный способ вставки результата.');
      await inEditor(job.tabId, job.frameId, 'apply', [message.id, job.result, mode]);
      await chrome.storage.session.remove(key);
      return { ok: true };
    }
    const settings = (await chrome.storage.local.get(MDExporterAI.KEY))[MDExporterAI.KEY];
    if (!settings) throw new Error('Откройте расширение → Настройки AI и сохраните ключ, адрес API и модель.');
    const cfg = MDExporterAI.config(settings);
    const origin = MDExporterAI.originPattern(cfg.baseUrl);
    if (!(await chrome.permissions.contains({ origins: [origin] }))) throw new Error('Нет доступа к AI-провайдеру. Сохраните настройки AI повторно.');
    const result = await MDExporterAI.transform(settings, job.action, job.source, message.prompt || '');
    // A cancelled dialog must not resurrect its job.
    if (!(await chrome.storage.session.get(key))[key]) throw new Error('Запрос отменен.');
    await chrome.storage.session.set({ [key]: { ...job, result } });
    return { ok: true, result };
  })().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
// Do not expose local credentials to isolated-world content scripts.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.alarms.create('md-ai-cleanup', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'md-ai-cleanup') return;
  const entries = await chrome.storage.session.get(null);
  const expired = Object.keys(entries).filter(key => key.startsWith('aiJob:') && Date.now() - entries[key].created > 600000);
  if (expired.length) await chrome.storage.session.remove(expired);
});
