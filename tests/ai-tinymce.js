/* Integration with real TinyMCE 4 (Confluence generation), not a fake editor. */
(async function () {
  'use strict';
  const results = document.getElementById('results');
  let failed = 0, root, listener, editor, api, response, lastPrompt;
  const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message || 'Assertion failed'); };
  async function test(name, run) {
    const li = document.createElement('li'); results.appendChild(li);
    try { await run(); li.textContent = 'PASS: ' + name; }
    catch (error) { failed++; li.textContent = 'FAIL: ' + name + ': ' + error.message; }
  }
  function load(doc, path) {
    return new Promise((resolve, reject) => {
      const script = doc.createElement('script'); script.src = new URL(path, location.href).href;
      script.onload = resolve; script.onerror = () => reject(new Error('Cannot load ' + script.src)); doc.head.appendChild(script);
    });
  }
  function selectText(html = '<p>До <strong>ошипка</strong> после</p>') {
    editor.setContent(html); editor.focus();
    const range = editor.getDoc().createRange(); range.selectNodeContents(editor.getBody().querySelector('strong') || editor.getBody().firstChild);
    editor.selection.setRng(range); editor.undoManager.clear(); editor.undoManager.add();
  }
  function open(action, result) {
    response = result;
    const snapshot = api.capture(action);
    listener({ type: 'md-ai-open', action, snapshot });
    return snapshot;
  }
  function buttons() {
    return [
      root.querySelector('.dialog-actions .primary'),
      root.querySelector('.dialog-actions .apply'),
      root.querySelector('.dialog-actions > button:first-child')
    ];
  }
  function instruction(value) {
    const input = root.querySelector('textarea'); input.focus();
    assert(root.activeElement === input, 'Instruction cannot receive focus');
    document.execCommand('insertText', false, value);
    assert(input.value === value, 'Typing did not enter the instruction');
    return input;
  }
  async function runAndApply() {
    buttons()[0].click(); await tick();
    assert(!buttons()[1].hidden, root.querySelector('.dialog-status').textContent);
    buttons()[1].click(); await tick(120);
    assert(!document.getElementById('md-exporter-ai-dialog'), root.querySelector('.dialog-status').textContent);
  }
  try {
    if (!window.tinymce) throw new Error('TinyMCE CDN is unavailable');
    await new Promise(resolve => tinymce.init({ selector: '#editor', plugins: 'table', toolbar: 'undo redo table', skin: false, content_css: false, init_instance_callback: instance => { editor = instance; resolve(); } }));
    const doc = editor.getDoc(), win = editor.getWin();
    for (const path of ['../lib/ai-rich-text.js', '../content/ai-selection.js']) await load(doc, path);
    api = win.MDExporterAISelection;
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const shadow = attach.call(this, options); if (this.id === 'md-exporter-ai-dialog') root = shadow; return shadow; };
    window.chrome = { runtime: {
      onMessage: { addListener: fn => { listener = fn; } },
      sendMessage: async message => {
        if (message.type === 'md-ai-run') { lastPrompt = message.prompt; return { ok: true, result: response }; }
        try {
          if (message.type === 'md-ai-apply') api.apply(message.id, response, message.mode);
          if (message.type === 'md-ai-close') api.discard(message.id);
          return { ok: true };
        } catch (error) { document.body.dataset.lastError = error.stack || error.message; return { ok: false, error: error.message }; }
      }
    } };
    await load(document, '../lib/ai-rich-text.js');
    await load(document, '../lib/ai-preview.js');
    await load(document, '../content/ai-ui.js');
    await test('Custom prompt keeps focus despite a Confluence-style focus trap; OK replaces only saved selection; undo works', async () => {
      selectText(); const before = editor.getContent(); open('custom', 'исправлено');
      // AUI/TinyMCE-style focus manager attempting to move focus to the editor.
      const trap = () => editor.focus();
      document.addEventListener('focusin', trap, true);
      try {
        const input = instruction('Исправь ошибку');
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ь', bubbles: true, composed: true }));
        await tick(250);
        assert(root.activeElement === input, 'Cursor was stolen after typing');
        assert(editor.getContent() === before, 'Opening or typing changed the document');
        buttons()[0].click(); await tick();
        assert(lastPrompt === 'Исправь ошибку');
        assert(editor.getContent() === before, 'Preview changed the document');
      } finally { document.removeEventListener('focusin', trap, true); }
      buttons()[1].click(); await tick(120);
      assert(editor.getBody().textContent.replace(/\u00a0/g, ' ') === 'До исправлено после', editor.getContent());
      assert(!document.getElementById('md-exporter-ai-dialog'), 'Successful OK did not close dialog');
      editor.undoManager.undo(); assert(editor.getContent() === before, 'Undo failed');
    });
    const Rich = window.MDExporterAIRichText;
    const paragraph = (text, marks = {}) => ({ type: 'paragraph', content: [{ type: 'text', text, ...marks }] });
    const richResult = (...content) => ({ format: 'rich-text', document: { type: 'doc', content } });
    await test('Rich source includes only selected text, heading, inherited bold, link and color', () => {
      selectText('<h2>До <a href="/display/TEST/Page"><strong><span style="color:red">Риск</span></strong></a> после</h2>');
      const snapshot = api.capture('custom'), document = snapshot.source.document;
      assert(snapshot.source.format === 'rich-text' && Rich.text(document) === 'Риск');
      assert(document.content[0].type === 'heading' && document.content[0].level === 2);
      const text = document.content[0].content[0];
      assert(text.bold && text.color === '#ff0000' && text.href === '/display/TEST/Page', JSON.stringify(document));
      assert(!JSON.stringify(snapshot.source).includes('после')); api.discard(snapshot.id);
    });
    await test('Format selected word bold and red without splitting its paragraph or changing neighbors; undo restores markup', async () => {
      selectText('<p>До <strong>Риск</strong> после</p>'); const before = editor.getContent();
      open('format', richResult(paragraph('Риск', { bold: true, color: '#ff0000' })));
      instruction('Слово Риск жирным и красным'); buttons()[0].click(); await tick();
      const preview = root.querySelector('.result-pane .rich-preview');
      assert(preview.querySelector('strong').textContent === 'Риск');
      assert(preview.querySelector('span').style.color === 'rgb(255, 0, 0)');
      assert(editor.getContent() === before, 'Rich preview modified editor');
      buttons()[1].click(); await tick(120);
      assert(!document.getElementById('md-exporter-ai-dialog'), root.querySelector('.dialog-status').textContent);
      assert(editor.getBody().querySelectorAll('p').length === 1, editor.getContent());
      assert(editor.getBody().querySelector('strong').textContent === 'Риск');
      assert(editor.getBody().querySelector('span[style]').style.color === 'rgb(255, 0, 0)');
      assert(editor.getBody().textContent.replace(/\u00a0/g, ' ') === 'До Риск после');
      editor.undoManager.undo(); assert(editor.getContent() === before, 'Rich undo lost initial formatting');
    });
    await test('Formatting can remove inherited bold and color from only the selected word', async () => {
      selectText('<p><strong>До <span style="color:red">Риск</span> после</strong></p>');
      const range = doc.createRange(); range.selectNodeContents(editor.getBody().querySelector('span')); editor.selection.setRng(range);
      const before = editor.getContent(); open('format', richResult(paragraph('Риск'))); instruction('Убери жирный и красный цвет у Риск');
      await runAndApply();
      const body = editor.getBody();
      assert(body.textContent.replace(/\u00a0/g, ' ') === 'До Риск после');
      assert([...body.querySelectorAll('strong')].every(node => !node.textContent.includes('Риск')), editor.getContent());
      assert([...body.querySelectorAll('span[style]')].every(node => !node.textContent.includes('Риск')), editor.getContent());
      assert([...body.querySelectorAll('strong')].some(node => node.textContent.includes('До')) && [...body.querySelectorAll('strong')].some(node => node.textContent.includes('после')), 'Outside formatting was changed');
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Custom response previews and inserts real headings, lists, links, code and colors, not Markdown or JSON', async () => {
      editor.setContent('<p>Снаружи до</p><p>Заменить это</p><p>И это</p><p>Снаружи после</p>'); editor.focus();
      const paragraphs = editor.getBody().querySelectorAll('p'), range = doc.createRange();
      range.setStartBefore(paragraphs[1]); range.setEndAfter(paragraphs[2]); editor.selection.setRng(range);
      editor.undoManager.clear(); editor.undoManager.add(); const before = editor.getContent();
      open('custom', richResult(
        { type: 'heading', level: 2, content: [{ type: 'text', text: 'План' }] },
        paragraph('Важно', { bold: true, color: '#ff0000' }),
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Первый')] }, { type: 'listItem', content: [paragraph('Второй', { italic: true, href: '/display/TEST/Page' })] }] },
        { type: 'codeBlock', text: '<tag>\nстрока' }
      ));
      instruction('Сделай читаемый план'); buttons()[0].click(); await tick();
      assert(root.querySelector('.result-pane h2').textContent === 'План');
      assert(root.querySelectorAll('.result-pane li').length === 2);
      assert(editor.getContent() === before);
      buttons()[1].click(); await tick(120);
      assert(!document.getElementById('md-exporter-ai-dialog'), root.querySelector('.dialog-status').textContent);
      const body = editor.getBody();
      assert(body.querySelector('h2').textContent === 'План' && body.querySelectorAll('li').length === 2, editor.getContent());
      assert(body.querySelector('a').getAttribute('href') === '/display/TEST/Page');
      assert(body.querySelector('pre').textContent === '<tag>\nстрока'); assert(!body.querySelector('tag'));
      assert(body.firstElementChild.textContent === 'Снаружи до' && body.lastElementChild.textContent === 'Снаружи после');
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Heading and list requests from inside a paragraph produce valid block structure', async () => {
      for (const block of [
        { type: 'heading', level: 2, content: [{ type: 'text', text: 'Обычный текст' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Обычный текст')] }] }
      ]) {
        selectText('<p>Обычный текст</p>'); const before = editor.getContent();
        open('format', richResult(block)); instruction('Оформи структуру'); await runAndApply();
        const body = editor.getBody();
        assert(!body.querySelector('p h2, p ul, p ol'), 'Block nested in paragraph: ' + editor.getContent());
        if (block.type === 'heading') assert(body.querySelector('h2').parentElement === body, editor.getContent());
        else assert(body.querySelector('ul').parentElement === body && body.querySelector('li').textContent === 'Обычный текст', editor.getContent());
        editor.undoManager.undo(); assert(editor.getContent() === before);
      }
    });
    await test('Partial heading selection keeps its level and surrounding text while applying bold/color', async () => {
      selectText('<h2>До <strong>Риск</strong> после</h2>'); const before = editor.getContent();
      open('format', richResult({ type: 'heading', level: 2, content: [{ type: 'text', text: 'Риск', color: '#0000ff', bold: true }] }));
      instruction('Слово Риск синим и жирным'); await runAndApply();
      const body = editor.getBody(); assert(body.querySelectorAll('h2').length === 1 && !body.querySelector('h2 h2'));
      assert(body.querySelector('h2').textContent.replace(/\u00a0/g, ' ') === 'До Риск после');
      assert(body.querySelector('span').style.color === 'rgb(0, 0, 255)');
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Formatting inside a link preserves its URL and unselected linked text without nested anchors', async () => {
      selectText('<p><a href="/display/TEST/Page">До <strong>Риск</strong> после</a></p>'); const before = editor.getContent();
      open('format', richResult(paragraph('Риск', { bold: true, color: '#0000ff', href: '/display/TEST/Page' })));
      instruction('Риск синим, сохрани ссылку'); await runAndApply();
      const body = editor.getBody(); assert(!body.querySelector('a a'), 'Nested links: ' + editor.getContent());
      assert(body.textContent.replace(/\u00a0/g, ' ') === 'До Риск после');
      for (const word of ['До', 'Риск', 'после']) assert([...body.querySelectorAll('a')].some(a => a.textContent.includes(word) && a.getAttribute('href') === '/display/TEST/Page'), 'Lost linked text: ' + word);
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Removing a link affects only the selected word, not the linked neighbors', async () => {
      selectText('<p><a href="/display/TEST/Page">До <strong>Риск</strong> после</a></p>'); const before = editor.getContent();
      open('format', richResult(paragraph('Риск'))); instruction('Убери ссылку и жирный только у Риск'); await runAndApply();
      const body = editor.getBody(); assert(![...body.querySelectorAll('a')].some(a => a.textContent.includes('Риск')));
      assert([...body.querySelectorAll('a')].some(a => a.textContent.includes('До')) && [...body.querySelectorAll('a')].some(a => a.textContent.includes('после')));
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Formatting two selected list items preserves the third item and does not nest lists', async () => {
      editor.setContent('<ul><li>первый</li><li>второй</li><li>снаружи</li></ul>'); editor.focus();
      const items = editor.getBody().querySelectorAll('li'), range = doc.createRange();
      range.setStart(items[0].firstChild, 0); range.setEnd(items[1].firstChild, items[1].textContent.length); editor.selection.setRng(range);
      editor.undoManager.clear(); editor.undoManager.add(); const before = editor.getContent();
      const snapshot = open('format', null);
      const document = JSON.parse(JSON.stringify(snapshot.source.document));
      function bold(node) { if (node.type === 'text') node.bold = true; if (node.content) node.content.forEach(bold); } bold(document);
      response = { format: 'rich-text', document }; instruction('Выдели жирным'); await runAndApply();
      const body = editor.getBody(); assert(body.querySelectorAll('ul').length === 1 && body.querySelectorAll('li').length === 3, editor.getContent());
      const after = body.querySelectorAll('li'); assert(after[0].querySelector('strong') && after[1].querySelector('strong'));
      assert(after[2].textContent === 'снаружи' && !after[2].querySelector('strong'));
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Rejected rich insertion rolls formatting cleanup back, preserving original text and markup', async () => {
      selectText(); const before = editor.getContent(); open('custom', richResult(paragraph('исправлено'))); instruction('исправь');
      buttons()[0].click(); await tick(); const insert = editor.selection.setContent; editor.selection.setContent = () => {};
      try {
        buttons()[1].click(); await tick(120);
        assert(root.querySelector('dialog').open && root.querySelector('.dialog-status').textContent.includes('не применил'), 'Dialog: ' + root.querySelector('dialog').open + '; status: ' + root.querySelector('.dialog-status').textContent);
        assert(editor.getContent() === before, 'Failed rich replacement left partial RemoveFormat changes: ' + editor.getContent() + ' !== ' + before);
      } finally { editor.selection.setContent = insert; buttons()[2].click(); await tick(); }
    });
    await test('Format-only text changes are rejected in MAIN world even if background validation is bypassed', async () => {
      selectText(); const before = editor.getContent(); open('format', richResult(paragraph('Новый текст'))); instruction('жирным');
      buttons()[0].click(); await tick(); buttons()[1].click(); await tick(120);
      assert(root.querySelector('.dialog-status').textContent.includes('изменил текст')); assert(editor.getContent() === before);
      buttons()[2].click(); await tick();
    });
    await test('Spelling keeps bold, color and links while highlighting formatted diff and applying corrections', async () => {
      selectText('<p>До <a href="/display/TEST/Page"><strong><span style="color:red">ошипка</span></strong></a> после</p>');
      const before = editor.getContent();
      open('spelling', richResult(paragraph('ошибка', { bold: true, color: '#ff0000', href: '/display/TEST/Page' })));
      buttons()[0].click(); await tick();
      const result = root.querySelector('.result-pane .rich-preview');
      assert(result.querySelector('ins strong') && result.querySelector('a').getAttribute('href') === '/display/TEST/Page');
      assert(result.querySelector('ins').textContent.includes('и'));
      assert(editor.getContent() === before);
      buttons()[1].click(); await tick(120);
      assert(editor.getBody().textContent.replace(/\u00a0/g, ' ') === 'До ошибка после');
      assert(editor.getBody().querySelector('strong a, a strong'));
      editor.undoManager.undo(); assert(editor.getContent() === before);
    });
    await test('Spelling rejects changed formatting at the editor boundary', async () => {
      selectText(); const before = editor.getContent();
      open('spelling', richResult(paragraph('ошибка')));
      buttons()[0].click(); await tick(); buttons()[1].click(); await tick(120);
      assert(root.querySelector('.dialog-status').textContent.includes('оформление'));
      assert(editor.getContent() === before); buttons()[2].click(); await tick();
    });
    await test('Fixed actions and both diagram syntaxes preview through the real TinyMCE API', async () => {
      for (const [action, result] of Object.entries({ json: '{"key":true}' })) {
        selectText(); open(action, result); await tick(160); await runAndApply();
        assert(editor.getBody().innerText.replace(/\u00a0/g, ' ').includes(result), action + ' lost replacement text or line breaks: ' + editor.getBody().innerText);
        assert(!editor.getBody().querySelector('#md-exporter-list-button, #md-exporter-ai-dialog'), 'UI leaked into editor');
      }
      for (const source of ['@startuml\nA -> B\n@enduml', 'graph TD\nA-->B']) {
        selectText('<p>' + source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>');
        const snapshot = open('diagram', source);
        assert(snapshot.source.replace(/\n/g, '') === source.replace(/\n/g, ''), 'Diagram source changed during capture');
        await runAndApply();
        assert(editor.getBody().innerText.includes(source.split('\n')[0]));
      }
    });
    await test('After mode inserts the answer at the end of selection and keeps the selected text', async () => {
      selectText(); open('custom', ' дополнение'); instruction('Добавь текст после выделения');
      buttons()[0].click(); await tick();
      root.querySelector('input[name="applyMode"][value="after"]').click();
      buttons()[1].click(); await tick(120);
      assert(!document.getElementById('md-exporter-ai-dialog'));
      assert(editor.getBody().innerText.replace(/\s+/g, ' ').includes('До ошипка дополнение после'));
    });
    await test('Table text and colors affect only forty selected cells; one undo restores all changes', async () => {
      selectText('<table><tbody>' + Array.from({ length: 20 }, () => '<tr><td data-mce-selected="1"><b>да</b></td><td data-mce-selected="1">нет</td><td>снаружи</td></tr>').join('') + '</tbody></table>');
      const cells = [...editor.getBody().querySelectorAll('td')];
      cells.forEach((cell, i) => { if (i % 3 !== 2) cell.setAttribute('data-mce-selected', '1'); });
      const range = doc.createRange(); range.selectNodeContents(cells[0]); editor.selection.setRng(range);
      const before = editor.getContent();
      const snapshot = open('table', null);
      response = { cells: snapshot.source.cells.map(cell => ({ id: cell.id, backgroundColor: cell.text === 'да' ? '#e3fcef' : '#fff0b3', ...(cell.id === 'c1' ? { text: 'Нет' } : {}) })) };
      assert(snapshot.source.cells.length === 40, 'Wrong cell count'); instruction('да зеленым, нет желтым');
      await tick(200); await runAndApply();
      for (const row of editor.getBody().querySelectorAll('tr')) {
        assert(row.cells[0].style.backgroundColor === 'rgb(227, 252, 239)' && row.cells[0].querySelector('strong, b'));
        assert(row.cells[1].style.backgroundColor === 'rgb(255, 240, 179)');
        assert(!row.cells[2].style.backgroundColor && row.cells[2].textContent === 'снаружи');
      }
      assert(cells[1].textContent === 'Нет');
      editor.undoManager.undo(); assert(editor.getContent() === before, 'Table undo failed');
    });
    await test('Cancel restores selection without changing document', async () => {
      selectText(); const before = editor.getContent(); open('custom', 'no'); instruction('cancel me');
      buttons()[2].click(); await tick();
      assert(editor.getContent() === before); assert(editor.selection.getContent({ format: 'text' }) === 'ошипка', 'Selection was not restored');
    });
    await test('Stale content is not overwritten and application error stays visible', async () => {
      selectText(); open('custom', 'no'); instruction('change'); buttons()[0].click(); await tick();
      editor.getBody().querySelector('strong').textContent = 'новая правка';
      buttons()[1].click(); await tick(120);
      assert(root.querySelector('dialog').open, 'Error dialog disappeared');
      assert(root.querySelector('.dialog-status').textContent.includes('изменился'), 'Unexpected status: ' + root.querySelector('.dialog-status').textContent);
      assert(root.activeElement === root.querySelector('.dialog-status'), 'Application error is not focused and visible');
      assert(!buttons()[1].disabled, 'Apply stays permanently disabled after failure');
      assert(editor.getBody().textContent.includes('новая правка')); buttons()[2].click(); await tick();
    });
    await test('Silent TinyMCE insertion refusal produces a visible error instead of success', async () => {
      selectText(); const before = editor.getContent(); open('custom', 'исправлено'); instruction('change');
      buttons()[0].click(); await tick();
      const insert = editor.insertContent; editor.insertContent = () => {};
      try {
        buttons()[1].click(); await tick(120);
        assert(root.querySelector('dialog').open, 'Silent failure closed dialog');
        assert(root.querySelector('.dialog-status').textContent.includes('не применил'), 'Unexpected status: ' + root.querySelector('.dialog-status').textContent);
        assert(editor.getContent() === before, 'Silent failure changed document: ' + editor.getContent() + ' !== ' + before);
      } finally { editor.insertContent = insert; buttons()[2].click(); await tick(); }
    });
    await test('Escape closes the custom prompt and restores the editor selection', async () => {
      selectText(); const before = editor.getContent(); open('custom', 'no'); instruction('escape');
      root.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
      await tick(); assert(!document.getElementById('md-exporter-ai-dialog'));
      assert(editor.getContent() === before && editor.selection.getContent({ format: 'text' }) === 'ошипка');
    });
    await test('Native context menu losing its DOM selection still uses the recorded selection', () => {
      selectText(); doc.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      editor.selection.collapse(true);
      const snapshot = api.capture('custom'); assert(snapshot.source.text === 'ошипка'); api.apply(snapshot.id, 'исправлено');
      assert(editor.getBody().textContent.replace(/\u00a0/g, ' ') === 'До исправлено после');
    });
    // User-driven smoke check with real keyboard events through browser tools.
    const manual = document.createElement('button'); manual.textContent = 'Открыть свободный ввод для ручной проверки'; document.body.appendChild(manual);
    manual.onclick = () => {
      selectText('<p>Черновик плана: проверить требования, выделить риски</p>');
      open('custom', richResult(
        { type: 'heading', level: 2, content: [{ type: 'text', text: 'План проверки' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Проверить требования')] }, { type: 'listItem', content: [paragraph('Выделить риски', { bold: true, color: '#ff0000' })] }] }
      ));
    };
    const manualFormat = document.createElement('button'); manualFormat.textContent = 'Открыть оформление для ручной проверки'; document.body.appendChild(manualFormat);
    manualFormat.onclick = () => { selectText('<p>До <strong>Риск</strong> после</p>'); open('format', richResult(paragraph('Риск', { bold: true, color: '#ff0000' }))); };
  } catch (error) { failed++; const li = document.createElement('li'); li.textContent = 'FAIL: fixture: ' + error.message; results.appendChild(li); }
  document.title = failed ? 'FAIL: TinyMCE ' + failed : 'PASS: TinyMCE AI integration';
  document.body.dataset.result = failed ? 'fail' : 'pass';
})();
