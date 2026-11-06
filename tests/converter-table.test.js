'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const converter = require('../lib/converter');
const importer = require('../lib/markdown-importer');

// В Node нет DOMParser, поэтому для проверки рендеринга таблиц используется
// минимальный разбор XML: элементов, атрибутов и текста достаточно конвертеру.
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function (match, body) {
    if (body.charAt(0) === '#') {
      const code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : match;
  });
}

class StubNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.attributes = {};
    this.nodeValue = nodeType === TEXT_NODE ? '' : null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  append(child) {
    this.childNodes.push(child);
    return child;
  }

  get textContent() {
    if (this.nodeType === TEXT_NODE) return this.nodeValue;
    return this.childNodes.map(function (child) { return child.textContent || ''; }).join('');
  }
}

function parseXml(xml) {
  const root = new StubNode(ELEMENT_NODE, '#document');
  const stack = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  let match = tokenPattern.exec(xml);

  while (match) {
    const token = match[0];
    match = tokenPattern.exec(xml);

    if (token.indexOf('<!--') === 0 || token.indexOf('<?') === 0) continue;
    if (token.indexOf('</') === 0) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.charAt(0) === '<') {
      const selfClosing = /\/>$/.test(token);
      const body = token.replace(/^</, '').replace(/\/?>$/, '');
      const nameMatch = body.match(/^([^\s]+)/);
      const element = new StubNode(ELEMENT_NODE, nameMatch ? nameMatch[1] : '');
      const attributePattern = /([^\s=]+)="([^"]*)"/g;
      let attribute = attributePattern.exec(body);
      while (attribute) {
        element.attributes[attribute[1]] = decodeEntities(attribute[2]);
        attribute = attributePattern.exec(body);
      }
      stack[stack.length - 1].append(element);
      if (!selfClosing) stack.push(element);
      continue;
    }
    const text = new StubNode(TEXT_NODE, '#text');
    text.nodeValue = decodeEntities(token);
    stack[stack.length - 1].append(text);
  }

  return root.childNodes[0] || new StubNode(ELEMENT_NODE, 'root');
}

converter.setDomParser({
  parseFromString: function (xml) {
    const documentElement = parseXml(xml);
    return {
      documentElement: documentElement,
      body: documentElement,
      getElementsByTagName: function () { return []; }
    };
  }
});

function exportMarkdown(storage) {
  const result = converter.convert(storage, { pageTitle: 'Правила', frontMatter: true });
  return result.markdown;
}

test('выгружает нумерованный список из ячейки таблицы с переносами', function () {
  const storage = '<table><tbody>'
    + '<tr><th><p>Ключ</p></th><th><p>Правило</p></th></tr>'
    + '<tr><td><p>EQID</p></td><td><ol><li><p>Первое условие.</p></li>'
    + '<li><p>Второе условие.</p></li></ol></td></tr>'
    + '</tbody></table>';
  const markdown = exportMarkdown(storage);
  assert.match(markdown, /\| EQID \| 1\. Первое условие\.<br>2\. Второе условие\. \|/);
});

test('выгружает разрыв строки внутри ячейки как br', function () {
  const storage = '<table><tbody>'
    + '<tr><th><p>Ключ</p></th><th><p>Правило</p></th></tr>'
    + '<tr><td><p>MD31</p></td><td><p>первая строка<br />вторая строка</p></td></tr>'
    + '</tbody></table>';
  const markdown = exportMarkdown(storage);
  assert.match(markdown, /\| MD31 \| первая строка<br>вторая строка \|/);
});

test('простая ячейка остается в одну строку без лишних тегов', function () {
  const storage = '<table><tbody>'
    + '<tr><th><p>Ключ</p></th><th><p>Значение</p></th></tr>'
    + '<tr><td><p>MD32</p></td><td><p>обычный текст</p></td></tr>'
    + '</tbody></table>';
  const markdown = exportMarkdown(storage);
  assert.match(markdown, /\| MD32 \| обычный текст \|/);
  assert.doesNotMatch(markdown, /<br>/);
});

test('таблица со списком переживает выгрузку и повторный импорт', function () {
  const storage = '<table><tbody>'
    + '<tr><th><p>Ключ</p></th><th><p>Правило</p></th></tr>'
    + '<tr><td><p>EQID</p></td><td><ol><li><p>Разрешить цифры.</p></li>'
    + '<li><p>Запретить пробел в начале.</p></li></ol></td></tr>'
    + '</tbody></table>';
  const markdown = exportMarkdown(storage);
  const imported = importer.parseMarkdown(markdown, { pageTitle: 'Правила' });
  assert.match(
    imported.storage,
    /<td><ol><li>Разрешить цифры\.<\/li><li>Запретить пробел в начале\.<\/li><\/ol><\/td>/
  );
});
