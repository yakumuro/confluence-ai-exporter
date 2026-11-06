'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rich = require('../lib/ai-rich-text');
const doc = (...content) => ({ type: 'doc', content });
const paragraph = (text, marks = {}) => ({ type: 'paragraph', content: [{ type: 'text', text, ...marks }] });

test('renders headings, paragraphs, nested lists, code and all supported marks', () => {
  const document = doc(
    { type: 'heading', level: 2, content: [{ type: 'text', text: 'Заголовок' }] },
    paragraph('важно', { bold: true, italic: true, underline: true, strike: true, code: true, color: '#FF0000', backgroundColor: '#fff0b3', href: '/pages/viewpage.action?pageId=1&x=2' }),
    { type: 'orderedList', start: 3, content: [{ type: 'listItem', content: [paragraph('пункт'), { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('вложенный')] }] }] }] },
    { type: 'blockquote', content: [paragraph('цитата')] },
    { type: 'codeBlock', text: '<script>alert(1)</script>\nsecond' }, { type: 'horizontalRule' }
  );
  const html = rich.html(document);
  assert.match(html, /<h2>Заголовок<\/h2>/); assert.match(html, /<ol start="3">/); assert.match(html, /<ul><li>/);
  assert.match(html, /color:#ff0000;background-color:#fff0b3/); assert.match(html, /<strong>/); assert.match(html, /<em>/);
  assert.match(html, /<u>/); assert.match(html, /<s>/); assert.match(html, /<blockquote>/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /pageId=1&amp;x=2/);
  assert(!html.includes('<script>'));
});
test('renders a validated logical table and exposes its text for comparison', () => {
  const table = {
    type: 'table',
    content: [
      { type: 'tableRow', content: [
        { type: 'tableHeader', content: [paragraph('Показатель')] },
        { type: 'tableHeader', content: [paragraph('Значение')] }
      ] },
      { type: 'tableRow', content: [
        { type: 'tableCell', content: [paragraph('Срок')] },
        { type: 'tableCell', content: [paragraph('5 дней')] }
      ] }
    ]
  };
  assert.equal(rich.html(doc(table)), '<table><tbody><tr><th><p>Показатель</p></th><th><p>Значение</p></th></tr><tr><td><p>Срок</p></td><td><p>5 дней</p></td></tr></tbody></table>');
  assert.equal(rich.text(doc(table)), 'Показатель | Значение\nСрок | 5 дней');
});
test('normalizes a Markdown table reply into the safe document model', () => {
  const table = rich.fromMarkdownTable('| Показатель | Значение |\n| --- | --- |\n| Срок | 5 дней |\n| Комментарий | срок\\|условие |');
  assert.equal(rich.text(table), 'Показатель | Значение\nСрок | 5 дней\nКомментарий | срок|условие');
  assert.match(rich.html(table), /<table><tbody><tr><th><p>Показатель<\/p><\/th>/);
  assert.equal(rich.fromMarkdownTable('Это не таблица'), null);
});
test('normalizes common structured table reply shapes and wraps inline cells safely', () => {
  const table = rich.normalizeTableDocument({
    type: 'table',
    content: [
      { type: 'tableRow', content: [{ type: 'text', text: 'Показатель' }, { type: 'text', text: 'Значение' }] },
      { type: 'tableRow', content: [{ type: 'text', text: 'Срок' }, { type: 'text', text: '5 дней' }] }
    ]
  });
  assert.equal(rich.text(table), 'Показатель | Значение\nСрок | 5 дней');
  const simple = rich.normalizeTableDocument({ headers: ['Показатель', 'Значение'], rows: [['Срок', '5 дней']] });
  assert.equal(rich.text(simple), 'Показатель | Значение\nСрок | 5 дней');
});
test('inline insertion omits a single paragraph or heading wrapper, not a structured document', () => {
  assert.equal(rich.html(doc(paragraph('слово', { bold: true })), true), '<strong>слово</strong>');
  assert.equal(rich.html(doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'слово' }] }), true), 'слово');
  assert.match(rich.html(doc(paragraph('a'), paragraph('b')), true), /^<p>a<\/p><p>b<\/p>$/);
});
test('list-item rendering replaces selected items without nesting a second list', () => {
  const document = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('a', { bold: true })] }, { type: 'listItem', content: [paragraph('b')] }] });
  assert.equal(rich.html(document, 'listItems'), '<li><p><strong>a</strong></p></li><li><p>b</p></li>');
  assert.throws(() => rich.html(doc(paragraph('x')), 'listItems'));
});
test('escapes text and code instead of executing provider markup', () => {
  const html = rich.html(doc(paragraph('<img src=x onerror="alert(1)"><svg onload=alert(1)>')));
  assert(!html.includes('<img') && !html.includes('<svg') && html.includes('&lt;img'));
});
test('does not accept arbitrary HTML, CSS, attributes, tags or URLs', () => {
  for (const document of [
    doc({ type: 'html', text: '<b>x</b>' }), doc({ type: 'iframe' }),
    { ...doc(paragraph('x')), html: '<script>x</script>' },
    doc(paragraph('x', { onclick: 'alert(1)' })), doc(paragraph('x', { style: 'position:fixed' })),
    doc(paragraph('x', { color: 'red' })), doc(paragraph('x', { color: '#fff;display:none' })),
    doc(paragraph('x', { backgroundColor: 'url(https://example.test)' })), doc(paragraph('x', { href: 'javascript:alert(1)' })),
    doc(paragraph('x', { href: 'data:text/html,<script>x</script>' })), doc(paragraph('x', { href: '//evil.test' })),
    doc(paragraph('x', { href: '/\\evil.test' })), doc(paragraph('x', { href: 'https://user:secret@example.test' })),
    doc(paragraph('x', { bold: 'true' }))
  ]) assert.throws(() => rich.validate(document));
});
test('safe links allow web, mail, relative Confluence URLs and anchors only', () => {
  for (const link of ['https://example.test/path?q=x', 'http://example.test', 'mailto:a@example.test', '/display/SPACE/Page', '#anchor']) assert(rich.safeLink(link), link);
  for (const link of ['javascript:x', 'java\nscript:x', '\u0000https://example.test', '//evil.test', 'file:///C:/x', 'https://', 'https://u:p@example.test']) assert(!rich.safeLink(link), link);
});
test('schema rejects misplaced inline nodes, invalid headings and invalid list children', () => {
  for (const document of [doc({ type: 'text', text: 'x' }), doc({ type: 'heading', level: 7, content: [] }), doc({ type: 'bulletList', content: [paragraph('x')] }), doc({ type: 'paragraph', content: [paragraph('x')] }), doc({ type: 'orderedList', start: -1, content: [] })]) assert.throws(() => rich.validate(document));
});
test('table schema accepts varied row widths and inline cell text but rejects nested tables', () => {
  const ragged = doc({
    type: 'table',
    content: [
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'text', text: 'A' }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('B')] }, { type: 'tableCell', content: [paragraph('C')] }] }
    ]
  });
  assert.match(rich.html(ragged), /<tr><td>A<\/td><\/tr>/);
  assert.throws(() => rich.validate(doc({
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'table', content: [] }] }] }]
  })));
});
test('format-only text comparison permits layout and marks, not word or punctuation changes', () => {
  const before = doc(paragraph('Риск: ошибка.'));
  const after = doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Риск: ', bold: true }, { type: 'text', text: 'ошибка.', color: '#ff0000' }] });
  assert(rich.sameText(before, after));
  for (const text of ['Риск: новая ошибка.', 'Ошибка: риск.', 'риск: ошибка.', 'Риск ошибка.']) assert(!rich.sameText(before, doc(paragraph(text))));
  assert(rich.sameText(doc(paragraph('a b')), doc(paragraph('a'), paragraph('b'))));
});
test('text comparison joins marked fragments without adding spaces inside words', () => {
  assert(rich.sameText(doc(paragraph('keyword')), doc({ type: 'paragraph', content: [{ type: 'text', text: 'key', bold: true }, { type: 'text', text: 'word' }] })));
  assert(!rich.sameText(doc(paragraph('key word')), doc(paragraph('keyword'))));
});
test('spelling comparison accepts text edits only when structure and marks stay identical', () => {
  const before = doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Превет', bold: true, color: '#ff0000', href: '/page' }] });
  assert(rich.sameFormatting(before, doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Привет', bold: true, color: '#ff0000', href: '/page' }] })));
  for (const after of [
    doc(paragraph('Привет', { bold: true, color: '#ff0000', href: '/page' })),
    doc({ type: 'heading', level: 3, content: [{ type: 'text', text: 'Привет', bold: true, color: '#ff0000', href: '/page' }] }),
    doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Привет', color: '#ff0000', href: '/page' }] }),
    doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Привет', bold: true, color: '#00ff00', href: '/page' }] }),
    doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Привет', bold: true, color: '#ff0000' }] }),
    doc({ type: 'heading', level: 2, content: [{ type: 'text', text: 'При', bold: true, color: '#ff0000', href: '/page' }, { type: 'text', text: 'вет', bold: true, color: '#ff0000', href: '/page' }] })
  ]) assert(!rich.sameFormatting(before, after));
});
test('formatted diff decorations retain marks, colors and links around changed text', () => {
  const before = doc(paragraph('Превет , мир', { bold: true, color: '#ff0000', href: '/page' }));
  const after = doc(paragraph('Привет, мир', { bold: true, color: '#ff0000', href: '/page' }));
  const parts = new Map([['0.0', [{ type: 'equal', text: 'Пр' }, { type: 'delete', text: 'е' }, { type: 'insert', text: 'и' }, { type: 'equal', text: 'вет' }, { type: 'delete', text: ' ' }, { type: 'equal', text: ', мир' }]]]);
  const oldHtml = rich.html(before, false, { parts, side: 'old' });
  const newHtml = rich.html(after, false, { parts, side: 'new' });
  assert.match(oldHtml, /<del><a href="\/page"><span style="color:#ff0000"><strong>е<\/strong><\/span><\/a><\/del>/);
  assert.match(oldHtml, /<del><a href="\/page"><span style="color:#ff0000"><strong> <\/strong><\/span><\/a><\/del>/);
  assert.match(newHtml, /<ins><a href="\/page"><span style="color:#ff0000"><strong>и<\/strong><\/span><\/a><\/ins>/);
  assert(!oldHtml.includes('<ins>') && !newHtml.includes('<del>'));
});
test('empty, oversized and deeply nested documents fail closed', () => {
  for (const document of [null, [], doc(), doc(paragraph('  ')), doc(paragraph('x'.repeat(200001))), doc(...Array.from({ length: 10001 }, () => paragraph('x')))]) assert.throws(() => rich.validate(document));
  let node = paragraph('x'); for (let i = 0; i < 26; i++) node = { type: 'blockquote', content: [node] };
  assert.throws(() => rich.validate(doc(node)));
});
