'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const contentSource = fs.readFileSync(path.join(root, 'content/content.js'), 'utf8');
const converter = require('../lib/converter');
const asciidoc = require('../lib/asciidoc');
const importer = require('../lib/markdown-importer');
const zip = require('../lib/zip');

function createHarness(pageTitles) {
  const titles = Object.assign({ '1': 'Demo', '2': 'Child' }, pageTitles);
  const downloads = [];
  const updates = [];
  let listener;
  let listenerCount = 0;
  let currentBlob;

  const Converter = Object.assign({}, converter, {
    convert: function (storage, context) {
      return {
        markdown: '---\ntitle: "' + context.pageTitle + '"\n---\n# ' + context.pageTitle
          + '\n\n## Content\n\n```sql\nselect 1;\n```\n',
        warnings: []
      };
    }
  });
  const Api = {
    resolvePageIdFromUrl: async function () { return '1'; },
    getPage: async function (id) {
      return {
        id: String(id),
        title: titles[String(id)] || ('Page ' + id),
        space: { key: 'DOC' },
        version: { number: 1 },
        body: { storage: { value: '<p>Content</p>' } }
      };
    },
    updatePage: async function (id, storage, mode) {
      updates.push({ id: id, storage: storage, mode: mode });
      return { title: 'Demo', version: 2 };
    },
    getAttachments: async function () { return []; },
    pageUrl: function (page, id) { return 'https://example.test/pages/' + id; },
    baseUrl: function () { return 'https://example.test/'; },
    absolutizeUrl: function (url) { return new URL(url, this.baseUrl()).toString(); },
    attachmentUrlBase: function () { return 'https://example.test/attachments/'; }
  };

  const context = {
    console: console,
    Blob: Blob,
    TextEncoder: TextEncoder,
    Map: Map,
    Set: Set,
    Date: Date,
    Promise: Promise,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    RegExp: RegExp,
    Error: Error,
    URL: {
      createObjectURL: function (blob) { currentBlob = blob; return 'blob:test'; },
      revokeObjectURL: function () {}
    },
    document: {
      createElement: function () {
        return {
          style: {},
          click: function () { downloads.push({ blob: currentBlob, filename: this.download }); },
          remove: function () {}
        };
      },
      body: { appendChild: function () {} }
    },
    setTimeout: function (callback) { callback(); return 0; },
    clearTimeout: function () {},
    chrome: {
      runtime: {
        onMessage: {
          addListener: function (handler) { listener = handler; listenerCount += 1; },
          removeListener: function (handler) { if (listener === handler) listenerCount -= 1; }
        },
        sendMessage: function () {}
      }
    },
    MDExporterApi: Api,
    MDExporterConverter: Converter,
    MDExporterAsciiDoc: asciidoc,
    MDExporterMarkdownImporter: importer,
    MDExporterZip: zip
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(contentSource, context);

  function send(message) {
    return new Promise(function (resolve) {
      const asyncResponse = listener(message, { tab: { id: 1 } }, resolve);
      assert.equal(asyncResponse, true);
    });
  }

  function reinject() {
    context.window.__mdExporterInjected = false;
    vm.runInContext(contentSource, context);
  }

  return {
    send: send,
    reinject: reinject,
    listenerCount: function () { return listenerCount; },
    downloads: downloads,
    updates: updates
  };
}

test('content script downloads a real AsciiDoc document with an adoc filename', async function () {
  const harness = createHarness();
  const result = await harness.send({
    type: 'START',
    options: { format: 'asciidoc', includeAttachments: false, tree: [] }
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(harness.downloads.length, 1);
  assert.equal(harness.downloads[0].filename, 'Demo.adoc');
  const text = await harness.downloads[0].blob.text();
  assert.match(text, /^= Demo/);
  assert.match(text, /== Content/);
  assert.match(text, /\[source,sql\]\n----\nselect 1;\n----/);
});

test('content script keeps Markdown as the default download format', async function () {
  const harness = createHarness();
  await harness.send({ type: 'START', options: { includeAttachments: false, tree: [] } });

  assert.equal(harness.downloads[0].filename, 'Demo.md');
  const text = await harness.downloads[0].blob.text();
  assert.match(text, /^---\ntitle: "Demo"/);
  assert.match(text, /```sql/);
});

test('tree export stores AsciiDoc files in ZIP', async function () {
  const harness = createHarness();
  const result = await harness.send({
    type: 'START',
    options: {
      format: 'asciidoc',
      includeAttachments: false,
      tree: [{ id: '2', title: 'Child', selected: true, children: [] }]
    }
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(harness.downloads[0].filename, 'Demo.zip');
  const bytes = Buffer.from(await harness.downloads[0].blob.arrayBuffer());
  const archive = bytes.toString('utf8');
  assert.match(archive, /Demo\.adoc/);
  assert.match(archive, /Demo\/Child\.adoc/);
  assert.doesNotMatch(archive, /Demo\.md|Child\.md/);
});

test('tree export preserves long names within Windows-compatible ZIP paths', async function () {
  const longTitle = 'Очень длинное название страницы с полным описанием интеграции и требований к выгрузке документации без обрезки имени';
  const harness = createHarness({ '2': longTitle });
  const result = await harness.send({
    type: 'START',
    options: {
      format: 'asciidoc',
      includeAttachments: false,
      tree: [{ id: '2', title: longTitle, selected: true, children: [] }]
    }
  });

  assert.equal(result.ok, true, result.error);
  const archive = Buffer.from(await harness.downloads[0].blob.arrayBuffer()).toString('utf8');
  assert.ok(archive.includes(longTitle + '.adoc'));
  assert.ok(!archive.includes('Demo/' + longTitle + '/' + longTitle + '.adoc'));
  assert.ok(converter.utf8Length(longTitle + '.adoc') <= 258);
  assert.ok(!result.job.message.includes('сокращена'));
});

test('content script re-registers one listener after a stale injection is reset', function () {
  const harness = createHarness();
  assert.equal(harness.listenerCount(), 1);
  harness.reinject();
  assert.equal(harness.listenerCount(), 1);
});

test('content script imports AsciiDoc into Confluence storage', async function () {
  const harness = createHarness();
  const result = await harness.send({
    type: 'IMPORT_DOCUMENT',
    format: 'asciidoc',
    source: '== Imported\n\n[source,sql]\n----\nselect 1;\n----',
    mode: 'append',
    macroOptions: { codeExpand: false }
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(harness.updates.length, 1);
  assert.match(harness.updates[0].storage, /<h2>Imported<\/h2>/);
  assert.match(harness.updates[0].storage, /ac:name="language">sql<\/ac:parameter>/);
});
