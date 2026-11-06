/**
 * Разбор выделенного текста в нумерованный или маркированный список Confluence.
 *
 * Модуль не работает с DOM: на вход приходит текст, на выходе storage-разметка
 * списка. Используется плавающей кнопкой, пунктом контекстного меню и
 * импортером Markdown для ячеек таблиц.
 *
 * Поддерживаемые маркеры:
 *   1. текст, 1) текст, (1) текст
 *   1.1 текст, 1.1. текст, 1.1) текст, (1.1) текст
 *   - текст, * текст, + текст, • текст, – текст, — текст
 * Вложенность берется из структуры номера (1.1 - второй уровень) и из отступа.
 *
 * Экспортирует window.MDExporterNumberedList.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MDExporterNumberedList = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_INPUT_LENGTH = 200 * 1024;
  const MAX_LEVEL = 6;
  const DOTTED_NUMBER = '\\d{1,3}(?:\\.\\d{1,3}){0,2}';
  const PAREN_MARKER = new RegExp('^\\((\\d{1,3}(?:\\.\\d{1,3}){0,2})\\)\\s+(.*)$');
  const BARE_MARKER = new RegExp('^(' + DOTTED_NUMBER + ')([.)]?)\\s+(.*)$');
  const BULLET_MARKER = /^[-*+•–—]\s+(.*)$/;
  const INLINE_MARKER_SPACED = new RegExp('(^|\\s)(' + DOTTED_NUMBER + ')([.)])(?=\\s+\\S)', 'g');
  const INLINE_MARKER_GLUED = new RegExp('(' + DOTTED_NUMBER + ')([.)])(?=\\s+\\S)', 'g');

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\u00a0/g, ' ');
  }

  function indentWidth(value) {
    return String(value || '').replace(/\t/g, '  ').length;
  }

  function indentLevel(width) {
    return Math.min(Math.floor((Number(width) || 0) / 2), MAX_LEVEL);
  }

  function numberLevel(number) {
    if (!number) return 0;
    return Math.min(String(number).split('.').length - 1, MAX_LEVEL);
  }

  /** Разбирает начало строки: отступ, маркер, текст. */
  function parseMarker(line) {
    const value = String(line == null ? '' : line);
    const indentMatch = value.match(/^\s*/);
    const indent = indentWidth(indentMatch ? indentMatch[0] : '');
    const rest = value.slice(indentMatch ? indentMatch[0].length : 0);

    const paren = rest.match(PAREN_MARKER);
    if (paren) {
      return {
        kind: 'ol',
        number: paren[1],
        dotted: paren[1].indexOf('.') >= 0,
        level: Math.max(numberLevel(paren[1]), indentLevel(indent)),
        text: paren[2].trim()
      };
    }

    const bare = rest.match(BARE_MARKER);
    if (bare) {
      return {
        kind: 'ol',
        number: bare[1],
        dotted: bare[1].indexOf('.') >= 0,
        level: Math.max(numberLevel(bare[1]), indentLevel(indent)),
        text: bare[3].trim()
      };
    }

    const bullet = rest.match(BULLET_MARKER);
    if (bullet) {
      return {
        kind: 'ul',
        number: '',
        dotted: false,
        level: indentLevel(indent),
        text: bullet[1].trim()
      };
    }

    return null;
  }

  function markerNumbers(markers) {
    return markers.map(function (marker) {
      return String(marker.number).split('.');
    });
  }

  /**
   * Делит строку с несколькими пунктами на отдельные пункты.
   * Строка принимается за список, только если начинается с первого маркера,
   * а номера идут подряд и относятся к одному уровню нумерации. Поэтому фразы
   * вида "в 2. раза" и десятичные числа списком не становятся.
   */
  function splitInlineNumbered(line) {
    const value = String(line == null ? '' : line);

    for (const requireSpace of [true, false]) {
      const pattern = requireSpace ? INLINE_MARKER_SPACED : INLINE_MARKER_GLUED;
      const markers = [];
      pattern.lastIndex = 0;
      let match = pattern.exec(value);
      while (match) {
        const number = requireSpace ? match[2] : match[1];
        const start = requireSpace ? match.index + match[1].length : match.index;
        const charBefore = start > 0 ? value.charAt(start - 1) : '';
        if (!/\d/.test(charBefore)) markers.push({ start: start, number: number });
        match = pattern.exec(value);
      }

      if (markers.length < 2 || markers[0].start !== 0) continue;

      const numbers = markerNumbers(markers);
      const prefix = numbers[0].slice(0, -1).join('.');
      let sequential = true;
      for (let index = 1; index < numbers.length; index++) {
        const previous = numbers[index - 1];
        const current = numbers[index];
        if (current.slice(0, -1).join('.') !== prefix) {
          sequential = false;
          break;
        }
        if (Number(current[current.length - 1]) !== Number(previous[previous.length - 1]) + 1) {
          sequential = false;
          break;
        }
      }
      if (!sequential) continue;

      const parts = [];
      for (let index = 0; index < markers.length; index++) {
        const stop = index + 1 < markers.length ? markers[index + 1].start : value.length;
        parts.push(value.slice(markers[index].start, stop).trim());
      }
      const filled = parts.filter(Boolean);
      if (filled.length > 1) return filled;
    }

    return null;
  }

  function parseItemsOnce(value, plainLines, allowDotted) {
    const items = [];
    const lines = normalize(value).split('\n');

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const segments = splitInlineNumbered(rawLine) || [rawLine];

      for (const segment of segments) {
        const marker = parseMarker(segment);
        const usable = marker && marker.text && (allowDotted || !marker.dotted);

        if (usable) {
          items.push({
            kind: marker.kind,
            indent: marker.level,
            text: marker.text,
            dotted: marker.dotted
          });
          continue;
        }

        const text = segment.trim();
        if (!text) continue;
        const previous = items[items.length - 1];
        if (plainLines === 'text') {
          items.push({ kind: 'text', indent: 0, text: text, dotted: false });
        } else {
          items.push({
            kind: previous ? previous.kind : 'ol',
            indent: previous ? previous.indent : 0,
            text: text,
            dotted: false
          });
        }
      }
    }

    return items;
  }

  /**
   * Разбирает текст в последовательность элементов.
   *
   * plainLines: 'item' - строки без маркера считаются пунктами списка,
   *             'text' - строки без маркера остаются обычным текстом.
   * Элемент: { kind: 'ol' | 'ul' | 'text', indent: уровень, text: string }.
   */
  function parseItems(value, options) {
    const settings = options || {};
    const plainLines = settings.plainLines === 'text' ? 'text' : 'item';
    const allowDotted = settings.allowDotted !== false;

    const items = parseItemsOnce(value, plainLines, allowDotted);
    if (!allowDotted) return items;

    // Одиночный номер вида "1.5" чаще десятичное число, чем пункт списка.
    // Если другого списка в тексте нет, пункт принимается только когда после
    // номера идет название с заглавной буквы или кавычки: "1.1 Текст раздела".
    const dotted = items.filter(function (item) { return item.dotted; });
    if (dotted.length === 1 && items.length === 1) {
      const startsTitle = /^[A-ZА-ЯЁ«"“]/.test(dotted[0].text || '');
      if (!startsTitle) return parseItemsOnce(value, plainLines, false);
    }
    return items;
  }

  /**
   * Собирает html списка с вложенностью по уровням.
   * renderItem(text) отвечает за разметку текста пункта.
   */
  function buildListHtml(items, renderItem) {
    const render = typeof renderItem === 'function'
      ? renderItem
      : function (text) { return escapeXml(text); };
    const stack = [];
    let html = '';

    function closeFrame() {
      const frame = stack.pop();
      const list = '<' + frame.kind + '>' + frame.items.map(function (item) {
        return '<li>' + item + '</li>';
      }).join('') + '</' + frame.kind + '>';
      if (!stack.length) {
        html += list;
        return;
      }
      const parent = stack[stack.length - 1];
      if (!parent.items.length) parent.items.push('');
      parent.items[parent.items.length - 1] += list;
    }

    function openFrame(kind, indent) {
      stack.push({ kind: kind, indent: indent, items: [] });
    }

    for (const item of items) {
      if (!item || item.kind === 'text') continue;
      if (!stack.length) {
        openFrame(item.kind, item.indent);
      } else {
        const top = stack[stack.length - 1];
        if (item.indent > top.indent) {
          openFrame(item.kind, item.indent);
        } else {
          while (stack.length && item.indent < stack[stack.length - 1].indent) closeFrame();
          if (!stack.length) {
            openFrame(item.kind, item.indent);
          } else if (stack[stack.length - 1].kind !== item.kind) {
            closeFrame();
            openFrame(item.kind, item.indent);
          }
        }
      }
      stack[stack.length - 1].items.push(render(item.text));
    }

    while (stack.length) closeFrame();
    return html;
  }

  function maxLevel(items) {
    let level = 0;
    for (const item of items) {
      if (item.kind === 'text') continue;
      if (item.indent > level) level = item.indent;
    }
    return level;
  }

  // Глубина списка: сколько уровней вложенности получилось на самом деле.
  // Список из одних подпунктов "1.1", "1.2" остается плоским.
  function depthOfItems(items) {
    let min = Infinity;
    let max = -1;
    for (const item of items) {
      if (!item || item.kind === 'text') continue;
      if (item.indent < min) min = item.indent;
      if (item.indent > max) max = item.indent;
    }
    if (max < 0) return 0;
    return max - min + 1;
  }

  /**
   * Преобразует текст в storage-разметку списка.
   * Возвращает { ok, html, items, depth, reason }, reason: 'empty' | 'too-long'.
   */
  function convert(value, options) {
    const settings = options || {};
    const text = normalize(value);
    if (!text.trim()) return { ok: false, reason: 'empty', html: '', items: [], depth: 0 };
    if (text.length > MAX_INPUT_LENGTH) return { ok: false, reason: 'too-long', html: '', items: [], depth: 0 };
    const items = parseItems(text, { plainLines: 'item' });
    if (!items.length) return { ok: false, reason: 'empty', html: '', items: [], depth: 0 };
    return {
      ok: true,
      html: buildListHtml(items, settings.renderItem),
      items: items,
      depth: depthOfItems(items)
    };
  }

  return {
    MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
    escapeXml: escapeXml,
    normalize: normalize,
    parseMarker: parseMarker,
    splitInlineNumbered: splitInlineNumbered,
    parseItems: parseItems,
    buildListHtml: buildListHtml,
    maxLevel: maxLevel,
    depthOfItems: depthOfItems,
    convert: convert
  };
});
