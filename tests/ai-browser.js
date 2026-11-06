/* Open ai-browser.html in Chromium. Tests require no provider or credentials. */
(async function () {
  'use strict';
  const api = window.MDExporterAISelection;
  const editor = document.getElementById('editor');
  const results = document.getElementById('results');
  let failed = 0;
  function assert(value, message) { if (!value) throw new Error(message || 'Assertion failed'); }
  function select(node) {
    editor.focus();
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }
  async function test(name, fn) {
    const li = document.createElement('li');
    try { await fn(); li.textContent = 'PASS: ' + name; }
    catch (error) { failed++; li.textContent = 'FAIL: ' + name + ': ' + error.message; }
    results.appendChild(li);
  }
  await test('Plain text replaces only selection, does not execute HTML, supports undo', () => {
    editor.innerHTML = '<p>До <span>Превет</span> после</p>';
    select(editor.querySelector('span'));
    const snapshot = api.capture('custom');
    api.apply(snapshot.id, '<img src=x onerror=alert(1)>');
    // Chromium may use NBSP around inline selection boundaries.
    assert(editor.textContent.replace(/\u00a0/g, ' ') === 'До <img src=x onerror=alert(1)> после', 'Actual replacement: ' + JSON.stringify(editor.textContent));
    assert(!editor.querySelector('img'));
    document.execCommand('undo');
    assert(editor.textContent === 'До Превет после', 'Undo did not restore original');
  });
  await test('Stale document cannot be overwritten', () => {
    editor.innerHTML = '<p>Превет</p>'; select(editor.firstChild);
    const snapshot = api.capture('custom');
    editor.firstChild.append(' новая правка');
    let rejected = false;
    try { api.apply(snapshot.id, 'Привет'); } catch (_) { rejected = true; }
    assert(rejected && editor.textContent.includes('новая правка'));
  });
  await test('Blur, collapsed selection and identical DOM re-render cannot move the saved replacement', () => {
    editor.innerHTML = '<p>До <span>ошипка</span> после</p>'; select(editor.querySelector('span'));
    const snapshot = api.capture('custom');
    window.getSelection().collapseToStart();
    editor.innerHTML = editor.innerHTML;
    document.getElementById('input').focus();
    api.apply(snapshot.id, 'исправлено');
    assert(editor.textContent.replace(/\u00a0/g, ' ') === 'До исправлено после');
  });
  await test('Contextmenu preserves selection even after native menu collapses it', () => {
    editor.innerHTML = '<p>До <span>ошипка</span> после</p>'; select(editor.querySelector('span'));
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    window.getSelection().collapseToEnd();
    const snapshot = api.capture('custom'); assert(snapshot.source.text === 'ошипка');
    api.apply(snapshot.id, 'исправлено'); assert(editor.textContent.replace(/\u00a0/g, ' ').includes('До исправлено'));
  });
  await test('Contextmenu snapshot cannot capture a changed document', () => {
    editor.innerHTML = '<p>ошипка</p>'; select(editor.firstChild);
    document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); editor.firstChild.append(' новое');
    let rejected = false; try { api.capture('custom'); } catch (_) { rejected = true; }
    assert(rejected && editor.textContent === 'ошипка новое');
  });
  await test('Read-only page text is captured for analysis but cannot be replaced', () => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('h1'));
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    const snapshot = api.capture('spelling');
    assert(snapshot.readOnly && snapshot.source.includes('AI browser regression tests'));
    let rejected = false;
    try { api.apply(snapshot.id, 'Привет'); } catch (_) { rejected = true; }
    assert(rejected);
    api.discard(snapshot.id);
  });
  await test('Expandable blocks, macros, images and canvas are captured as safe read-only text', () => {
    editor.innerHTML = '<details><summary>Подробности</summary><p>Скрытое требование</p></details><div data-macro-name="info"><p>Текст макроса</p></div><p><img alt="Схема архитектуры"><canvas></canvas></p>';
    select(editor);
    const snapshot = api.capture('spelling');
    assert(snapshot.readOnly, 'Complex selection must be read-only');
    for (const text of ['Подробности', 'Скрытое требование', 'Текст макроса', 'Схема архитектуры', '[Диаграмма]']) assert(snapshot.source.includes(text), text);
    let rejected = false;
    try { api.apply(snapshot.id, 'Замена'); } catch (_) { rejected = true; }
    assert(rejected && editor.querySelector('details') && editor.querySelector('canvas'));
    api.discard(snapshot.id);
  });
  await test('Textarea replacement preserves surrounding text and supports undo', () => {
    const input = document.getElementById('input'); input.focus(); input.setSelectionRange(0, 6);
    const snapshot = api.capture('custom'); api.apply(snapshot.id, 'новый');
    assert(input.value === 'новый текст'); document.execCommand('undo'); assert(input.value === 'старый текст');
  });
  await test('Captured selection survives a delayed AI operation and focus changes', async () => {
    editor.innerHTML = '<p>До <span>ошипка</span> после</p>'; select(editor.querySelector('span'));
    const snapshot = api.capture('custom');
    await new Promise(resolve => setTimeout(resolve, 200));
    api.apply(snapshot.id, 'исправлено');
    assert(editor.textContent.replace(/\u00a0/g, ' ') === 'До исправлено после');
  });
  const rich = window.MDExporterAIRichText;
  const richResult = (text, attrs = {}) => ({ format: 'rich-text', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...attrs }] }] } });
  await test('Capture includes the selected heading, inherited bold, named colors and safe link only', () => {
    editor.innerHTML = '<h2>Снаружи <a href="/display/TEST/Page"><strong><span style="color:red">Риск</span></strong></a> после</h2>';
    select(editor.querySelector('span'));
    const snapshot = api.capture('custom'); const document = snapshot.source.document;
    assert(snapshot.source.format === 'rich-text' && rich.text(document) === 'Риск');
    assert(document.content[0].type === 'heading' && document.content[0].level === 2);
    const text = document.content[0].content[0]; assert(text.bold && text.color === '#ff0000' && text.href === '/display/TEST/Page');
    assert(!JSON.stringify(snapshot.source).includes('Снаружи')); api.discard(snapshot.id);
  });
  await test('Format-only bold and color keep surrounding text and one paragraph; undo restores markup', () => {
    editor.innerHTML = '<p>До <span>Риск</span> после</p>'; select(editor.querySelector('span'));
    const before = editor.innerHTML, snapshot = api.capture('format');
    api.apply(snapshot.id, richResult('Риск', { bold: true, color: '#ff0000' }));
    assert(editor.querySelectorAll('p').length === 1 && editor.querySelector('strong').textContent === 'Риск');
    assert(editor.querySelector('span[style]').style.color === 'rgb(255, 0, 0)');
    assert(editor.textContent.replace(/\u00a0/g, ' ') === 'До Риск после');
    document.execCommand('undo'); assert(editor.innerHTML === before);
  });
  await test('Rich result rejects executable attributes and format-only text changes before mutation', () => {
    editor.innerHTML = '<p>Риск</p>'; select(editor.firstChild);
    const snapshot = api.capture('format'), before = editor.innerHTML;
    for (const response of [richResult('новый Риск'), richResult('Риск', { onclick: 'alert(1)' }), richResult('Риск', { href: 'javascript:alert(1)' })]) {
      let rejected = false; try { api.apply(snapshot.id, response); } catch (_) { rejected = true; }
      assert(rejected && editor.innerHTML === before);
    }
    api.discard(snapshot.id);
  });
  await test('Images use text descriptions in read-only mode; format-only refuses plain input fields', () => {
    editor.innerHTML = '<p>текст<img alt="картинка"></p>'; select(editor.firstChild);
    const snapshot = api.capture('custom');
    assert(snapshot.readOnly && snapshot.source.includes('картинка'));
    let rejected = false; try { api.apply(snapshot.id, 'замена'); } catch (_) { rejected = true; } assert(rejected);
    api.discard(snapshot.id);
    const input = document.getElementById('input'); input.focus(); input.setSelectionRange(0, 6);
    rejected = false; try { api.capture('format'); } catch (_) { rejected = true; } assert(rejected);
  });
  let transactions = 0;
  window.tinymce = { editors: [{ getBody: () => editor, undoManager: { transact: fn => { transactions++; fn(); } }, nodeChanged() {}, setDirty() {}, fire() {} }] };
  await test('Selected table rectangle changes only selected cells and preserves markup', () => {
    editor.innerHTML = '<table><tbody><tr><td data-mce-selected="1"><b>да</b></td><td data-mce-selected="1">нет</td><td>снаружи</td></tr></tbody></table>';
    select(editor.querySelector('td'));
    const snapshot = api.capture('table');
    assert(snapshot.source.cells.length === 2);
    api.apply(snapshot.id, { cells: [{ id: 'c0', backgroundColor: '#e3fcef' }, { id: 'c1', backgroundColor: '#fff0b3' }] });
    const cells = editor.querySelectorAll('td');
    assert(cells[0].style.backgroundColor === 'rgb(227, 252, 239)');
    assert(cells[1].style.backgroundColor === 'rgb(255, 240, 179)');
    assert(cells[0].querySelector('b') && !cells[2].getAttribute('style'));
    assert(transactions === 1);
  });
  await test('Two selected columns across twenty rows are colored without touching the third column', () => {
    editor.innerHTML = '<table><tbody>' + Array.from({ length: 20 }, () => '<tr><td data-mce-selected="1">да</td><td data-mce-selected="1">нет</td><td>не менять</td></tr>').join('') + '</tbody></table>';
    select(editor.querySelector('td'));
    const snapshot = api.capture('table'); assert(snapshot.source.cells.length === 40);
    // Losing TinyMCE's transient selection markers is not a content edit.
    for (const cell of editor.querySelectorAll('[data-mce-selected]')) cell.removeAttribute('data-mce-selected');
    api.apply(snapshot.id, { cells: snapshot.source.cells.map(cell => ({ id: cell.id, backgroundColor: cell.text === 'да' ? '#e3fcef' : '#fff0b3' })) });
    for (const row of editor.querySelectorAll('tr')) {
      assert(row.cells[0].style.backgroundColor === 'rgb(227, 252, 239)');
      assert(row.cells[1].style.backgroundColor === 'rgb(255, 240, 179)');
      assert(!row.cells[2].getAttribute('style') && row.cells[2].textContent === 'не менять');
    }
  });
  await test('Invalid table response is rejected atomically', () => {
    select(editor.querySelector('td')); const snapshot = api.capture('table'); const before = editor.innerHTML;
    let rejected = false;
    try { api.apply(snapshot.id, { cells: [{ id: 'c0', text: 'changed' }, { id: 'c9', text: 'wrong' }] }); } catch (_) { rejected = true; }
    assert(rejected && editor.innerHTML === before);
  });
  await test('Cancelled snapshot cannot be applied', () => {
    editor.innerHTML = '<p>Original</p>'; select(editor.firstChild);
    const snapshot = api.capture('custom'); api.discard(snapshot.id);
    let rejected = false; try { api.apply(snapshot.id, 'Changed'); } catch (_) { rejected = true; }
    assert(rejected && editor.textContent === 'Original');
  });
  await test('TinyMCE iframe body is not modified by opening the preview dialog', async () => {
    const frame = document.createElement('iframe'); document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.body.contentEditable = 'true'; doc.body.innerHTML = '<p>Original</p>';
    const load = path => new Promise((resolve, reject) => { const script = doc.createElement('script'); script.src = path; script.onload = resolve; script.onerror = reject; doc.head.appendChild(script); });
    await load('../lib/ai-rich-text.js');
    await load('../lib/ai-preview.js');
    await load('../content/ai-selection.js');
    let listener, dialogRoot, lastPrompt;
    const attach = frame.contentWindow.Element.prototype.attachShadow;
    frame.contentWindow.Element.prototype.attachShadow = function (options) { const shadow = attach.call(this, options); if (this.id === 'md-exporter-ai-dialog') dialogRoot = shadow; return shadow; };
    frame.contentWindow.chrome = { runtime: {
      onMessage: { addListener: fn => { listener = fn; } },
      sendMessage: async message => {
        if (message.type === 'md-ai-run') { lastPrompt = message.prompt; return { ok: true, result: 'AI replacement' }; }
        if (message.type === 'md-ai-apply') {
          try { frame.contentWindow.MDExporterAISelection.apply(message.id, 'AI replacement', message.mode); return { ok: true }; }
          catch (error) { return { ok: false, error: error.message }; }
        }
        if (message.type === 'md-ai-close') frame.contentWindow.MDExporterAISelection.discard(message.id);
        return { ok: true };
      }
    } };
    await load('../content/ai-ui.js');
    doc.body.focus(); const range = doc.createRange(); range.selectNodeContents(doc.querySelector('p'));
    const selection = frame.contentWindow.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const snapshot = frame.contentWindow.MDExporterAISelection.capture('spelling');
    listener({ type: 'md-ai-open', action: 'spelling', snapshot });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert(doc.body.innerHTML === '<p>Original</p>', 'Dialog polluted the editable body');
    dialogRoot.querySelector('dialog').close();
    frame.contentWindow.MDExporterAISelection.apply(snapshot.id, richResult('Corrected'));
    assert(doc.body.textContent === 'Corrected');
    const tick = () => new Promise(resolve => setTimeout(resolve, 30));
    const buttons = () => [
      dialogRoot.querySelector('.dialog-actions .primary'),
      dialogRoot.querySelector('.dialog-actions .apply'),
      dialogRoot.querySelector('.dialog-actions > button:first-child')
    ];
    await test('UI sends custom prompt, previews without mutation, applies only on confirmation', async () => {
      doc.body.focus(); const range = doc.createRange(); range.selectNodeContents(doc.body.firstChild || doc.body);
      selection.removeAllRanges(); selection.addRange(range);
      const snapshot = frame.contentWindow.MDExporterAISelection.capture('custom');
      listener({ type: 'md-ai-open', action: 'custom', snapshot });
      dialogRoot.querySelector('textarea').value = 'короткая инструкция';
      buttons()[0].click(); await tick();
      assert(lastPrompt === 'короткая инструкция');
      assert(dialogRoot.querySelector('.result-pane .pane-content pre').textContent === 'AI replacement');
      assert(doc.body.textContent === 'Corrected', 'Preview mutated the editor');
      buttons()[1].click(); await tick();
      assert(doc.body.textContent === 'AI replacement');
    });
    await test('UI cancellation after preview leaves original text unchanged', async () => {
      doc.body.focus(); const range = doc.createRange(); range.selectNodeContents(doc.body);
      selection.removeAllRanges(); selection.addRange(range);
      const snapshot = frame.contentWindow.MDExporterAISelection.capture('spelling');
      listener({ type: 'md-ai-open', action: 'spelling', snapshot });
      const before = doc.body.innerHTML;
      buttons()[0].click(); await tick(); buttons()[2].click(); await tick();
      assert(doc.body.innerHTML === before);
      let rejected = false;
      try { frame.contentWindow.MDExporterAISelection.apply(snapshot.id, 'should not apply'); } catch (_) { rejected = true; }
      assert(rejected);
    });
    frame.remove();
  });
  document.title = failed ? 'FAIL: ' + failed : 'PASS: AI browser tests';
  document.body.dataset.result = failed ? 'fail' : 'pass';
})();
