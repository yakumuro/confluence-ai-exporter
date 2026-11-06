'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const preview = require('../lib/ai-preview');

function reconstructed(parts, side) {
  return parts
    .filter(part => side === 'old' ? part.type !== 'insert' : part.type !== 'delete')
    .map(part => part.text)
    .join('');
}

test('diff keeps identical text unchanged, including an empty value', () => {
  assert.deepEqual(preview.diff('Тот же текст', 'Тот же текст'), [{ type: 'equal', text: 'Тот же текст' }]);
  assert.deepEqual(preview.diff('', ''), []);
});

test('diff highlights a word replacement without losing surrounding text', () => {
  const before = 'Это старый текст.';
  const after = 'Это новый текст.';
  const parts = preview.diff(before, after);
  assert.deepEqual(parts, [
    { type: 'equal', text: 'Это ' },
    { type: 'delete', text: 'старый' },
    { type: 'insert', text: 'новый' },
    { type: 'equal', text: ' текст.' }
  ]);
  assert.equal(reconstructed(parts, 'old'), before);
  assert.equal(reconstructed(parts, 'new'), after);
});

test('diff supports pure insertions and deletions with punctuation and whitespace', () => {
  for (const [before, after, expected] of [
    ['Первый пункт.', 'Первый пункт.\nВторой пункт!', 'insert'],
    ['Первый пункт.\nВторой пункт!', 'Первый пункт.', 'delete']
  ]) {
    const parts = preview.diff(before, after);
    assert(parts.some(part => part.type === expected));
    assert.equal(reconstructed(parts, 'old'), before);
    assert.equal(reconstructed(parts, 'new'), after);
  }
});

test('large non-overlapping changes use bounded-memory fallback', () => {
  const before = Array.from({ length: 1000 }, (_, index) => 'старое' + index).join(' ');
  const after = Array.from({ length: 1000 }, (_, index) => 'новое' + index).join(' ');
  const parts = preview.diff(before, after);
  assert.deepEqual(parts.map(part => part.type), ['delete', 'insert']);
  assert.equal(reconstructed(parts, 'old'), before);
  assert.equal(reconstructed(parts, 'new'), after);
});

test('PlantUML sequence preview extracts participants, messages and self-messages', () => {
  const model = preview.plantUmlModel(`@startuml
participant Пользователь as User
actor Система as System
User -> System: Отправить запрос
System --> System: Проверить данные
@enduml`);
  assert.equal(model.type, 'sequence');
  assert.deepEqual(model.participants, ['User', 'System']);
  assert.deepEqual(model.messages.map(item => item.text), ['Отправить запрос', 'Проверить данные']);
  assert.equal(model.messages[1].from, model.messages[1].to);
});

test('PlantUML flow preview deduplicates nodes and preserves edge labels', () => {
  const model = preview.plantUmlModel(`@startuml
start -> Проверка: запрос
Проверка -> Готово: успех
Проверка -> Ошибка: отказ
@enduml`);
  assert.equal(model.type, 'flow');
  assert.equal(model.edges.length, 3);
  assert.deepEqual([...new Set(model.edges.flatMap(edge => [edge.from, edge.to]))], ['start', 'Проверка', 'Готово', 'Ошибка']);
  assert.equal(model.edges[0].text, 'запрос');
  assert.equal(preview.plantUmlModel('@startuml\nнет схемы\n@enduml'), null);
});
