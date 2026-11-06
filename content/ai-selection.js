/* MAIN world: editor access only. Credentials never enter this module. */
(function () {
  'use strict';
  if (window.MDExporterAISelection) return;
  const Rich = window.MDExporterAIRichText;
  const snapshots = new Map();
  let contextSelection = null;
  const EDITABLE = '[contenteditable="true"], [contenteditable=""], .mce-content-body';
  const element = node => node && (node.nodeType === 1 ? node : node.parentElement);
  function editorFor(scope) {
    for (const host of [window, window.parent]) {
      try {
        const tiny = host.tinymce;
        const editors = tiny ? [...Array.from(tiny.editors || []), tiny.activeEditor] : [];
        for (const editor of editors) if (editor && editor.getBody() === scope) return editor;
      } catch (_) { /* cross-origin parent */ }
    }
    return null;
  }
  function fingerprint(scope) {
    const clone = scope.cloneNode(true);
    for (const node of clone.querySelectorAll('[data-mce-type="bookmark"], [data-mce-bogus="all"], .mce-visual-caret')) node.remove();
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of ['data-mce-selected', 'data-mce-first-selected', 'data-mce-last-selected', 'aria-selected']) node.removeAttribute(attr);
      for (const name of ['selectedCell', 'ak-editor-selected-cell']) node.classList.remove(name);
      if (!node.className) node.removeAttribute('class');
    }
    return clone.innerHTML;
  }
  function rangeText(range) {
    const box = document.createElement('div');
    box.appendChild(range.cloneContents());
    for (const image of box.querySelectorAll('img')) image.replaceWith(document.createTextNode(image.getAttribute('alt') || image.getAttribute('title') || '[Изображение]'));
    for (const diagram of box.querySelectorAll('canvas')) diagram.replaceWith(document.createTextNode('[Диаграмма]'));
    for (const frame of box.querySelectorAll('iframe, object, embed')) frame.replaceWith(document.createTextNode('[Встроенный блок]'));
    for (const macro of box.querySelectorAll('[data-macro-name]')) {
      if (!macro.textContent.trim()) macro.textContent = '[Макрос: ' + macro.getAttribute('data-macro-name') + ']';
    }
    for (const br of box.querySelectorAll('br')) br.replaceWith('\n');
    for (const block of box.querySelectorAll('p, div, li, pre, details, summary, section, article, tr, table, ul, ol')) block.appendChild(document.createTextNode('\n'));
    return box.textContent.replace(/\n+$/, '');
  }
  function mainScope() {
    return document.querySelector('#main-content, .wiki-content, [data-content-body], main article') || document.body;
  }
  function rangeDocument(range, scope) {
    let wrapper = range.cloneContents();
    // Include enclosing marks/heading, never unselected text from the block.
    for (let parent = element(range.commonAncestorContainer); parent && parent !== scope && !/^(TD|TH)$/.test(parent.tagName); parent = parent.parentElement) {
      const outer = parent.cloneNode(false); outer.appendChild(wrapper); wrapper = outer;
      if (/^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(parent.tagName)) break;
    }
    const container = document.createElement('div'); container.appendChild(wrapper);
    return Rich.fromDOM(container);
  }
  // DOM Ranges are live: blur, normalize() and editor selection restoration
  // can move their boundaries. Keep immutable paths instead, and resolve them
  // only after checking that the document content has not changed.
  function boundary(scope, node, offset) {
    const path = [];
    while (node !== scope) {
      const parent = node.parentNode;
      if (!parent) throw new Error('Выделение недоступно. Повторите команду.');
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
      node = parent;
    }
    return { path, offset };
  }
  function bookmark(scope, range) {
    return { start: boundary(scope, range.startContainer, range.startOffset), end: boundary(scope, range.endContainer, range.endOffset) };
  }
  function restoreRange(saved) {
    const resolve = point => point.path.reduce((node, index) => node && node.childNodes[index], saved.scope);
    const range = document.createRange();
    const start = resolve(saved.bookmark.start), end = resolve(saved.bookmark.end);
    if (!start || !end) throw new Error('Выделение недоступно. Повторите команду.');
    try {
      range.setStart(start, saved.bookmark.start.offset); range.setEnd(end, saved.bookmark.end.offset);
    } catch (_) { throw new Error('Не удалось восстановить исходное выделение. Выделите фрагмент заново.'); }
    return range;
  }
  document.addEventListener('contextmenu', () => {
    contextSelection = null;
    const active = document.activeElement;
    if (active && /^(TEXTAREA|INPUT)$/.test(active.tagName) && active.selectionStart !== active.selectionEnd) {
      contextSelection = { input: active, start: active.selectionStart, end: active.selectionEnd, before: active.value, created: Date.now() };
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const startElement = element(range.startContainer);
    const editable = startElement && startElement.closest(EDITABLE);
    const scope = editable || document.body;
    if (scope && scope.contains(range.endContainer)) contextSelection = { scope, bookmark: bookmark(scope, range), before: fingerprint(scope), created: Date.now() };
  }, true);
  function capture(action) {
    const remembered = contextSelection && Date.now() - contextSelection.created < 60000 ? contextSelection : null;
    contextSelection = null;
    const active = remembered ? remembered.input || null : document.activeElement;
    if (remembered && remembered.input && (!active.isConnected || active.readOnly || active.disabled)) throw new Error('Исходное поле недоступно для редактирования. Повторите команду.');
    let snapshot;
    if (active && /^(TEXTAREA|INPUT)$/.test(active.tagName) && !active.readOnly && !active.disabled && (active.tagName === 'TEXTAREA' || /^(text|search|url|tel)$/.test(active.type))) {
      if (remembered && remembered.input && active.value !== remembered.before) throw new Error('Исходный текст изменился. Повторите команду.');
      const start = remembered && remembered.input ? remembered.start : active.selectionStart;
      const end = remembered && remembered.input ? remembered.end : active.selectionEnd;
      if (action === 'format') throw new Error('Оформление недоступно в обычном текстовом поле. Выделите текст в визуальном редакторе Confluence.');
      if (action === 'table') throw new Error('Выделите ячейки в редакторе Confluence.');
      if (start == null || start === end) {
        if (action !== 'review') throw new Error('Сначала выделите текст.');
        snapshot = { input: active, start: 0, end: active.value.length, before: active.value, source: active.value };
      } else {
        snapshot = { input: active, start, end, before: active.value, source: active.value.slice(start, end) };
      }
    } else {
      const selection = window.getSelection();
      if (remembered && remembered.scope && (!remembered.scope.isConnected || fingerprint(remembered.scope) !== remembered.before)) throw new Error('Документ изменился. Выделите фрагмент заново.');
      const range = remembered && remembered.scope ? restoreRange(remembered) : selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      const startElement = range && element(range.startContainer);
      const editable = startElement && startElement.closest(EDITABLE);
      const scope = editable || document.body;
      if (!range || range.collapsed || !scope.contains(range.endContainer)) {
        if (action !== 'review') throw new Error('Сначала выделите текст на странице.');
        // Проверка документа целиком: выделение не требуется, берём всё содержимое страницы или редактора.
        const docScope = editable || mainScope();
        const docRange = document.createRange();
        docRange.selectNodeContents(docScope);
        const text = rangeText(docRange);
        if (!text.trim()) throw new Error('Не удалось извлечь текст документа. Откройте страницу Confluence и повторите команду.');
        snapshot = { scope: docScope, wholeDocument: true, before: fingerprint(docScope), readOnly: true, text, source: text };
      } else {
      const editor = editable ? editorFor(scope) : null;
      const nonEditable = !editable || !!element(range.startContainer).closest('[contenteditable="false"]') || !!element(range.endContainer).closest('[contenteditable="false"]');
      snapshot = { scope, bookmark: bookmark(scope, range), editor, before: fingerprint(scope), readOnly: nonEditable };
      if (action === 'table') {
        if (nonEditable) throw new Error('Для изменения ячеек откройте страницу в режиме редактирования.');
        const markers = Array.from(scope.querySelectorAll('td[data-mce-selected], th[data-mce-selected], td.selectedCell, th.selectedCell, td.ak-editor-selected-cell, th.ak-editor-selected-cell, td[aria-selected="true"], th[aria-selected="true"]'));
        const cells = markers.length ? markers : Array.from(scope.querySelectorAll('td, th')).filter(cell => !range.collapsed && range.intersectsNode(cell));
        if (!cells.length || cells.some(cell => cell.closest('table') !== cells[0].closest('table') || cell.closest('[contenteditable="false"]'))) throw new Error('Выделите ячейки одной таблицы.');
        snapshot.cells = cells;
        snapshot.source = { cells: cells.map((cell, i) => ({ id: 'c' + i, row: cell.parentElement.rowIndex + 1, column: cell.cellIndex + 1, text: cell.innerText, backgroundColor: cell.style.backgroundColor, color: cell.style.color })) };
      } else {
        if (range.collapsed) throw new Error('Сначала выделите текст.');
        const fragment = range.cloneContents();
        const differentCells = element(range.startContainer).closest('td, th') !== element(range.endContainer).closest('td, th');
        const complex = nonEditable || differentCells || !!fragment.querySelector('table, td, th, tr, [contenteditable="false"], img, iframe, object, embed, svg, canvas, video, audio, input, textarea, button');
        snapshot.text = rangeText(range);
        if (!snapshot.text.trim()) throw new Error('В выделении нет текста или текстового описания блока.');
        snapshot.source = snapshot.text;
        snapshot.readOnly = complex;
        if (['custom', 'format', 'spelling'].includes(action) && !complex) {
          snapshot.inline = !fragment.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, hr');
          snapshot.source = { format: 'rich-text', text: snapshot.text, document: rangeDocument(range, scope) };
          snapshot.action = action;
        }
      }
      }
    }
    const size = JSON.stringify(snapshot.source).length;
    if (size > 100000) throw new Error('Слишком большой объём текста. Лимит: 100 000 символов на один запрос.');
    const id = crypto.randomUUID();
    snapshots.clear();
    snapshots.set(id, snapshot);
    setTimeout(() => snapshots.delete(id), 10 * 60 * 1000);
    return { id, source: snapshot.source, readOnly: !!snapshot.readOnly };
  }
  function apply(id, result, mode = 'replace') {
    const saved = snapshots.get(id);
    if (!saved) throw new Error('Выделение устарело. Повторите команду.');
    if (!['replace', 'after'].includes(mode) || (saved.cells && mode !== 'replace')) throw new Error('Неизвестный способ вставки результата.');
    if (saved.readOnly) throw new Error('Этот блок доступен только для анализа и копирования результата. Автоматическая замена отключена, чтобы не повредить макрос или разметку.');
    const rich = !saved.cells && result && result.format === 'rich-text';
    if (saved.action === 'format' && !rich) throw new Error('Для оформления нужен форматированный ответ AI.');
    if (saved.action === 'spelling' && !rich) throw new Error('Для форматированного текста нужен форматированный ответ AI.');
    let richDocument, richHTML, richInline = false;
    if (rich) {
      if (!saved.source || saved.source.format !== 'rich-text') throw new Error('Форматированный ответ не соответствует выделению.');
      richDocument = Rich.validate(result.document);
      if (saved.action === 'format' && !Rich.sameText(saved.source.document, richDocument)) throw new Error('AI изменил текст вместо оформления. Результат отклонен.');
      if (saved.action === 'spelling' && !Rich.sameFormatting(saved.source.document, richDocument)) throw new Error('AI изменил оформление или структуру текста. Результат отклонен.');
      const beforeBlock = saved.source.document.content[0], afterBlock = richDocument.content[0];
      richInline = saved.inline && saved.source.document.content.length === 1 && richDocument.content.length === 1 && beforeBlock.type === afterBlock.type && beforeBlock.level === afterBlock.level;
      richHTML = Rich.html(richDocument, mode === 'after' ? false : richInline);
    }
    if (saved.input) {
      if (!saved.input.isConnected || saved.input.value !== saved.before || saved.input.readOnly || saved.input.disabled) throw new Error('Исходный текст изменился. Повторите команду.');
      if (typeof result !== 'string') throw new Error('Неверный результат.');
      saved.input.focus();
      const start = mode === 'after' ? saved.end : saved.start;
      saved.input.setSelectionRange(start, saved.end);
      // Native editing command preserves browser undo history when available.
      const insertion = mode === 'after' ? (saved.input.tagName === 'TEXTAREA' ? '\n\n' : ' ') + result : result;
      if (!document.execCommand('insertText', false, insertion)) throw new Error('Поле не поддерживает безопасную вставку.');
    } else {
      if (!saved.scope.isConnected || fingerprint(saved.scope) !== saved.before || !saved.scope.isContentEditable || (saved.cells && saved.cells.some(cell => !saved.scope.contains(cell)))) throw new Error('Документ изменился во время запроса. Выделите фрагмент заново.');
      if (saved.cells) {
        if (!result || !Array.isArray(result.cells)) throw new Error('Неверный результат таблицы.');
        const seen = new Set();
        for (const change of result.cells) {
          if (!/^c\d+$/.test(change.id) || !saved.cells[Number(change.id.slice(1))] || seen.has(change.id)) throw new Error('Неизвестная ячейка.');
          seen.add(change.id);
          for (const key of Object.keys(change)) {
            if (!['id', 'text', 'backgroundColor', 'color'].includes(key) || typeof change[key] !== 'string') throw new Error('Неверное поле ячейки.');
            if (['backgroundColor', 'color'].includes(key) && change[key] !== '' && !/^#[0-9a-f]{6}$/i.test(change[key])) throw new Error('Неверный цвет.');
          }
        }
      } else if (!rich && typeof result !== 'string') throw new Error('Неверный текст.');
      const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const mutate = () => {
        if (saved.editor && saved.editor.focus) saved.editor.focus();
        else saved.scope.focus();
        if (saved.cells) {
          for (const change of result.cells) {
            const cell = saved.cells[Number(change.id.slice(1))];
            if ('text' in change) cell.textContent = change.text;
            for (const key of ['backgroundColor', 'color']) if (key in change) cell.style[key] = change[key];
            // TinyMCE serializes this attribute in preference to style.
            cell.removeAttribute('data-mce-style');
          }
        } else {
          const range = restoreRange(saved);
          if (rangeText(range) !== (saved.text ?? saved.source)) throw new Error('Не удалось восстановить исходное выделение. Выделите фрагмент заново.');
          if (mode === 'after') range.collapse(false);
          const selection = window.getSelection();
          selection.removeAllRanges(); selection.addRange(range);
          if (saved.editor) {
            let listItems;
            const list = element(range.commonAncestorContainer);
            if (mode !== 'after' && rich && list && /^(UL|OL)$/.test(list.tagName)) {
              const type = list.tagName === 'UL' ? 'bulletList' : 'orderedList';
              if (richDocument.content.length !== 1 || richDocument.content[0].type !== type) throw new Error('Для изменения структуры существующего списка выделите список целиком, а не текст внутри пунктов.');
              if ((richDocument.content[0].start || 1) !== (saved.source.document.content[0].start || 1)) throw new Error('Для изменения нумерации выделите список целиком.');
              const items = Array.from(list.children).filter(item => item.tagName === 'LI' && range.intersectsNode(item));
              const first = items[0], last = items[items.length - 1];
              if (!first || !last) throw new Error('Выделите пункты списка целиком.');
              const prefix = document.createRange(); prefix.selectNodeContents(first); prefix.setEnd(range.startContainer, range.startOffset);
              const suffix = document.createRange(); suffix.selectNodeContents(last); suffix.setStart(range.endContainer, range.endOffset);
              if (prefix.toString() || suffix.toString() || prefix.cloneContents().querySelector('img, table, iframe, object, svg, [contenteditable="false"]') || suffix.cloneContents().querySelector('img, table, iframe, object, svg, [contenteditable="false"]')) throw new Error('Для оформления нескольких пунктов списка выделите их текст целиком.');
              listItems = { first, last };
              range.setStartBefore(first); range.setEndAfter(last);
            }
            saved.editor.selection.setRng(range);
            // TinyMCE otherwise inherits an enclosing strong/span even when
            // the returned document explicitly removes that formatting.
            let cleaned, cleanedDocument;
            if (rich && mode !== 'after') {
              saved.editor.execCommand('RemoveFormat');
              // The formatter splits an enclosing link at the selection
              // boundaries, retaining links on unselected neighboring words.
              saved.editor.formatter.remove('link');
              cleaned = fingerprint(saved.scope);
              cleanedDocument = rangeDocument(saved.editor.selection.getRng(), saved.scope);
            }
            if (mode === 'after') {
              const insertionRange = saved.editor.selection.getRng();
              if (!insertionRange.collapsed) {
                insertionRange.collapse(false);
                saved.editor.selection.setRng(insertionRange);
              }
              if (!saved.editor.selection.getRng().collapsed) throw new Error('Не удалось установить точку вставки после выделения. Выделите фрагмент заново.');
            }
            // Inline replacement must not inherit marks from the adjacent
            // word. Structural blocks use TinyMCE's block-aware insertion so
            // headings/lists never become invalid children of a paragraph.
            if (listItems) {
              const itemsRange = document.createRange(); itemsRange.setStartBefore(listItems.first); itemsRange.setEndAfter(listItems.last);
              // TinyMCE's HTML parser auto-wraps bare LI in another UL.
              // Build only our validated markup and replace the LI nodes
              // directly, inside the same undo transaction as table edits.
              const holder = document.createElement(list.tagName.toLowerCase());
              holder.innerHTML = Rich.html(richDocument, 'listItems');
              const fragment = document.createDocumentFragment();
              while (holder.firstChild) fragment.appendChild(holder.firstChild);
              const last = fragment.lastChild;
              itemsRange.deleteContents(); itemsRange.insertNode(fragment);
              itemsRange.setStartAfter(last); itemsRange.collapse(true);
              saved.editor.selection.setRng(itemsRange);
            } else if (mode === 'after') {
              const inserted = rich ? richHTML : '<p>' + escape(result).replace(/\r?\n/g, '<br>') + '</p>';
              saved.editor.selection.setContent('<p><br></p>' + inserted, { format: 'html' });
            } else if (rich && richInline) saved.editor.selection.setContent(richHTML, { format: 'html' });
            else saved.editor.insertContent(rich ? richHTML : escape(result).replace(/\r?\n/g, '<br>'));
            if (rich && fingerprint(saved.scope) === cleaned && JSON.stringify(cleanedDocument) !== JSON.stringify(richDocument)) throw new Error('Редактор не применил замену. Повторите команду.');
          } else {
            if (mode === 'after') {
              const inserted = rich ? richHTML : '<p>' + escape(result).replace(/\r?\n/g, '<br>') + '</p>';
              if (!document.execCommand('insertHTML', false, '<p><br></p>' + inserted)) throw new Error('Редактор не поддерживает вставку.');
            } else if (!document.execCommand(rich ? 'insertHTML' : 'insertText', false, rich ? richHTML : result)) throw new Error('Редактор не поддерживает вставку.');
          }
        }
      };
      if (saved.editor && saved.editor.undoManager) {
        let failure;
        // Finish the transaction even on failure so that only its own partial
        // formatting cleanup can be undone, not the user's previous edit.
        saved.editor.undoManager.transact(() => { try { mutate(); } catch (error) { failure = error; } });
        if (failure) {
          if (fingerprint(saved.scope) !== saved.before && saved.editor.undoManager.undo) saved.editor.undoManager.undo();
          throw failure;
        }
        saved.editor.nodeChanged(); saved.editor.setDirty(true);
        if (saved.editor.fire) saved.editor.fire('change');
      } else if (saved.cells) {
        throw new Error('Для изменения таблиц нужен TinyMCE с поддержкой отмены.');
      } else mutate();
      const unchanged = mode === 'after' ? false
        : rich ? JSON.stringify(richDocument) === JSON.stringify(saved.source.document) : result === (saved.text ?? saved.source);
      if (!saved.cells && !unchanged && fingerprint(saved.scope) === saved.before) throw new Error('Редактор не применил результат. Закройте другие диалоги Confluence и повторите команду.');
      saved.scope.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: mode === 'after' ? 'insertText' : 'insertReplacementText' }));
    }
    snapshots.delete(id);
    return { ok: true };
  }
  function discard(id) {
    const saved = snapshots.get(id);
    snapshots.delete(id);
    if (!saved) return;
    // Cancel returns the original highlight, but never overwrites a real edit.
    try {
      if (saved.input && saved.input.isConnected && saved.input.value === saved.before) {
        saved.input.focus(); saved.input.setSelectionRange(saved.start, saved.end);
      } else if (saved.scope && saved.scope.isConnected && fingerprint(saved.scope) === saved.before) {
        if (saved.editor && saved.editor.focus) saved.editor.focus(); else saved.scope.focus();
        const range = restoreRange(saved);
        if (saved.editor) saved.editor.selection.setRng(range);
        else { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
      }
    } catch (_) { /* The editor was closed or re-rendered. */ }
  }
  window.MDExporterAISelection = { capture, apply, discard };
})();
