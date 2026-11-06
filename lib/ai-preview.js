/* Local, safe helpers for AI comparison and PlantUML previews. */
(function (root) {
  'use strict';

  function tokens(value) {
    return String(value || '').match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
  }

  function merge(parts) {
    return parts.reduce(function (result, part) {
      const previous = result[result.length - 1];
      if (previous && previous.type === part.type) previous.text += part.text;
      else result.push({ type: part.type, text: part.text });
      return result;
    }, []);
  }

  function diff(before, after) {
    const oldText = String(before || ''), newText = String(after || '');
    if (oldText === newText) return oldText ? [{ type: 'equal', text: oldText }] : [];
    let oldTokens = tokens(oldText), newTokens = tokens(newText);
    let prefix = 0;
    while (prefix < oldTokens.length && prefix < newTokens.length && oldTokens[prefix] === newTokens[prefix]) prefix++;
    let suffix = 0;
    while (suffix < oldTokens.length - prefix && suffix < newTokens.length - prefix && oldTokens[oldTokens.length - 1 - suffix] === newTokens[newTokens.length - 1 - suffix]) suffix++;
    const oldMiddle = oldTokens.slice(prefix, oldTokens.length - suffix);
    const newMiddle = newTokens.slice(prefix, newTokens.length - suffix);
    const parts = [];
    if (prefix) parts.push({ type: 'equal', text: oldTokens.slice(0, prefix).join('') });
    if (oldMiddle.length && newMiddle.length && (oldMiddle.length + 1) * (newMiddle.length + 1) <= 600000) {
      const columns = newMiddle.length + 1;
      const table = new Uint32Array((oldMiddle.length + 1) * columns);
      for (let i = oldMiddle.length - 1; i >= 0; i--) {
        for (let j = newMiddle.length - 1; j >= 0; j--) {
          table[i * columns + j] = oldMiddle[i] === newMiddle[j]
            ? table[(i + 1) * columns + j + 1] + 1
            : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < oldMiddle.length && j < newMiddle.length) {
        if (oldMiddle[i] === newMiddle[j]) {
          parts.push({ type: 'equal', text: oldMiddle[i] }); i++; j++;
        } else if (table[(i + 1) * columns + j] >= table[i * columns + j + 1]) {
          parts.push({ type: 'delete', text: oldMiddle[i++] });
        } else parts.push({ type: 'insert', text: newMiddle[j++] });
      }
      while (i < oldMiddle.length) parts.push({ type: 'delete', text: oldMiddle[i++] });
      while (j < newMiddle.length) parts.push({ type: 'insert', text: newMiddle[j++] });
    } else {
      if (oldMiddle.length) parts.push({ type: 'delete', text: oldMiddle.join('') });
      if (newMiddle.length) parts.push({ type: 'insert', text: newMiddle.join('') });
    }
    if (suffix) parts.push({ type: 'equal', text: oldTokens.slice(oldTokens.length - suffix).join('') });
    return merge(parts);
  }

  function cleanName(value) {
    return String(value || '').trim().replace(/^["'\[]+|["'\]]+$/g, '').replace(/^(?:participant|actor|boundary|control|entity|database|queue)\s+/i, '').trim();
  }

  function plantUmlModel(source) {
    const lines = String(source || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("'") && !line.startsWith('//'));
    const participants = [], messages = [], edges = [];
    const seen = new Set();
    let sequenceDeclared = false;
    for (const line of lines) {
      if (/^@(?:start|end)/i.test(line) || /^(?:title|legend|skinparam|activate|deactivate|autonumber|note|box|end|group|alt|else|opt|loop|critical|break|par|return)\b/i.test(line)) continue;
      const declaration = line.match(/^(?:participant|actor|boundary|control|entity|database|queue)\s+(.+?)(?:\s+as\s+(\w+))?$/i);
      if (declaration) {
        sequenceDeclared = true;
        const name = cleanName(declaration[2] || declaration[1]);
        if (name && !seen.has(name)) { seen.add(name); participants.push(name); }
        continue;
      }
      const message = line.match(/^(.+?)\s*(?:-+>>?|--+)\s*(.+?)\s*:\s*(.+)$/);
      if (message) {
        const from = cleanName(message[1]), to = cleanName(message[2]);
        if (!from || !to) continue;
        for (const name of [from, to]) if (!seen.has(name)) { seen.add(name); participants.push(name); }
        messages.push({ from, to, text: message[3].trim() });
        continue;
      }
      const edge = line.match(/^(.+?)\s*-+>\s*(.+?)(?:\s*:\s*(.+))?$/);
      if (edge) {
        const from = cleanName(edge[1]), to = cleanName(edge[2]);
        if (from && to) edges.push({ from, to, text: edge[3] || '' });
      }
    }
    const flowHint = messages.some(item => /^(?:start|stop|end)$/i.test(item.from) || /^(?:start|stop|end)$/i.test(item.to));
    if (messages.length && (sequenceDeclared || !flowHint)) return { type: 'sequence', participants, messages };
    const flowEdges = edges.concat(messages.map(item => ({ from: item.from, to: item.to, text: item.text })));
    if (flowEdges.length) return { type: 'flow', edges: flowEdges };
    return null;
  }

  const api = { diff, plantUmlModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDExporterAIPreview = api;
})(globalThis);
