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
    assert.deepEqual(JSON.parse(body.messages[1].content), { instruction: '', document: 'Система должна сохранять документ.' });
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
