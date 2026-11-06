(function (root) {
  'use strict';
  const KEY = 'mdExporterAIScenarios';
  const MAX_SCENARIOS = 100;
  const MAX_NAME_LENGTH = 64;
  const MAX_PROMPT_LENGTH = 4000;
  const PRESETS = Object.freeze([
    Object.freeze({ id: 'shorten', name: 'Сократить, сохранив смысл', prompt: 'Сократи текст, сохранив его смысл, факты, ограничения и важные детали.' }),
    Object.freeze({ id: 'summary', name: 'Краткое саммари', prompt: 'Подготовь краткое саммари: выдели основную мысль и ключевые выводы, сохрани важные факты.' }),
    Object.freeze({ id: 'business', name: 'Простой деловой язык', prompt: 'Перепиши текст понятным деловым языком для бизнеса и обычного пользователя. Сохрани смысл, факты и ограничения.' }),
    Object.freeze({ id: 'logical-table', name: 'Преобразовать в логическую таблицу', prompt: 'Преобразуй информацию в логическую таблицу. Сохрани существенные факты и связи между ними, подбери понятные заголовки столбцов.' })
  ]);
  function sanitize(values) {
    if (!Array.isArray(values)) return [];
    const ids = new Set();
    const prompts = new Set();
    const result = [];
    for (const value of values) {
      if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim()
        || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > MAX_PROMPT_LENGTH) continue;
      const prompt = value.prompt.trim();
      const id = value.id.trim();
      if (ids.has(id) || prompts.has(prompt) || result.length >= MAX_SCENARIOS) continue;
      ids.add(id);
      prompts.add(prompt);
      const flat = prompt.replace(/\s+/g, ' ');
      const name = typeof value.name === 'string' && value.name.trim()
        ? value.name.trim().slice(0, MAX_NAME_LENGTH)
        : flat.slice(0, 61) + (flat.length > 61 ? '…' : '');
      result.push({ id, name, prompt });
    }
    return result;
  }
  function title(prompt) {
    const flat = String(prompt || '').trim().replace(/\s+/g, ' ');
    return flat.slice(0, 61) + (flat.length > 61 ? '…' : '');
  }
  const api = { KEY, MAX_SCENARIOS, MAX_NAME_LENGTH, MAX_PROMPT_LENGTH, PRESETS, sanitize, title };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDExporterAIScenarios = api;
})(globalThis);
