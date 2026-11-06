'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../lib/ai-client');
const settings = { baseUrl: 'https://example.test/v1/', apiKey: 'test-secret', model: 'chat-model' };
const reply = content => async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));

test('AI config accepts HTTPS and local HTTP, rejects unsafe URLs', () => {
  assert.equal(ai.config(settings).baseUrl, 'https://example.test/v1');
  assert.equal(ai.config({ baseUrl: 'http://localhost:11434/v1' }).baseUrl, 'http://localhost:11434/v1');
  assert.equal(ai.originPattern('http://localhost:11434/v1'), 'http://localhost/*');
  for (const baseUrl of ['http://example.test', 'https://user:password@example.test', 'https://example.test/?apiKey=secret', 'file:///tmp']) assert.throws(() => ai.config({ baseUrl }));
  assert.throws(() => ai.config([]));
});
test('lists and deduplicates models with Bearer auth, no cookies or redirects', async () => {
  const models = await ai.models(settings, async (url, options) => {
    assert.equal(url, 'https://example.test/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, {}] }));
  });
  assert.deepEqual(models, ['a', 'b']);
});
test('model discovery rejects incompatible responses', async () => {
  await assert.rejects(ai.models(settings, async () => new Response('{}')), /список моделей/);
});
test('sends only selected text and instruction as data with the configured model', async () => {
  const result = await ai.transform(settings, 'spelling', 'Превет', '', async (url, options) => {
    assert.equal(url, 'https://example.test/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'chat-model'); assert.equal(body.stream, false);
    assert.match(body.messages[0].content, /орфографию/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { instruction: '', selection: 'Превет' });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Привет' }, finish_reason: 'stop' }] }));
  });
  assert.equal(result, 'Привет');
});
test('the combined diagram action identifies either supported format and returns corrected code', async () => {
  for (const source of ['@startuml\nA -> B\n@enduml', 'graph TD\nA-->B']) {
    assert.equal(await ai.transform(settings, 'diagram', source, '', reply('```text\nfixed code\n```')), 'fixed code');
  }
  assert.equal(await ai.transform(settings, 'custom', 'code', 'исправь', reply('```text\nfixed code\n```')), 'fixed code');
});
test('combined diagram prompt asks the model to detect PlantUML or Mermaid', async () => {
  await ai.transform(settings, 'diagram', 'graph TD\nA-->B', '', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.messages[0].content, /PlantUML или Mermaid/);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'graph TD\nA-->B' } }] }));
  });
});
test('JSON action validates complete JSON after stripping outer fences', async () => {
  assert.equal(await ai.transform(settings, 'json', '{a:1}', '', reply('```json\n{"a":1}\n```')), '{"a":1}');
  await assert.rejects(ai.transform(settings, 'json', '{}', '', reply('invalid')));
});
test('JSON/XML action detects and validates the original structured format', async () => {
  const xmlSource = '<?xml version="1.0"?><root><item id="1">old</item></root>';
  const xmlResult = '<?xml version="1.0"?><root><item id="1">new</item></root>';
  assert.equal(ai.structuredFormat(xmlSource), 'xml');
  assert.equal(ai.structuredFormat('{"root":[]}'), 'json');
  assert(ai.isWellFormedXml(xmlResult));
  assert(!ai.isWellFormedXml('<root><item></root>'));
  assert.equal(await ai.transform(settings, 'json', xmlSource, 'измени значение item', reply(xmlResult)), xmlResult);
  await assert.rejects(ai.transform(settings, 'json', xmlSource, '', reply('{"root":[]}')), /некорректный XML/);
  assert.equal(await ai.transform(settings, 'json', '{"root":[]}', 'добавь элемент', reply('{"root":[1]}')), '{"root":[1]}');
});
test('requirements review returns a normalized score and actionable recommendations', async () => {
  const response = {
    score: 67.6,
    summary: 'Основной сценарий описан, но не хватает критериев приёмки.',
    recommendations: [
      { category: 'Критерии приёмки', severity: 'major', problem: 'Нет измеримых критериев приёмки.', evidence: 'Система должна быстро сохранять документ.', fix: 'Добавьте измеримые критерии приёмки.' },
      { category: 'Граничные случаи', severity: 'blocker', problem: 'Не описано поведение при недоступности сервиса.', evidence: 'При сбое сервиса…', fix: 'Опишите поведение при недоступности сервиса.' },
      { category: 'Терминология', severity: 'minor', problem: 'Термин «документ» используется в двух значениях.', evidence: 'Документ пользователя…', fix: 'Введите отдельные термины.' }
    ]
  };
  const result = await ai.transform(settings, 'review', 'Система должна сохранять документ.', '', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.messages[0].content, /атомарность/);
    assert.match(body.messages[0].content, /тестируемость/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { instruction: '', selection: 'Система должна сохранять документ.' });
    return reply(JSON.stringify(response))();
  });
  assert.deepEqual(result, {
    format: 'review', score: 68, summary: response.summary,
    recommendations: [
      { category: 'граничные случаи', severity: 'blocker', problem: response.recommendations[1].problem, evidence: response.recommendations[1].evidence, fix: response.recommendations[1].fix, impact: 30 },
      { category: 'критерии приёмки', severity: 'major', problem: response.recommendations[0].problem, evidence: response.recommendations[0].evidence, fix: response.recommendations[0].fix, impact: 15 },
      { category: 'терминология', severity: 'minor', problem: response.recommendations[2].problem, evidence: response.recommendations[2].evidence, fix: response.recommendations[2].fix, impact: 5 }
    ]
  });
});
test('requirements review accepts fenced JSON and rejects incomplete analysis', async () => {
  const valid = { score: 85, summary: 'Документ почти готов.', recommendations: [{ category: 'полнота', severity: 'minor', problem: 'Уточните ограничения.', evidence: 'Система работает быстро.', fix: 'Добавьте ограничения по времени отклика.' }] };
  const fenced = await ai.transform(settings, 'review', 'Требование', '', reply('```json\n' + JSON.stringify(valid) + '\n```'));
  assert.equal(fenced.format, 'review');
  assert.equal(fenced.score, 85);
  for (const response of [
    'not json',
    JSON.stringify({ ...valid, score: '85' }),
    JSON.stringify({ ...valid, score: -1 }),
    JSON.stringify({ ...valid, score: 101 }),
    JSON.stringify({ ...valid, summary: '' }),
    JSON.stringify({ ...valid, recommendations: [] }),
    JSON.stringify({ ...valid, recommendations: [{ category: 'полнота', severity: 'minor', problem: '', evidence: 'цитата', fix: 'исправление' }] }),
    JSON.stringify({ ...valid, recommendations: [{ category: 'полнота', severity: 'minor', problem: 'проблема', evidence: '', fix: 'исправление' }] }),
    JSON.stringify({ ...valid, recommendations: [{ category: 'полнота', severity: 'minor', problem: 'проблема', evidence: 'цитата', fix: '' }] }),
    JSON.stringify({ ...valid, recommendations: [{ category: 'полнота', severity: 'critical', problem: 'проблема', evidence: 'цитата', fix: 'исправление' }] })
  ]) {
    await assert.rejects(ai.transform(settings, 'review', 'Требование', '', reply(response)));
  }
});
test('rejects empty, truncated and refused completions', async () => {
  await assert.rejects(ai.transform(settings, 'spelling', 'text', '', reply('')), /пустой/);
  for (const reason of ['length', 'content_filter', 'tool_calls']) await assert.rejects(ai.transform(settings, 'spelling', 'text', '', async () => new Response(JSON.stringify({ choices: [{ finish_reason: reason, message: { content: 'partial' } }] }))), /не завершил/);
});
test('validates commands, model, input and user instruction before requesting', async () => {
  const noFetch = () => { throw new Error('unexpected fetch'); };
  await assert.rejects(ai.transform(settings, 'unknown', 'text', '', noFetch), /Неизвестная/);
  await assert.rejects(ai.transform({ ...settings, model: '' }, 'json', '{}', '', noFetch), /модель/);
  await assert.rejects(ai.transform(settings, 'custom', 'text', '', noFetch), /инструкцию/);
  await assert.rejects(ai.transform(settings, 'spelling', 'x'.repeat(100001), '', noFetch), /большой/);
  await assert.rejects(ai.models({ ...settings, apiKey: '' }, noFetch), /ключ/);
});
test('HTTP error messages never include a provider body or credentials', async () => {
  await assert.rejects(ai.models(settings, async () => new Response('test-secret echoed by provider', { status: 401 })), error => /401/.test(error.message) && !error.message.includes('test-secret'));
  await assert.rejects(ai.models(settings, async () => new Response('', { status: 429 })), /Лимит/);
});
test('reports timeouts without credentials', async () => {
  await assert.rejects(ai.models(settings, async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }), /120 секунд/);
});
const source = { cells: [{ id: 'c0', text: 'да' }, { id: 'c1', text: 'нет' }] };
test('table edits accept only selected cells, safe text and hex colors', async () => {
  const changes = { cells: [{ id: 'c0', backgroundColor: '#e3fcef' }, { id: 'c1', text: '<img onerror=alert(1)>', backgroundColor: '#fff0b3', color: '' }] };
  assert.deepEqual(await ai.transform(settings, 'table', source, 'раскрась', reply(JSON.stringify(changes))), changes);
});
test('table edits reject HTML, arbitrary styles, duplicates and unknown cells', () => {
  for (const cells of [[], [{ id: 'c9', text: 'x' }], [{ id: 'c0' }], [{ id: 'c0', style: 'x' }], [{ id: 'c0', text: 4 }], [{ id: 'c0', color: 'url(x)' }], [{ id: 'c0', text: 'x' }, { id: 'c0', text: 'y' }]]) assert.throws(() => ai.tableResult(JSON.stringify({ cells }), source));
});
const richDoc = (text, attrs = {}) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...attrs }] }] });
const richSource = { format: 'rich-text', text: 'Риск', document: richDoc('Риск', { bold: true, color: '#ff0000' }) };
test('custom sends the selected formatting as structured data and returns a validated rich result', async () => {
  const document = { type: 'doc', content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Новый заголовок' }] }] };
  const result = await ai.transform(settings, 'custom', richSource, 'сделай заголовок', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(body.messages[1].content).selection, richSource);
    assert.match(body.messages[0].content, /не HTML и не Markdown/);
    assert.match(body.messages[0].content, /heading/);
    return reply(JSON.stringify(document))();
  });
  assert.deepEqual(result, { format: 'rich-text', document });
});
test('free instruction can return a safe logical table as formatted document data', async () => {
  const document = {
    type: 'doc',
    content: [{
      type: 'table',
      content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', content: [richDoc('Раздел').content[0]] },
          { type: 'tableHeader', content: [richDoc('Значение').content[0]] }
        ] },
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [richDoc('Срок').content[0]] },
          { type: 'tableCell', content: [richDoc('5 дней').content[0]] }
        ] }
      ]
    }]
  };
  const result = await ai.transform(settings, 'custom', richSource, 'преобразуй в логическую таблицу', reply(JSON.stringify(document)));
  assert.deepEqual(result, { format: 'rich-text', document });
});
test('table instruction provides exact output schema and rejects a prose-only answer', async () => {
  let systemPrompt = '';
  const request = async (url, options) => {
    systemPrompt = JSON.parse(options.body).messages[0].content;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(richDoc('это не таблица')) } }] }));
  };
  await assert.rejects(ai.transform(settings, 'custom', richSource, 'Преобразуй информацию в логическую таблицу', request), /не представил результат таблицей/);
  assert.match(systemPrompt, /настоящий узел table/);
  assert.match(systemPrompt, /tableHeader/);
});
test('free instruction accepts a Markdown table and converts it to safe formatted output', async () => {
  const result = await ai.transform(settings, 'custom', richSource, 'преобразуй в таблицу', reply('| Показатель | Значение |\n| --- | --- |\n| Срок | 5 дней |'));
  assert.equal(result.format, 'rich-text');
  assert.equal(require('../lib/ai-rich-text').text(result.document), 'Показатель | Значение\nСрок | 5 дней');
});
test('free instruction unwraps a JSON table serialized inside a text node', async () => {
  const serialized = JSON.stringify({ headers: ['Показатель', 'Значение'], rows: [['Срок', '5 дней']] });
  const result = await ai.transform(settings, 'custom', richSource, 'Преобразуй текст в таблицу', reply(JSON.stringify(richDoc(serialized))));
  assert.equal(require('../lib/ai-rich-text').text(result.document), 'Показатель | Значение\nСрок | 5 дней');
});
test('free instruction normalizes a JSON table even when the model omits rich-text node wrappers', async () => {
  const result = await ai.transform(settings, 'custom', richSource, 'составь таблицу', reply(JSON.stringify({
    headers: ['Показатель', 'Значение'],
    rows: [['Срок', '5 дней']]
  })));
  assert.equal(require('../lib/ai-rich-text').text(result.document), 'Показатель | Значение\nСрок | 5 дней');
});
test('format changes marks but rejects changed words, missing instruction and plain-text targets', async () => {
  const document = richDoc('Риск', { italic: true, color: '#0000ff' });
  assert.deepEqual(await ai.transform(settings, 'format', richSource, 'курсивом и синим', reply(JSON.stringify(document))), { format: 'rich-text', document });
  await assert.rejects(ai.transform(settings, 'format', richSource, 'жирным', reply(JSON.stringify(richDoc('Новый риск')))), /изменил текст/);
  await assert.rejects(ai.transform(settings, 'format', richSource, '', reply('unused')), /инструкцию/);
  await assert.rejects(ai.transform(settings, 'format', 'Риск', 'жирным', reply('unused')), /визуальном редакторе/);
});
test('rich spelling changes only text and preserves original formatting', async () => {
  const source = { format: 'rich-text', text: 'Превет', document: richDoc('Превет', { bold: true, color: '#ff0000', href: '/page' }) };
  const corrected = richDoc('Привет', { bold: true, color: '#ff0000', href: '/page' });
  const result = await ai.transform(settings, 'spelling', source, '', async (url, options) => {
    assert.match(JSON.parse(options.body).messages[0].content, /только значения text/);
    return reply(JSON.stringify(corrected))();
  });
  assert.deepEqual(result, { format: 'rich-text', document: corrected });
  for (const changed of [
    richDoc('Привет'),
    richDoc('Привет', { bold: true, color: '#00ff00', href: '/page' }),
    { type: 'doc', content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Привет', bold: true, color: '#ff0000', href: '/page' }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'При', bold: true, color: '#ff0000', href: '/page' }, { type: 'text', text: 'вет', bold: true, color: '#ff0000', href: '/page' }] }] }
  ]) await assert.rejects(ai.transform(settings, 'spelling', source, '', reply(JSON.stringify(changed))), /оформление|структур/);
});
test('rich output rejects HTML, Markdown, unsafe links and unvalidated provider attributes', async () => {
  for (const content of ['<h1>Риск</h1>', '**Риск**', JSON.stringify(richDoc('Риск', { href: 'javascript:alert(1)' })), JSON.stringify(richDoc('Риск', { style: 'color:red' }))]) await assert.rejects(ai.transform(settings, 'custom', richSource, 'оформи', reply(content)));
});
test('tasks action is registered for panel-side validation', () => {
  assert.equal(typeof ai.ACTIONS.tasks, 'string');
  assert.match(ai.ACTIONS.tasks, /декомпозицию/);
  assert.match(ai.ACTIONS.tasks, /"total"/);
});
test('tasks propose messages wrap the selection as data with the propose system prompt', () => {
  const messages = ai.tasksMessages('propose', 'Текст документа', [], '', 'https://conf.example/x');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /декомпозицию/);
  assert.match(messages[0].content, /"roles"/);
  assert.doesNotMatch(messages[0].content, /https:\/\/conf\.example/);
  assert.deepEqual(JSON.parse(messages[1].content), { instruction: 'Предложи декомпозицию выделенного текста на задачи разработки.', selection: 'Текст документа' });
});
test('tasks iteration messages keep the full history and append the user comment', () => {
  const history = [
    { role: 'user', content: JSON.stringify({ instruction: 'Предложи декомпозицию выделенного текста на задачи разработки.', selection: 'doc' }) },
    { role: 'assistant', content: 'Декомпозиция v1' }
  ];
  const messages = ai.tasksMessages('propose', 'doc', history, 'Убери роль QA', 'https://conf.example/x');
  assert.deepEqual(messages.slice(1), [...history, { role: 'user', content: 'Убери роль QA' }]);
});
test('tasks generate messages switch the system prompt and embed the page URL', () => {
  const history = [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }];
  const messages = ai.tasksMessages('generate', 'doc', history, '', 'https://conf.example/pages/42');
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Ссылка на документацию, которую система подставит в каждую задачу: https:\/\/conf\.example\/pages\/42/);
  assert.match(messages[0].content, /"steps"/);
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.match(messages[messages.length - 1].content, /согласована/);
  assert.deepEqual(messages.slice(1, -1), history);
});
const proposalReply = { total: 2, roles: [{ role: 'back-end', count: 2 }], tasks: [{ title: 'A', role: 'back-end', description: 'd' }, { title: 'B', role: 'back-end', description: 'e' }] };
test('tasks proposal result validates JSON and normalizes fields', () => {
  const result = ai.tasksResult('```json\n' + JSON.stringify(proposalReply) + '\n```', 'propose');
  assert.deepEqual(result, { format: 'tasks', stage: 'propose', ...proposalReply });
  for (const bad of [
    'not json',
    JSON.stringify({ total: 0, roles: [], tasks: proposalReply.tasks }),
    JSON.stringify({ total: 2, roles: [{ role: 'x', count: 0 }], tasks: proposalReply.tasks }),
    JSON.stringify({ total: 2, roles: [], tasks: [] }),
    JSON.stringify({ total: 2, roles: [], tasks: [{ title: '', role: 'r', description: 'd' }] }),
    JSON.stringify({ total: 2, roles: [], tasks: [{ title: 't', role: 'r' }] })
  ]) assert.throws(() => ai.tasksResult(bad, 'propose'), /неверном формате/);
});
const docReply = { tasks: [{ number: 2, title: 'API', role: 'back-end', goal: 'Цель', steps: ['Шаг 1'] }, { number: 1, title: 'Форма', role: 'front-end', goal: 'Цель 1', steps: ['s'] }] };
test('tasks document result validates JSON and sorts tasks by number', () => {
  const result = ai.tasksResult(JSON.stringify(docReply), 'generate');
  assert.equal(result.format, 'tasks');
  assert.equal(result.stage, 'generate');
  assert.deepEqual(result.tasks.map(task => task.number), [1, 2]);
  for (const bad of [
    '{}',
    JSON.stringify({ tasks: [{ number: 1, title: 't', role: 'r', goal: 'g', steps: [] }] }),
    JSON.stringify({ tasks: [{ number: 0, title: 't', role: 'r', goal: 'g', steps: ['s'] }] }),
    JSON.stringify({ tasks: [{ number: 1, title: 't', role: 'r', goal: 'g' }] }),
    JSON.stringify({ tasks: [{ number: 1, title: 't', role: 'r', goal: 'g', steps: [4] }] })
  ]) assert.throws(() => ai.tasksResult(bad, 'generate'), /неверном формате/);
});
test('tasksRichDocument builds a validated chapter with steps and the page link', () => {
  const rich = require('../lib/ai-rich-text');
  const result = ai.tasksResult(JSON.stringify({ tasks: [docReply.tasks[0]] }), 'generate');
  const chapter = ai.tasksRichDocument(result, 'https://conf.example/pages/42');
  assert.equal(chapter.type, 'doc');
  assert.deepEqual(chapter.content.map(node => node.type), ['heading', 'heading', 'paragraph', 'bulletList', 'paragraph']);
  assert.equal(chapter.content[0].content[0].text, 'Задачи на разработку');
  assert.equal(chapter.content[1].content[0].text, 'Задача 2. API');
  const link = chapter.content[4].content[1];
  assert.equal(link.href, 'https://conf.example/pages/42');
  assert.match(rich.text(chapter), /Задачи на разработку/);
  assert.match(rich.text(chapter), /conf\.example\/pages\/42/);
  const insecure = ai.tasksRichDocument(result, 'http://insecure.example');
  assert.equal(insecure.content[4].content.length, 2);
  assert.equal(insecure.content[4].content[1].text, 'уточнить у аналитика');
  assert.throws(() => ai.tasksRichDocument({ format: 'tasks', stage: 'propose', tasks: [] }, ''), /Некорректный/);
});
test('reviewRichDocument builds a validated chapter with numbered recommendations', () => {
  const rich = require('../lib/ai-rich-text');
  const result = ai.reviewResult(JSON.stringify({
    score: 65.4,
    summary: 'Основной сценарий описан, но не хватает критериев приёмки.',
    recommendations: [
      { category: 'Критерии приёмки', severity: 'major', problem: 'Нет измеримых критериев приёмки.', evidence: 'Система должна быстро сохранять документ.', fix: 'Добавьте измеримые критерии приёмки.' },
      { category: 'Граничные случаи', severity: 'blocker', problem: 'Не описано поведение при сбое.', evidence: 'При сбое сервиса…', fix: 'Опишите поведение при недоступности сервиса.' }
    ]
  }));
  const chapter = ai.reviewRichDocument(result, 'https://conf.example/pages/42');
  assert.equal(chapter.type, 'doc');
  assert.deepEqual(chapter.content.map(node => node.type),
    ['heading', 'paragraph', 'heading', 'paragraph', 'blockquote', 'paragraph', 'heading', 'paragraph', 'blockquote', 'paragraph']);
  assert.equal(chapter.content[0].content[0].text, 'Проверка качества документации');
  assert.equal(chapter.content[1].content[0].bold, true);
  assert.match(chapter.content[1].content[0].text, /Готовность к разработке: 65%/);
  assert.match(rich.text(chapter), /критериев приёмки\./);
  assert.equal(chapter.content[2].content[0].text, '1. [граничные случаи · blocker]');
  assert.equal(chapter.content[6].content[0].text, '2. [критерии приёмки · major]');
  assert.equal(chapter.content[4].type, 'blockquote');
  assert.match(rich.text(chapter), /Как исправить: Опишите поведение при недоступности сервиса\./);
  for (const bad of [
    null,
    { format: 'review', score: 50, summary: 's', recommendations: [] },
    { format: 'review', score: '50', summary: 's', recommendations: result.recommendations },
    { format: 'review', score: 50, summary: 's', recommendations: [{ category: 'x', severity: 'critical', problem: 'p', evidence: 'e', fix: 'f' }] },
    { format: 'review', score: 50, summary: 's', recommendations: [{ category: 'x', severity: 'major', problem: '', evidence: 'e', fix: 'f' }] }
  ]) assert.throws(() => ai.reviewRichDocument(bad, 'https://conf.example/pages/42'), /Некорректн/);
});
test('chat sends the conversation unchanged and returns unfenced reply text', async () => {
  const messages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'u2' }
  ];
  const result = await ai.chat(settings, messages, async (url, options) => {
    assert.equal(url, 'https://example.test/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'chat-model'); assert.equal(body.stream, false);
    assert.deepEqual(body.messages, messages);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '```markdown\n# Задачи на разработку\n```' } }] }));
  });
  assert.equal(result, '# Задачи на разработку');
});
test('chat rejects oversized histories and invalid message lists without requesting', async () => {
  const noFetch = () => { throw new Error('unexpected fetch'); };
  await assert.rejects(ai.chat(settings, [{ role: 'system', content: 's' }, { role: 'user', content: 'x'.repeat(100001) }], noFetch), /100 000/);
  await assert.rejects(ai.chat(settings, [], noFetch), /истори/);
  await assert.rejects(ai.chat(settings, [{ role: 'user', content: '  ' }], noFetch), /истори/);
  await assert.rejects(ai.chat({ ...settings, model: '' }, [{ role: 'user', content: 'x' }], noFetch), /модель/);
});
test('chat reports truncated and empty completions like transform', async () => {
  await assert.rejects(ai.chat(settings, [{ role: 'user', content: 'x' }], async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }))), /не завершил/);
  await assert.rejects(ai.chat(settings, [{ role: 'user', content: 'x' }], reply('')), /пустой/);
});
