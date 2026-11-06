'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const list = require('../lib/numbered-list');

test('делит одну строку с нумерацией на отдельные пункты', function () {
  const result = list.convert('1. Первое условие. 2. Второе условие. 3. Третье условие.');
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.equal(
    result.html,
    '<ol><li>Первое условие.</li><li>Второе условие.</li><li>Третье условие.</li></ol>'
  );
});

test('понимает пункты, разнесенные по строкам и через br', function () {
  const lines = list.convert('1. Первое\n2) Второе');
  assert.equal(lines.html, '<ol><li>Первое</li><li>Второе</li></ol>');

  const withBreaks = list.convert('1. Первое<br>2. Второе<br/>3. Третье');
  assert.equal(
    withBreaks.html,
    '<ol><li>Первое</li><li>Второе</li><li>Третье</li></ol>'
  );
});

test('строки без маркеров превращает в пункты списка', function () {
  const result = list.convert('Первое условие\nВторое условие');
  assert.equal(result.items.length, 2);
  assert.equal(result.html, '<ol><li>Первое условие</li><li>Второе условие</li></ol>');
});

test('делит склеенные пункты без пробела после предыдущего', function () {
  const result = list.convert('1. Разрешить цифры.2. Запретить пробел.3. Обрезать пробелы.');
  assert.equal(result.items.length, 3);
  assert.equal(
    result.html,
    '<ol><li>Разрешить цифры.</li><li>Запретить пробел.</li><li>Обрезать пробелы.</li></ol>'
  );
});

test('делит пункты, если выделение начато не с первого номера', function () {
  const result = list.convert('2. Второе условие. 3. Третье условие.');
  assert.equal(result.items.length, 2);
  assert.equal(result.html, '<ol><li>Второе условие.</li><li>Третье условие.</li></ol>');
});

test('не путает десятичные числа с номерами пунктов', function () {
  const result = list.convert('1. Значение 2.5 недопустимо. 2. Проверить ещё раз.');
  assert.equal(result.items.length, 2);
  assert.match(result.html, /<li>Значение 2\.5 недопустимо\.<\/li>/);
});

test('не считает списком упоминания чисел внутри текста', function () {
  const result = list.convert('Увеличить в 2. раза, затем в 3. раза');
  assert.equal(result.items.length, 1);
  assert.equal(result.html, '<ol><li>Увеличить в 2. раза, затем в 3. раза</li></ol>');
});

test('не делит строку, если нумерация начинается не с первого символа', function () {
  const result = list.convert('Условия: 1. Первое 2. Второе');
  assert.equal(result.items.length, 1);
});

test('не делит строку с нарушенной нумерацией', function () {
  const result = list.convert('1. Первое 3. Третье');
  assert.equal(result.items.length, 1);
});

test('сохраняет вложенность по отступам', function () {
  const result = list.convert('1. Первое\n  - Вложенное\n2. Второе');
  assert.equal(
    result.html,
    '<ol><li>Первое<ul><li>Вложенное</li></ul></li><li>Второе</li></ol>'
  );
});

test('маркированные строки собирает в маркированный список', function () {
  const result = list.convert('- Первое\n- Второе');
  assert.equal(result.html, '<ul><li>Первое</li><li>Второе</li></ul>');
});

test('экранирует html в тексте пунктов', function () {
  const result = list.convert('1. Значение <id> & "код"\n2. Второе');
  assert.match(result.html, /<li>Значение &lt;id&gt; &amp; &quot;код&quot;<\/li>/);
});

test('пустой ввод и слишком длинный текст отклоняет', function () {
  const empty = list.convert('   \n  ');
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty');

  const long = list.convert('1. ' + 'x'.repeat(list.MAX_INPUT_LENGTH));
  assert.equal(long.ok, false);
  assert.equal(long.reason, 'too-long');
});

test('понимает маркеры со скобкой: 1) и (1)', function () {
  const paren = list.convert('1) Первое условие\n2) Второе условие');
  assert.equal(paren.html, '<ol><li>Первое условие</li><li>Второе условие</li></ol>');

  const bracketed = list.convert('(1) Первое условие\n(2) Второе условие');
  assert.equal(bracketed.html, '<ol><li>Первое условие</li><li>Второе условие</li></ol>');
});

test('строит иерархию по составному номеру 1.1 и 1.1.1', function () {
  const result = list.convert('1. Первый раздел\n1.1. Подраздел\n1.1.1. Пункт\n2. Второй раздел');
  assert.equal(result.items.length, 4);
  assert.equal(result.depth, 3);
  assert.equal(
    result.html,
    '<ol><li>Первый раздел<ol><li>Подраздел<ol><li>Пункт</li></ol></li></ol></li>'
      + '<li>Второй раздел</li></ol>'
  );
});

test('понимает подпункты 1.1) и 1.1 без точки', function () {
  const paren = list.convert('1.1) Первый подпункт\n1.2) Второй подпункт');
  assert.equal(paren.items.length, 2);
  assert.equal(paren.depth, 1);
  assert.equal(paren.html, '<ol><li>Первый подпункт</li><li>Второй подпункт</li></ol>');

  const bare = list.convert('1.1 Первый подпункт\n1.2 Второй подпункт');
  assert.equal(bare.items.length, 2);
  assert.equal(bare.html, '<ol><li>Первый подпункт</li><li>Второй подпункт</li></ol>');
});

test('вкладывает маркированные подпункты в нумерованный список', function () {
  const result = list.convert('1. Первый\n  - Подпункт\n  - Второй подпункт\n2. Второй');
  assert.equal(result.depth, 2);
  assert.equal(
    result.html,
    '<ol><li>Первый<ul><li>Подпункт</li><li>Второй подпункт</li></ul></li><li>Второй</li></ol>'
  );
});

test('сохраняет иерархию маркированного списка', function () {
  const result = list.convert('- Первый\n  - Вложенный\n- Второй');
  assert.equal(result.depth, 2);
  assert.equal(
    result.html,
    '<ul><li>Первый<ul><li>Вложенный</li></ul></li><li>Второй</li></ul>'
  );
});

test('делит строку с составными номерами пунктов', function () {
  const result = list.convert('1.1. Первое 1.2. Второе');
  assert.equal(result.items.length, 2);
  assert.equal(result.html, '<ol><li>Первое</li><li>Второе</li></ol>');
});

test('не считает пунктом одиночное десятичное число', function () {
  const result = list.convert('1.5 раза больше');
  assert.equal(result.items.length, 1);
  assert.equal(result.html, '<ol><li>1.5 раза больше</li></ol>');

  const section = list.convert('1.1 Текст раздела');
  assert.equal(section.html, '<ol><li>Текст раздела</li></ol>');
});

test('рендер пункта можно переопределить', function () {
  const html = list.buildListHtml(
    [{ kind: 'ol', indent: 0, text: 'жирный' }],
    function (text) { return '<strong>' + text + '</strong>'; }
  );
  assert.equal(html, '<ol><li><strong>жирный</strong></li></ol>');
});
