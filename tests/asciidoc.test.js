'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const asciidoc = require('../lib/asciidoc');
const importer = require('../lib/markdown-importer');

const fence = '```';

test('exports Markdown metadata and common blocks as AsciiDoc', function () {
  const markdown = [
    '---',
    'title: "API page"',
    'source: "https://example.test/pages/1"',
    'page_id: "1"',
    '---',
    '# API page',
    '',
    '## Request',
    '',
    '**Bold** and *italic* with [link](https://example.test).',
    '',
    '- first',
    '  - nested',
    '1. ordered',
    '',
    '![Schema](attachments/schema.png)',
    '',
    fence + 'javascript',
    'const answer = 42;',
    fence,
    '',
    '| Key | Value |',
    '| --- | --- |',
    '| a | b |'
  ].join('\n');

  const result = asciidoc.fromMarkdown(markdown);
  assert.match(result, /^= API page\n:source: https:\/\/example\.test\/pages\/1\n:page_id: 1/);
  assert.match(result, /== Request/);
  assert.doesNotMatch(result, /^# API page/m);
  assert.match(result, /\*\*Bold\*\* and _italic_ with link:https:\/\/example\.test\[link\]/);
  assert.match(result, /\* first\n\*\* nested\n\. ordered/);
  assert.match(result, /image::attachments\/schema\.png\[Schema\]/);
  assert.match(result, /\[source,javascript\]\n----\nconst answer = 42;\n----/);
  assert.match(result, /\|===\n\| Key \| Value\n\| a \| b\n\|===/);
});

test('imports common AsciiDoc syntax through the Markdown-compatible pipeline', function () {
  const source = [
    '= API page',
    ':source: https://example.test/pages/1',
    '',
    '== Request',
    '',
    '*Bold* and _italic_ with link:https://example.test[link].',
    '',
    '* first',
    '** nested',
    '. ordered',
    '',
    'image::attachments/schema.png[Schema]',
    '',
    '[source,javascript]',
    '----',
    'const answer = 42;',
    '----',
    '',
    '|===',
    '| Key | Value',
    '| a | b',
    '|==='
  ].join('\n');

  const markdown = asciidoc.toMarkdown(source);
  assert.match(markdown, /^# API page/m);
  assert.match(markdown, /## Request/);
  assert.match(markdown, /\*\*Bold\*\* and \*italic\* with \[link\]\(https:\/\/example\.test\)/);
  assert.match(markdown, /- first\n  - nested\n1\. ordered/);
  assert.match(markdown, /!\[Schema\]\(attachments\/schema\.png\)/);
  assert.match(markdown, /```javascript\nconst answer = 42;\n```/);
  assert.match(markdown, /\| Key \| Value \|\n\| --- \| --- \|\n\| a \| b \|/);
});

test('round-trips collapsible blocks, quotes and PlantUML', function () {
  const markdown = [
    '> **Information**',
    '>',
    '> Check the request.',
    '',
    '<details>',
    '<summary>Example</summary>',
    '',
    fence + 'plantuml',
    '@startuml',
    'Alice -> Bob: call',
    '@enduml',
    fence,
    '</details>'
  ].join('\n');

  const exported = asciidoc.fromMarkdown(markdown);
  assert.match(exported, /\[quote\]\n____/);
  assert.match(exported, /\.Example\n\[%collapsible\]\n====/);
  assert.match(exported, /\[source,plantuml\]/);

  const imported = importer.parseDocument(exported, { format: 'asciidoc' });
  assert.match(imported.storage, /<blockquote>/);
  assert.equal((imported.storage.match(/ac:name="expand"/g) || []).length, 1);
  assert.match(imported.storage, /ac:name="plantuml"/);
  assert.match(imported.storage, /Alice -&gt; Bob: call|Alice -> Bob: call/);
});

test('imports AsciiDoc headings, tables and code into Confluence storage', function () {
  const result = importer.parseDocument([
    '= Different title',
    '',
    '== Rules',
    '',
    '[source,sql]',
    '----',
    'select 1;',
    '----',
    '',
    '|===',
    '| Key | Value',
    '| EQID | *Required*',
    '|==='
  ].join('\n'), { format: 'asciidoc', pageTitle: 'Different title' });

  assert.doesNotMatch(result.storage, /<h1>Different title<\/h1>/);
  assert.match(result.storage, /<h2>Rules<\/h2>/);
  assert.match(result.storage, /ac:name="language">sql<\/ac:parameter>/);
  assert.match(result.storage, /<th><p>Key<\/p><\/th>/);
  assert.match(result.storage, /<td><p><strong>Required<\/strong><\/p><\/td>/);
});

test('keeps Markdown as the default import format', function () {
  const result = importer.parseDocument('## Markdown heading');
  assert.match(result.storage, /<h2>Markdown heading<\/h2>/);
  assert.throws(function () {
    importer.parseDocument(':source: https://example.test', { format: 'asciidoc' });
  }, /не найдено содержимое/);
});
