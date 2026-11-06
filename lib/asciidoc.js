(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MDExporterAsciiDoc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  function cleanup(value) {
    const text = normalize(value).replace(/\n{3,}/g, '\n\n').trim();
    return text ? text + '\n' : '';
  }

  function unquote(value) {
    const text = String(value || '').trim();
    if (text.length >= 2 && ((text[0] === '"' && text[text.length - 1] === '"')
      || (text[0] === "'" && text[text.length - 1] === "'"))) {
      return text.slice(1, -1).replace(/\\([\\"])/g, '$1');
    }
    return text;
  }

  function splitFrontMatter(markdown) {
    const source = normalize(markdown);
    const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    if (!match) return { attributes: {}, body: source };
    const attributes = {};
    for (const line of match[1].split('\n')) {
      const entry = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);
      if (entry) attributes[entry[1]] = unquote(entry[2]);
    }
    return { attributes: attributes, body: source.slice(match[0].length) };
  }

  function inlineTarget(value) {
    return String(value || '').trim().replace(/^<|>$/g, '').replace(/\s/g, '%20').replace(/]/g, '%5D');
  }

  function inlineLabel(value) {
    return String(value || '').replace(/]/g, '\\]');
  }

  function inlineToAsciiDoc(value) {
    let text = String(value == null ? '' : value);
    const tokens = [];
    function protect(rendered) {
      const token = '\u0000' + tokens.length + '\u0000';
      tokens.push(rendered);
      return token;
    }

    text = text.replace(/(`+)(.+?)\1/g, function (match, ticks, code) {
      return protect(ticks + code + ticks);
    });
    text = text.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"([^"]*)")?\)/g,
      function (match, alt, target) {
        return protect('image:' + inlineTarget(target) + '[' + inlineLabel(alt) + ']');
      });
    text = text.replace(/\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+"([^"]*)")?\)/g,
      function (match, label, target) {
        return protect('link:' + inlineTarget(target) + '[' + inlineLabel(label) + ']');
      });
    text = text.replace(/\*\*(.+?)\*\*/g, function (match, content) {
      return protect('**' + content + '**');
    });
    text = text.replace(/__(.+?)__/g, function (match, content) {
      return protect('**' + content + '**');
    });
    text = text.replace(/~~(.+?)~~/g, function (match, content) {
      return protect('[line-through]#' + content + '#');
    });
    text = text.replace(/<sub>([\s\S]*?)<\/sub>/gi, function (match, content) {
      return protect('~' + content + '~');
    });
    text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, function (match, content) {
      return protect('^' + content + '^');
    });
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1_$2_');
    return text.replace(/\u0000(\d+)\u0000/g, function (match, index) {
      return tokens[Number(index)] || '';
    });
  }

  function isMarkdownTableSeparator(line) {
    const cells = splitMarkdownRow(line);
    return cells.length > 0 && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell); });
  }

  function splitMarkdownRow(line) {
    let value = String(line || '').trim();
    if (value[0] === '|') value = value.slice(1);
    if (value[value.length - 1] === '|' && value[value.length - 2] !== '\\') value = value.slice(0, -1);
    const cells = [];
    let cell = '';
    let escaped = false;
    for (const char of value) {
      if (char === '|' && !escaped) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
    }
    cells.push(cell.trim());
    return cells;
  }

  function markdownTable(lines, start) {
    const rows = [splitMarkdownRow(lines[start])];
    let index = start + 2;
    while (index < lines.length && String(lines[index]).trim() && String(lines[index]).includes('|')) {
      rows.push(splitMarkdownRow(lines[index]));
      index += 1;
    }
    const rendered = ['|==='];
    for (const row of rows) {
      rendered.push('| ' + row.map(function (cell) { return inlineToAsciiDoc(cell); }).join(' | '));
    }
    rendered.push('|===');
    return { text: rendered.join('\n'), next: index };
  }

  function markdownBodyToAsciiDoc(body, documentTitle) {
    const lines = normalize(body).split('\n');
    const out = [];
    let index = 0;
    let titlePending = !!documentTitle;

    while (index < lines.length) {
      const line = String(lines[index] || '');
      if (!line.trim()) {
        out.push('');
        index += 1;
        continue;
      }

      const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
      if (fence) {
        const marker = fence[1];
        const language = String(fence[2] || '').trim();
        const code = [];
        index += 1;
        const closing = new RegExp('^\\s*' + (marker[0] === '`' ? '`' : '~')
          + '{' + marker.length + ',}\\s*$');
        while (index < lines.length && !closing.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        out.push(language ? '[source,' + language + ']' : '[source]', '----', code.join('\n'), '----');
        continue;
      }

      if (/^\s*<details\s*>\s*$/i.test(line)) {
        const details = [];
        index += 1;
        while (index < lines.length && !/^\s*<\/details\s*>\s*$/i.test(lines[index])) {
          details.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const summaryIndex = details.findIndex(function (entry) { return /^\s*<summary>/i.test(entry); });
        let title = 'Подробнее';
        if (summaryIndex >= 0) {
          title = details[summaryIndex].replace(/^\s*<summary>/i, '').replace(/<\/summary>\s*$/i, '').trim() || title;
          details.splice(summaryIndex, 1);
        }
        out.push('.' + inlineToAsciiDoc(title), '[%collapsible]', '====', markdownBodyToAsciiDoc(details.join('\n'), '').trim(), '====');
        continue;
      }

      if (/^\s*<!--/.test(line)) {
        while (index < lines.length && !String(lines[index]).includes('-->')) index += 1;
        index += 1;
        continue;
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const title = heading[2].trim();
        if (titlePending && heading[1].length === 1 && title === documentTitle) {
          titlePending = false;
          index += 1;
          continue;
        }
        titlePending = false;
        out.push('='.repeat(heading[1].length) + ' ' + inlineToAsciiDoc(title));
        index += 1;
        continue;
      }
      titlePending = false;

      if (index + 1 < lines.length && String(line).includes('|') && isMarkdownTableSeparator(lines[index + 1])) {
        const table = markdownTable(lines, index);
        out.push(table.text);
        index = table.next;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quote = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quote.push(lines[index].replace(/^\s*>\s?/, ''));
          index += 1;
        }
        out.push('[quote]', '____', markdownBodyToAsciiDoc(quote.join('\n'), '').trim(), '____');
        continue;
      }

      if (/^\s*(?:-{3,}|(?:\*\s*){3,}|(?:_\s*){3,})\s*$/.test(line)) {
        out.push("'''");
        index += 1;
        continue;
      }

      const item = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
      if (item) {
        const depth = Math.min(5, Math.floor(item[1].replace(/\t/g, '  ').length / 2) + 1);
        const ordered = /^\d/.test(item[2]);
        out.push((ordered ? '.' : '*').repeat(depth) + ' ' + inlineToAsciiDoc(item[3]));
        index += 1;
        continue;
      }

      const hardBreak = / {2,}$/.test(line);
      let rendered = inlineToAsciiDoc(line.replace(/ {2,}$/, ''));
      if (/^image:[^\s]+\[[^\]]*\]$/.test(rendered)) rendered = rendered.replace(/^image:/, 'image::');
      out.push(rendered + (hardBreak ? ' +' : ''));
      index += 1;
    }
    return cleanup(out.join('\n'));
  }

  function fromMarkdown(markdown) {
    const source = splitFrontMatter(markdown);
    const title = source.attributes.title || '';
    const header = [];
    if (title) header.push('= ' + inlineToAsciiDoc(title));
    for (const key of Object.keys(source.attributes)) {
      if (key !== 'title') header.push(':' + key + ': ' + source.attributes[key]);
    }
    const body = markdownBodyToAsciiDoc(source.body, title);
    return cleanup((header.length ? header.join('\n') + '\n\n' : '') + body);
  }

  function inlineToMarkdown(value) {
    let text = String(value == null ? '' : value);
    const tokens = [];
    function protect(rendered) {
      const token = '\u0000' + tokens.length + '\u0000';
      tokens.push(rendered);
      return token;
    }

    text = text.replace(/(`+)(.+?)\1/g, function (match, ticks, code) {
      return protect(ticks + code + ticks);
    });
    text = text.replace(/image::?([^\s\[]+)\[([^\]]*)\]/g, function (match, target, attributes) {
      const alt = attributes.split(',')[0].trim();
      return protect('![' + alt + '](' + target + ')');
    });
    text = text.replace(/link:([^\s\[]+)\[([^\]]*)\]/g, function (match, target, label) {
      return protect('[' + label.replace(/\\]/g, ']') + '](' + target + ')');
    });
    text = text.replace(/(https?:\/\/[^\s\[]+)\[([^\]]+)\]/g, function (match, target, label) {
      return protect('[' + label + '](' + target + ')');
    });
    text = text.replace(/\[line-through\]#([\s\S]*?)#/g, function (match, content) {
      return protect('~~' + content + '~~');
    });
    text = text.replace(/\*\*(.+?)\*\*/g, function (match, content) {
      return protect('**' + content + '**');
    });
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1**$2**');
    text = text.replace(/(^|[^\p{L}\p{N}\p{M}_])_([^_\n]+)_(?![\p{L}\p{N}\p{M}_])/gu, '$1*$2*');
    text = text.replace(/~([^~\n]+)~/g, '<sub>$1</sub>');
    text = text.replace(/\^([^^\n]+)\^/g, '<sup>$1</sup>');
    return text.replace(/\u0000(\d+)\u0000/g, function (match, index) {
      return tokens[Number(index)] || '';
    });
  }

  function splitAsciiDocRow(line) {
    let value = String(line || '').trim();
    if (value[0] === '|') value = value.slice(1);
    const cells = [];
    let cell = '';
    let escaped = false;
    for (const char of value) {
      if (char === '|' && !escaped) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
    }
    cells.push(cell.trim());
    if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  }

  function asciiDocTable(lines, start, style) {
    const parsed = [];
    let index = start + 1;
    while (index < lines.length && String(lines[index]).trim() !== '|===') {
      if (String(lines[index]).trim()) parsed.push(splitAsciiDocRow(lines[index]));
      index += 1;
    }
    if (index < lines.length) index += 1;

    let rows;
    if (parsed.some(function (row) { return row.length > 1; })) {
      rows = parsed;
    } else {
      const flat = parsed.map(function (row) { return row[0] || ''; });
      const cols = String(style || '').match(/cols=["']?([0-9]+(?:\s*,\s*[0-9]+)*)/);
      const width = cols ? cols[1].split(',').length : 1;
      rows = [];
      for (let cell = 0; cell < flat.length; cell += width) rows.push(flat.slice(cell, cell + width));
    }
    if (!rows.length) return { text: '', next: index };

    const width = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    function renderRow(row) {
      const cells = row.slice();
      while (cells.length < width) cells.push('');
      return '| ' + cells.map(function (cell) {
        return inlineToMarkdown(cell).replace(/\|/g, '\\|');
      }).join(' | ') + ' |';
    }
    const rendered = [renderRow(rows[0]), '| ' + new Array(width).fill('---').join(' | ') + ' |'];
    for (let row = 1; row < rows.length; row++) rendered.push(renderRow(rows[row]));
    return { text: rendered.join('\n'), next: index };
  }

  function collectDelimited(lines, start, delimiter) {
    const body = [];
    let index = start + 1;
    while (index < lines.length && String(lines[index]).trim() !== delimiter) {
      body.push(lines[index]);
      index += 1;
    }
    if (index < lines.length) index += 1;
    return { body: body, next: index };
  }

  function sourceLanguage(style) {
    const value = String(style || '');
    const plant = /(?:^|,)\s*(plantuml|puml|uml|mermaid)\s*(?:,|$)/i.exec(value);
    if (plant) return plant[1].toLowerCase() === 'puml' || plant[1].toLowerCase() === 'uml' ? 'plantuml' : plant[1].toLowerCase();
    const source = /source\s*,\s*([^\],]+)/i.exec(value);
    return source ? source[1].trim() : '';
  }

  function toMarkdown(asciidoc) {
    const lines = normalize(asciidoc).split('\n');
    const out = [];
    let index = 0;
    let style = '';
    let blockTitle = '';

    while (index < lines.length) {
      const line = String(lines[index] || '');
      const trimmed = line.trim();
      if (!trimmed) {
        out.push('');
        style = '';
        blockTitle = '';
        index += 1;
        continue;
      }

      if (trimmed === '////') {
        const block = collectDelimited(lines, index, '////');
        index = block.next;
        continue;
      }
      if (/^\/\//.test(trimmed)) {
        index += 1;
        continue;
      }
      if (/^:[^:\s]+:\s*/.test(trimmed) || /^\[\[[^\]]+\]\]$/.test(trimmed)) {
        index += 1;
        continue;
      }

      const heading = line.match(/^\s*(={1,6})\s+(.+?)\s*$/);
      if (heading) {
        out.push('#'.repeat(heading[1].length) + ' ' + inlineToMarkdown(heading[2]));
        index += 1;
        continue;
      }

      if (/^\[(?:source\b|plantuml\b|mermaid\b|quote\b|%collapsible\b|cols=|NOTE\b|TIP\b|WARNING\b|IMPORTANT\b|CAUTION\b)/i.test(trimmed)) {
        style = trimmed.slice(1, -1);
        index += 1;
        continue;
      }
      if (/^\.[^\s]/.test(trimmed)) {
        blockTitle = trimmed.slice(1).trim();
        index += 1;
        continue;
      }

      if (trimmed === '----' || trimmed === '....') {
        const block = collectDelimited(lines, index, trimmed);
        const language = sourceLanguage(style);
        out.push('```' + language, block.body.join('\n'), '```');
        style = '';
        blockTitle = '';
        index = block.next;
        continue;
      }
      if (trimmed === '____') {
        const block = collectDelimited(lines, index, '____');
        const quote = toMarkdown(block.body.join('\n')).trim().split('\n');
        out.push(quote.map(function (entry) { return entry ? '> ' + entry : '>'; }).join('\n'));
        style = '';
        blockTitle = '';
        index = block.next;
        continue;
      }
      if (trimmed === '====') {
        const block = collectDelimited(lines, index, '====');
        const content = toMarkdown(block.body.join('\n')).trim();
        if (/(?:^|,)\s*%?collapsible\s*(?:,|$)/i.test(style)) {
          out.push('<details>', '<summary>' + inlineToMarkdown(blockTitle || 'Подробнее') + '</summary>', '', content, '</details>');
        } else {
          out.push(content);
        }
        style = '';
        blockTitle = '';
        index = block.next;
        continue;
      }
      if (trimmed === '--') {
        const block = collectDelimited(lines, index, '--');
        out.push(toMarkdown(block.body.join('\n')).trim());
        style = '';
        blockTitle = '';
        index = block.next;
        continue;
      }
      if (trimmed === '|===') {
        const table = asciiDocTable(lines, index, style);
        out.push(table.text);
        style = '';
        blockTitle = '';
        index = table.next;
        continue;
      }
      if (trimmed === "'''") {
        out.push('---');
        index += 1;
        continue;
      }

      const item = line.match(/^(\s*)(\*+|\.+)\s+(.*)$/);
      if (item) {
        const ordered = item[2][0] === '.';
        const indent = ' '.repeat(Math.max(0, item[2].length - 1) * 2);
        out.push(indent + (ordered ? '1. ' : '- ') + inlineToMarkdown(item[3]));
        index += 1;
        continue;
      }

      const admonition = trimmed.match(/^(NOTE|TIP|WARNING|IMPORTANT|CAUTION):\s*(.*)$/i);
      if (admonition) {
        out.push('> **' + admonition[1] + '**', '>', '> ' + inlineToMarkdown(admonition[2]));
        index += 1;
        continue;
      }
      const styledAdmonition = style.match(/^(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\b/i);
      if (styledAdmonition) {
        out.push('> **' + styledAdmonition[1].toUpperCase() + '**', '>', '> ' + inlineToMarkdown(line));
        style = '';
        index += 1;
        continue;
      }

      out.push(inlineToMarkdown(line.replace(/\s+\+$/, '  ')));
      index += 1;
    }
    return cleanup(out.join('\n'));
  }

  return {
    fromMarkdown: fromMarkdown,
    toMarkdown: toMarkdown
  };
});
