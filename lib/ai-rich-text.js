/* Restricted rich-text contract shared by worker, editor and preview.
 * Model output is data, never HTML/CSS. Only this renderer creates markup. */
(function (root) {
  'use strict';
  const INLINE = ['text', 'hardBreak'];
  const BLOCK = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'table'];
  const TABLE_CELL_BLOCK = ['text', 'hardBreak', 'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'];
  const BOOL = ['bold', 'italic', 'underline', 'strike', 'code'];
  const fail = () => { throw new Error('AI вернул неподдерживаемую разметку. Повторите запрос.'); };
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  function safeLink(value) {
    if (typeof value !== 'string' || !value || value.length > 4000 || /[\u0000-\u0020\u007f]/.test(value)) return false;
    if (/^(https?:\/\/|mailto:)/i.test(value)) {
      try { const url = new URL(value); return !url.username && !url.password && (url.protocol === 'mailto:' || !!url.hostname); } catch (_) { return false; }
    }
    return /^(\/(?!\/)|#)/.test(value) && !value.includes('\\');
  }
  function validate(value) {
    let count = 0, size = 0;
    function node(item, allowed, depth) {
      if (++count > 10000 || depth > 24 || !item || typeof item !== 'object' || Array.isArray(item) || !allowed.includes(item.type)) fail();
      const result = { type: item.type };
      let fields = ['type'];
      if (item.type === 'text') {
        fields = fields.concat('text', ...BOOL, 'color', 'backgroundColor', 'href');
        if (typeof item.text !== 'string' || (size += item.text.length) > 200000) fail();
        result.text = item.text;
        for (const key of BOOL) if (key in item) { if (typeof item[key] !== 'boolean') fail(); if (item[key]) result[key] = true; }
        for (const key of ['color', 'backgroundColor']) if (key in item) {
          if (typeof item[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(item[key])) fail(); result[key] = item[key].toLowerCase();
        }
        if ('href' in item) { if (!safeLink(item.href)) fail(); result.href = item.href; }
      } else if (item.type === 'codeBlock') {
        fields.push('text'); if (typeof item.text !== 'string' || (size += item.text.length) > 200000) fail(); result.text = item.text;
      } else if (!['hardBreak', 'horizontalRule'].includes(item.type)) {
        fields.push('content');
        if (item.type === 'heading') {
          fields.push('level'); if (!Number.isInteger(item.level) || item.level < 1 || item.level > 6) fail(); result.level = item.level;
        }
        if (item.type === 'orderedList' && 'start' in item) {
          fields.push('start'); if (!Number.isInteger(item.start) || item.start < 1 || item.start > 1000000) fail(); result.start = item.start;
        }
        if (!Array.isArray(item.content) || item.content.length > 10000) fail();
        const children = ['paragraph', 'heading'].includes(item.type) ? INLINE
          : ['bulletList', 'orderedList'].includes(item.type) ? ['listItem']
            : item.type === 'table' ? ['tableRow']
              : item.type === 'tableRow' ? ['tableHeader', 'tableCell']
                : ['tableHeader', 'tableCell'].includes(item.type) ? TABLE_CELL_BLOCK
                  : BLOCK;
        if (!item.content.length && !['paragraph', 'heading'].includes(item.type)) fail();
        result.content = item.content.map(child => node(child, children, depth + 1));
      }
      if (Object.keys(item).some(key => !fields.includes(key))) fail();
      return result;
    }
    const doc = node(value, ['doc'], 0);
    if (!plainUnchecked(doc).trim()) throw new Error('AI вернул пустой форматированный текст.');
    return doc;
  }
  function plainUnchecked(node) {
    if (['text', 'codeBlock'].includes(node.type)) return node.text;
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'horizontalRule') return '';
    if (node.type === 'table') return node.content.map(row => row.content.map(cell => cell.content.map(plainUnchecked).join(' ')).join(' | ')).join('\n');
    const inline = ['paragraph', 'heading'].includes(node.type);
    return node.content.map(plainUnchecked).join(inline ? '' : '\n');
  }
  function text(doc) { return plainUnchecked(validate(doc)); }
  function sameText(before, after) {
    const normalize = value => text(value).replace(/\s+/g, ' ').trim();
    return normalize(before) === normalize(after);
  }
  function sameFormatting(before, after) {
    function withoutText(node) {
      const copy = { ...node };
      if (['text', 'codeBlock'].includes(node.type)) copy.text = '';
      if (node.content) copy.content = node.content.map(withoutText);
      return copy;
    }
    return JSON.stringify(withoutText(validate(before))) === JSON.stringify(withoutText(validate(after)));
  }
  function normalizeTableDocument(value) {
    let table = value;
    if (table && table.type === 'doc' && Array.isArray(table.content) && table.content.length === 1) table = table.content[0];
    const rows = table && table.type === 'table'
      ? (Array.isArray(table.content) ? table.content
        : Array.isArray(table.headers) && Array.isArray(table.rows) ? [table.headers, ...table.rows] : table.rows)
      : table && Array.isArray(table.headers) && Array.isArray(table.rows)
        ? [table.headers, ...table.rows]
        : null;
    if (!Array.isArray(rows) || !rows.length) return null;
    const paragraphText = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const normalizedRows = rows.map((row, rowIndex) => {
      const cells = Array.isArray(row) ? row : row && (Array.isArray(row.content) ? row.content : row.cells);
      if (!Array.isArray(cells) || !cells.length) return null;
      return {
        type: 'tableRow',
        content: cells.map(cell => {
          const explicitType = cell && typeof cell === 'object' ? cell.type : '';
          const type = ['tableHeader', 'th', 'header'].includes(explicitType) ? 'tableHeader'
            : ['tableCell', 'td', 'cell'].includes(explicitType) ? 'tableCell'
              : rowIndex === 0 ? 'tableHeader' : 'tableCell';
          let content;
          if (typeof cell === 'string' || typeof cell === 'number') content = [paragraphText(String(cell))];
          else if (cell && typeof cell === 'object' && Array.isArray(cell.content)) content = cell.content;
          else if (cell && typeof cell === 'object' && typeof cell.text === 'string') content = [paragraphText(cell.text)];
          else if (cell && typeof cell === 'object' && ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'].includes(explicitType)) content = [cell];
          else return null;
          if (!content.length) content = [paragraphText('')];
          else if (content.every(child => child && INLINE.includes(child.type))) content = [{ type: 'paragraph', content }];
          return { type, content };
        })
      };
    });
    if (normalizedRows.some(row => !row || row.content.some(cell => !cell))) return null;
    try { return validate({ type: 'doc', content: [{ type: 'table', content: normalizedRows }] }); }
    catch (_) { return null; }
  }
  function fromMarkdownTable(value) {
    function cells(line) {
      let source = String(line).trim();
      if (source.startsWith('|')) source = source.slice(1);
      if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
      const result = [];
      let cell = '';
      for (let i = 0; i < source.length; i++) {
        if (source[i] === '\\' && source[i + 1] === '|') { cell += '|'; i++; }
        else if (source[i] === '|') { result.push(cell.trim()); cell = ''; }
        else cell += source[i];
      }
      result.push(cell.trim());
      return result;
    }
    const lines = String(value || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let index = 1; index < lines.length; index++) {
      if (!lines[index].includes('|')) continue;
      const headings = cells(lines[index - 1]);
      const separators = cells(lines[index]);
      if (!headings.length || headings.length !== separators.length || separators.some(cell => !/^:?-{3,}:?$/.test(cell))) continue;
      const rows = [];
      for (let rowIndex = index + 1; rowIndex < lines.length && lines[rowIndex].includes('|'); rowIndex++) {
        rows.push(cells(lines[rowIndex]));
      }
      const width = Math.max(headings.length, ...rows.map(row => row.length));
      if (!width || width > 50 || rows.length > 500) return null;
      while (headings.length < width) headings.push('');
      const tableRow = (values, type) => ({
        type: 'tableRow',
        content: Array.from({ length: width }, (_, cellIndex) => ({
          type,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: values[cellIndex] || '' }] }]
        }))
      });
      return validate({ type: 'doc', content: [{
        type: 'table',
        content: [tableRow(headings, 'tableHeader'), ...rows.map(row => tableRow(row, 'tableCell'))]
      }] });
    }
    return null;
  }
  function html(doc, inline = false, decorations = null) {
    const checked = validate(doc);
    function renderText(node) {
      let content = escape(node.text).replace(/\r?\n/g, '<br>');
      for (const [key, tag] of [['code', 'code'], ['bold', 'strong'], ['italic', 'em'], ['underline', 'u'], ['strike', 's']]) if (node[key]) content = '<' + tag + '>' + content + '</' + tag + '>';
      const styles = [];
      if (node.color) styles.push('color:' + node.color);
      if (node.backgroundColor) styles.push('background-color:' + node.backgroundColor);
      if (styles.length) content = '<span style="' + styles.join(';') + '">' + content + '</span>';
      if (node.href) content = '<a href="' + escape(node.href) + '">' + content + '</a>';
      return content;
    }
    function decorated(node, path, renderPart) {
      const parts = decorations && decorations.parts.get(path);
      if (!parts) return renderPart(node);
      return parts.filter(part => decorations.side === 'old' ? part.type !== 'insert' : part.type !== 'delete').map(part => {
        const content = renderPart({ ...node, text: part.text });
        return part.type === 'equal' ? content : '<' + (part.type === 'delete' ? 'del' : 'ins') + '>' + content + '</' + (part.type === 'delete' ? 'del' : 'ins') + '>';
      }).join('');
    }
    function render(node, path = '') {
      if (node.type === 'text') return decorated(node, path, renderText);
      if (node.type === 'codeBlock') return '<pre><code>' + decorated(node, path, item => escape(item.text)) + '</code></pre>';
      if (node.type === 'hardBreak') return '<br>';
      if (node.type === 'horizontalRule') return '<hr>';
      const children = node.content.map((child, index) => render(child, path ? path + '.' + index : String(index))).join('');
      if (node.type === 'doc') return children;
      if (node.type === 'table') return '<table><tbody>' + children + '</tbody></table>';
      const tag = { paragraph: 'p', heading: 'h' + node.level, bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', tableRow: 'tr', tableHeader: 'th', tableCell: 'td' }[node.type];
      const attr = node.type === 'orderedList' && node.start ? ' start="' + node.start + '"' : '';
      return '<' + tag + attr + '>' + children + '</' + tag + '>';
    }
    if (inline === 'listItems') {
      if (checked.content.length !== 1 || !['bulletList', 'orderedList'].includes(checked.content[0].type)) fail();
      return checked.content[0].content.map((child, index) => render(child, '0.' + index)).join('');
    }
    // A paragraph replacing a word must not split its surrounding paragraph.
    return inline && checked.content.length === 1 && ['paragraph', 'heading'].includes(checked.content[0].type)
      ? checked.content[0].content.map((child, index) => render(child, '0.' + index)).join('')
      : render(checked);
  }
  function color(value) {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    const match = String(value).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(1|0)\s*)?\)$/);
    if (!match && value && root.document && root.CSS && root.CSS.supports('color', value)) {
      const context = root.document.createElement('canvas').getContext('2d');
      context.fillStyle = value;
      if (context.fillStyle !== value) return color(context.fillStyle);
    }
    if (!match || match[4] === '0' || match.slice(1, 4).some(part => Number(part) > 255)) return null;
    return '#' + match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('');
  }
  function fromDOM(container) {
    function marks(element, inherited) {
      const result = { ...inherited }, tag = element.tagName.toLowerCase(), style = element.style;
      if (['strong', 'b'].includes(tag) || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) result.bold = true;
      if (['em', 'i'].includes(tag) || style.fontStyle === 'italic') result.italic = true;
      if (tag === 'u' || /underline/.test(style.textDecoration)) result.underline = true;
      if (['s', 'strike', 'del'].includes(tag) || /line-through/.test(style.textDecoration)) result.strike = true;
      if (tag === 'code') result.code = true;
      if (style.fontWeight === 'normal' || style.fontWeight === '400') delete result.bold;
      if (style.fontStyle === 'normal') delete result.italic;
      for (const [property, key] of [['color', 'color'], ['backgroundColor', 'backgroundColor']]) {
        const hex = color(style[property]); if (hex) result[key] = hex;
      }
      if (tag === 'a' && safeLink(element.getAttribute('href'))) result.href = element.getAttribute('href');
      return result;
    }
    const blocked = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|IMG|SVG|CANVAS|VIDEO|AUDIO|INPUT|TEXTAREA|BUTTON|TABLE)$/;
    function children(parent, inherited) {
      const output = [];
      for (const child of parent.childNodes) {
        if (child.nodeType === 3) { if (child.nodeValue) output.push({ type: 'text', text: child.nodeValue, ...inherited }); continue; }
        if (child.nodeType !== 1) continue;
        if (blocked.test(child.tagName) || child.getAttribute('contenteditable') === 'false') throw new Error('Выделите только редактируемый текст без изображений, таблиц и макросов.');
        if (child.getAttribute('data-mce-type') === 'bookmark' || child.getAttribute('data-mce-bogus') === 'all') continue;
        const nextMarks = marks(child, inherited), tag = child.tagName.toLowerCase();
        if (tag === 'br') output.push({ type: 'hardBreak' });
        else if (tag === 'hr') output.push({ type: 'horizontalRule' });
        else if (tag === 'pre') output.push({ type: 'codeBlock', text: child.textContent });
        else if (tag === 'ol' || tag === 'ul') {
          output.push({ type: tag === 'ol' ? 'orderedList' : 'bulletList', ...(tag === 'ol' && Number(child.getAttribute('start')) > 0 ? { start: Number(child.getAttribute('start')) } : {}), content: Array.from(child.children).filter(item => item.tagName === 'LI').map(item => ({ type: 'listItem', content: blocks(children(item, nextMarks)) })) });
        } else if (tag === 'blockquote') output.push({ type: 'blockquote', content: blocks(children(child, nextMarks)) });
        else if (/^h[1-6]$/.test(tag)) output.push({ type: 'heading', level: Number(tag[1]), content: children(child, nextMarks) });
        else if (['p', 'div'].includes(tag)) output.push(...blocks(children(child, nextMarks)));
        else output.push(...children(child, nextMarks));
      }
      return output;
    }
    function blocks(nodes) {
      const result = []; let inline = [];
      function flush() { if (inline.length && inline.some(node => node.type !== 'text' || node.text.trim())) result.push({ type: 'paragraph', content: inline }); inline = []; }
      for (const node of nodes) {
        if (INLINE.includes(node.type)) inline.push(node);
        else { flush(); result.push(node); }
      }
      flush(); return result;
    }
    return validate({ type: 'doc', content: blocks(children(container, {})) });
  }
  const contract = 'Верни только JSON документа (не HTML и не Markdown): {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Текст","bold":true,"color":"#ff0000"}]}]}. Блоки: paragraph (content из text/hardBreak), heading (level 1..6, content из text/hardBreak), bulletList/orderedList (content из listItem, у orderedList необязательный start >=1), listItem/blockquote (content из блоков), codeBlock (text), horizontalRule, table (content из tableRow), tableRow (content из tableHeader или tableCell), tableHeader/tableCell (content из блоков либо text/hardBreak). Пример таблицы: {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Показатель"}]}]},{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Значение"}]}]}]},{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Срок"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"5 дней"}]}]}]}]}. Внутри text разрешены только text, bold, italic, underline, strike, code (булевы), color/backgroundColor (#RRGGBB), href (https/http/mailto, путь /... или #якорь). У hardBreak только type. Корень doc содержит блоки. Сохраняй исходные ссылки и оформление, кроме явно запрошенных изменений. Чтобы снять выделение, ссылку или цвет, убери соответствующее поле у text. Не добавляй изображения, макросы, HTML, CSS и произвольные поля. Возвращай весь выделенный фрагмент, а не только измененные слова.';
  const api = { validate, html, text, sameText, sameFormatting, fromDOM, fromMarkdownTable, normalizeTableDocument, safeLink, contract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDExporterAIRichText = api;
})(globalThis);
