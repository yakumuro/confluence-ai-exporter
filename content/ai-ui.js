/* Isolated-world AI comparison dialog. Provider output is never inserted as arbitrary HTML. */
(function () {
  'use strict';
  if (window.__mdExporterAIUI) return;
  window.__mdExporterAIUI = true;
  const Rich = window.MDExporterAIRichText;
  const Preview = window.MDExporterAIPreview;
  let closePrevious;

  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'md-ai-open') return;
    if (closePrevious) closePrevious();

    const host = document.createElement('div');
    host.id = 'md-exporter-ai-dialog';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    for (const type of ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout']) {
      host.addEventListener(type, event => event.stopPropagation());
    }
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.dialog{pointer-events:auto;display:flex;width:min(1120px,calc(100vw - 36px));height:min(850px,calc(100vh - 36px));max-height:92vh;flex-direction:column;padding:0;border:1px solid #e2e5ed;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 28px 90px rgba(23,32,51,.26);color:#172033;font:13px/1.5 Inter,"Segoe UI",Roboto,Arial,sans-serif;animation:dialog-in .2s ease both}.dialog::backdrop{background:rgba(23,32,51,.48);backdrop-filter:blur(4px)}button,textarea,select,input{font:inherit}.dialog-header{display:flex;min-height:70px;flex:none;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #e8e6f6;background:linear-gradient(120deg,#f4f2ff,#fff)}.brand-mark{display:grid;width:40px;height:40px;flex:none;place-items:center;border-radius:12px;background:linear-gradient(135deg,#7c72ff,#5147e5);box-shadow:0 5px 12px rgba(81,71,229,.2);color:#fff;font-size:12px;font-weight:800}.heading{min-width:0;flex:1}.kicker{color:#635bff;font-size:9px;font-weight:800;letter-spacing:1px}.dialog h2{margin:1px 0 0;font-size:18px;letter-spacing:-.3px}.shortcut{padding:4px 7px;border:1px solid #dddafe;border-radius:7px;background:#efefff;color:#5147e5;font-size:10px;white-space:nowrap}.dialog button{min-height:36px;padding:8px 13px;border:1px solid #dce0e8;border-radius:9px;background:#fff;color:#344054;cursor:pointer;font-size:11px;font-weight:650;transition:background .15s,border-color .15s,transform .15s,box-shadow .15s}.dialog button:hover:not(:disabled){border-color:#c9c5f6;background:#faf9ff}.dialog button:active:not(:disabled){transform:scale(.98)}.dialog button:focus-visible,.dialog textarea:focus-visible,.dialog select:focus-visible,.dialog summary:focus-visible{outline:3px solid rgba(99,91,255,.2);outline-offset:2px}.dialog button:disabled{opacity:.5;cursor:not-allowed}.dialog .close-button{display:grid;width:34px;min-height:34px;padding:0;place-items:center;border:0;background:transparent;color:#758197;font-size:22px;font-weight:400}.dialog .close-button:hover{background:#eeeef5;color:#172033}.dialog-body{display:flex;min-height:0;flex:1;flex-direction:column;overflow:auto}.prompt-block{flex:none;padding:14px 20px;border-bottom:1px solid #eceef3;background:#fafbfc}.prompt-block:empty{display:none}.prompt-row{display:flex;align-items:flex-end;gap:10px}.prompt-field{min-width:0;flex:1}.dialog label{display:block;margin:0 0 6px;color:#344054;font-size:11px;font-weight:700}.dialog textarea,.dialog select,.dialog input[type=text]{display:block;width:100%;box-sizing:border-box;border:1px solid #d8dde7;border-radius:9px;background:#fff;color:#172033;font:12px/1.45 Inter,"Segoe UI",sans-serif}.dialog textarea{min-height:66px;max-height:180px;padding:9px 11px;resize:vertical}.dialog select{min-height:38px;padding:8px 10px}.dialog input[type=text]{min-height:40px;padding:9px 11px}.dialog textarea:focus,.dialog select:focus,.dialog input[type=text]:focus{border-color:#635bff;outline:3px solid rgba(99,91,255,.1)}.scenario-select{min-width:190px}.scenario-actions{display:flex;align-items:center;gap:8px;margin-top:8px}.scenario-actions button{min-height:30px;padding:5px 9px}.scenario-status{margin:0!important;color:#16836f!important;font-size:10px}.comparison{display:grid;min-height:300px;flex:1;grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);padding:16px 20px;background:#f6f7fb}.pane{display:flex;min-width:0;min-height:0;flex-direction:column;overflow:hidden;border:1px solid #e1e4eb;border-radius:13px;background:#fff}.pane-header{display:flex;min-height:43px;flex:none;align-items:center;justify-content:space-between;gap:8px;padding:10px 13px;border-bottom:1px solid #eceef3;background:#fff;color:#475467;font-size:10px;font-weight:750;letter-spacing:.5px;text-transform:uppercase}.pane-content{min-height:0;flex:1;overflow:auto;padding:14px;color:#344054}.pane-content:empty{display:none}.result-pane{position:relative}.result-pane.is-loading .pane-content{opacity:.35}.comparison-loader{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#635bff;text-align:center;visibility:hidden}.comparison-loader.is-visible{visibility:visible}.loader-spinner{width:26px;height:26px;border:3px solid #e1defe;border-top-color:#635bff;border-radius:50%;animation:spin .75s linear infinite}.comparison-loader span{font-size:9px;font-weight:650;line-height:1.35}.placeholder{display:flex;min-height:220px;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#98a2b3;text-align:center}.placeholder-icon{display:grid;width:42px;height:42px;place-items:center;border-radius:13px;background:#f0effa;color:#7c72ff;font-size:19px}.placeholder p{max-width:190px;margin:0;font-size:11px;line-height:1.45}.dialog pre{max-height:none;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#344054;font:12px/1.6 "Cascadia Code",Consolas,monospace}.rich-preview{white-space:normal;overflow-wrap:anywhere}.rich-preview p{margin:0 0 12px}.rich-preview h1,.rich-preview h2,.rich-preview h3,.rich-preview h4,.rich-preview h5,.rich-preview h6{margin:14px 0 8px;line-height:1.3}.rich-preview h1{font-size:24px}.rich-preview h2{font-size:20px}.rich-preview h3{font-size:17px}.rich-preview blockquote{margin:10px 0;padding-left:12px;border-left:3px solid #d8d5fb}.rich-preview code{font-family:Consolas,monospace;white-space:pre-wrap}.rich-preview ul,.rich-preview ol{padding-left:26px}.rich-preview table,.table-preview{width:100%;border-collapse:collapse;table-layout:fixed}.rich-preview td,.rich-preview th,.table-preview td,.table-preview th{padding:8px;border:1px solid #dfe3ea;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.rich-preview th,.table-preview th{background:#f2f1ff;color:#5147e5;font-size:10px}.rich-preview del{padding:1px 0;border-radius:3px;background:#ffe3e6;color:#a5263d;text-decoration:line-through}.rich-preview ins{padding:1px 0;border-radius:3px;background:#dcf5e9;color:#116b54;text-decoration:none}.rich-preview del span,.rich-preview del strong,.rich-preview ins span,.rich-preview ins strong{color:inherit}.diff-text{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 "Cascadia Code",Consolas,monospace}.diff-text del{padding:1px 0;border-radius:3px;background:#ffe3e6;color:#a5263d;text-decoration:line-through;text-decoration-thickness:1px}.diff-text ins{padding:1px 0;border-radius:3px;background:#dcf5e9;color:#116b54;text-decoration:none}.diff-legend{color:#98a2b3;font-size:8px;font-weight:600;letter-spacing:0;text-transform:none}.json-controls{display:flex;gap:4px}.json-controls button{min-height:25px;padding:3px 6px;border-radius:6px;font-size:8px}.json-tree{font:11px/1.55 "Cascadia Code",Consolas,monospace}.json-node{margin-left:10px;padding-left:8px;border-left:1px solid #e5e7ed}.json-node>summary{cursor:pointer;list-style:none}.json-node>summary::-webkit-details-marker{display:none}.json-node>summary::before{display:inline-block;width:12px;color:#98a2b3;content:'▸'}.json-node[open]>summary::before{content:'▾'}.json-key{color:#635bff}.json-type{margin-left:6px;color:#98a2b3;font-size:9px}.json-primitive{display:flex;gap:7px;padding-left:21px;overflow-wrap:anywhere}.json-string{color:#16836f}.json-number{color:#b54708}.json-boolean,.json-null{color:#6941c6}.diagram-preview{display:grid;min-height:240px;place-items:center;overflow:auto;border:1px solid #e5e7ed;border-radius:10px;background:#fff}.diagram-preview svg{display:block;max-width:100%;max-height:430px;width:auto;height:auto}.diagram-error{padding:12px;color:#9c3046;font-size:11px}.diagram-code{margin-top:10px;padding:9px 11px;border:1px solid #e5e7ed;border-radius:9px;background:#fafbfc}.diagram-code summary{color:#5147e5;cursor:pointer;font-size:10px;font-weight:650}.diagram-code pre{margin-top:10px}.review-result{color:#344054}.score-top{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}.score-number{font-size:42px;font-weight:780;letter-spacing:-2px;line-height:1}.score-label{color:#758197;font-size:10px}.score-track{height:9px;margin:13px 0 10px;overflow:hidden;border-radius:10px;background:#e9ecf1}.score-fill{height:100%;border-radius:inherit;transition:width .5s ease}.review-stage{margin:0 0 7px;font-size:15px;font-weight:720}.review-summary{margin:0 0 16px;color:#667085;font-size:11px}.review-low .score-number{color:#d92d20}.review-low .score-fill{background:#f04438}.review-mid .score-number{color:#dc6803}.review-mid .score-fill{background:#f79009}.review-good .score-number{color:#16836f}.review-good .score-fill{background:#12b76a}.recommendations-title{margin:0 0 8px;font-size:11px}.recommendations{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;list-style:none}.recommendation{display:flex;align-items:flex-start;gap:9px;padding:9px;border:1px solid #e5e7ed;border-radius:9px;background:#fafbfc}.recommendation-index{display:grid;width:20px;height:20px;flex:none;place-items:center;border-radius:6px;background:#efefff;color:#635bff;font-size:9px;font-weight:750}.recommendation-text{min-width:0;flex:1;font-size:10.5px}.impact{flex:none;padding:2px 5px;border-radius:5px;background:#e8f6ef;color:#16836f;font-size:9px;font-weight:700;white-space:nowrap}.dialog-status{flex:none;margin:0;padding:0 20px;color:#667085;font-size:10px}.dialog-status:not(:empty){padding-top:9px}.dialog-status.error{color:#b4233d}.bottom-area{flex:none;padding:12px 20px;border-top:1px solid #e8eaf0;background:#fff}.apply-mode{display:flex;gap:16px;margin:0 0 10px;padding:0;border:0}.apply-mode label{display:flex;align-items:center;gap:6px;margin:0;color:#526075;font-size:10px;font-weight:500}.apply-mode input{margin:0;accent-color:#635bff}.dialog-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.dialog-actions .primary{border:0;background:linear-gradient(120deg,#5147e5,#635bff);box-shadow:0 4px 10px rgba(81,71,229,.18);color:#fff}.dialog-actions .apply{border:0;background:#16836f;color:#fff}.dialog-actions .spacer{flex:1}.scenario-save-overlay{position:fixed;inset:0;z-index:5;display:grid;place-items:center;padding:20px;background:rgba(23,32,51,.48);pointer-events:auto}.scenario-save-overlay[hidden]{display:none!important}.scenario-save-card{width:min(520px,100%);padding:20px;border-radius:14px;background:#fff;box-shadow:0 20px 60px rgba(23,32,51,.25)}.scenario-save-card h3{margin:0 0 14px;font-size:17px}.scenario-save-card label{margin-top:12px}.scenario-save-card textarea{min-height:120px}.scenario-save-error{color:#b4233d!important;font-size:10px}.scenario-save-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes dialog-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@media(max-width:760px){.dialog{width:calc(100vw - 20px);height:calc(100vh - 20px)}.comparison{grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr);padding:12px}.prompt-row{align-items:stretch;flex-direction:column}.shortcut{display:none}}@media(prefers-reduced-motion:reduce){.dialog{animation:none}.loader-spinner{animation-duration:1.5s}.score-fill{transition:none}}
    `;
    root.appendChild(style);
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.setAttribute('aria-label', 'AI-сравнение выделенного текста');
    root.appendChild(dialog);

    function add(tag, text, parent = dialog) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null && text !== '') node.textContent = text;
      parent.appendChild(node);
      return node;
    }
    function formatted(documentValue, parent, decorations = null) {
      const box = add('div', '', parent);
      box.className = 'rich-preview';
      box.innerHTML = Rich.html(documentValue, false, decorations);
      box.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
      return box;
    }
    function richDecorations(before, after) {
      const parts = new Map();
      function walk(left, right, path = '') {
        if (['text', 'codeBlock'].includes(left.type)) {
          if (left.text !== right.text) parts.set(path, Preview.diff(left.text, right.text));
          return;
        }
        if (left.content) left.content.forEach((child, index) => walk(child, right.content[index], path ? path + '.' + index : String(index)));
      }
      walk(before, after);
      return parts;
    }
    function textOf(source) {
      if (typeof source === 'string') return source;
      if (source && source.format === 'rich-text') return source.text || Rich.text(source.document);
      if (source && Array.isArray(source.cells)) return source.cells.map(cell => cell.text).join('\n');
      return '';
    }

    const titles = {
      review: 'Полнота требований', spelling: 'Исправление текста', custom: 'AI-редактор',
      format: 'Оформление текста', table: 'Редактирование таблицы', json: 'JSON и XML', diagram: 'Редактор схемы'
    };
    const header = add('div', ''); header.className = 'dialog-header';
    const mark = add('span', 'AI', header); mark.className = 'brand-mark'; mark.setAttribute('aria-hidden', 'true');
    const heading = add('div', '', header); heading.className = 'heading';
    add('div', 'CONFLUENCE AI EXPORTER', heading).className = 'kicker';
    add('h2', titles[message.action] || 'AI-редактор', heading);
    if (message.shortcut) add('span', message.shortcut, header).className = 'shortcut';
    const closeButton = add('button', '×', header); closeButton.type = 'button'; closeButton.className = 'close-button'; closeButton.setAttribute('aria-label', 'Закрыть');

    const body = add('div', ''); body.className = 'dialog-body';
    const promptBlock = add('div', '', body); promptBlock.className = 'prompt-block';
    const prompted = ['custom', 'format', 'table', 'json', 'diagram'].includes(message.action);
    let prompt, scenarioSelect, scenarioName, scenarioStatus, scenarioSave, scenarioSavePanel;
    const scenarioMap = new Map();
    let selectedScenarioId = null, populateScenarios;

    if (prompted && !message.error) {
      if (message.action === 'custom') {
        const scenarioLabel = add('label', 'Готовый сценарий', promptBlock);
        scenarioSelect = add('select', '', scenarioLabel); scenarioSelect.className = 'scenario-select';
        add('option', 'Выберите сценарий', scenarioSelect).value = '';
      }
      const row = add('div', '', promptBlock); row.className = 'prompt-row';
      const field = add('div', '', row); field.className = 'prompt-field';
      const label = add('label', message.action === 'json' || message.action === 'diagram' ? 'Что изменить? (необязательно)' : 'Инструкция для AI', field);
      prompt = add('textarea', '', label); prompt.maxLength = 4000;
      prompt.placeholder = message.action === 'table' ? 'Например: «да» — зелёный фон, «нет» — жёлтый'
        : message.action === 'format' ? 'Например: ключевые слова жирным, первую строку заголовком'
          : message.action === 'json' ? 'Например: добавь необязательный блок и переименуй ключ'
            : message.action === 'diagram' ? 'Например: исправь стрелки и уточни подписи'
              : 'Например: сократи текст, сохранив важные детали';
      if (message.action === 'custom') {
        const scenarioActions = add('div', '', promptBlock); scenarioActions.className = 'scenario-actions';
        scenarioSave = add('button', 'Сохранить как сценарий', scenarioActions); scenarioSave.type = 'button';
        scenarioStatus = add('p', '', scenarioActions); scenarioStatus.className = 'scenario-status'; scenarioStatus.setAttribute('role', 'status'); scenarioStatus.hidden = true;
        scenarioSavePanel = add('div', '', dialog); scenarioSavePanel.className = 'scenario-save-overlay'; scenarioSavePanel.hidden = true;
        scenarioSavePanel.setAttribute('role', 'dialog'); scenarioSavePanel.setAttribute('aria-modal', 'true'); scenarioSavePanel.setAttribute('aria-label', 'Сохранение сценария');
        const saveCard = add('div', '', scenarioSavePanel); saveCard.className = 'scenario-save-card';
        add('h3', 'Сохранить сценарий', saveCard);
        const nameLabel = add('label', 'Название', saveCard); scenarioName = add('input', '', nameLabel); scenarioName.type = 'text'; scenarioName.maxLength = 64;
        const promptLabel = add('label', 'Инструкция', saveCard); const scenarioPrompt = add('textarea', '', promptLabel); scenarioPrompt.maxLength = 4000;
        const scenarioSaveError = add('p', '', saveCard); scenarioSaveError.className = 'scenario-save-error'; scenarioSaveError.hidden = true;
        const saveActions = add('div', '', saveCard); saveActions.className = 'scenario-save-actions';
        const confirmScenario = add('button', 'Сохранить', saveActions); confirmScenario.type = 'button';
        const cancelScenario = add('button', 'Отмена', saveActions); cancelScenario.type = 'button';
        function closeScenarioEditor() { scenarioSavePanel.hidden = true; scenarioSave.focus(); }
        cancelScenario.onclick = closeScenarioEditor;
        scenarioSave.onclick = () => {
          const selectedScenario = scenarioMap.get(scenarioSelect.value);
          scenarioName.value = selectedScenarioId && selectedScenario ? selectedScenario.name : '';
          scenarioPrompt.value = prompt.value;
          scenarioSaveError.hidden = true; scenarioSavePanel.hidden = false; scenarioName.focus();
        };
        confirmScenario.onclick = async () => {
          const name = scenarioName.value.trim(), scenarioText = scenarioPrompt.value.trim();
          if (!name || !scenarioText) { scenarioSaveError.textContent = 'Заполните название и инструкцию.'; scenarioSaveError.hidden = false; return; }
          confirmScenario.disabled = true;
          try {
            const response = await chrome.runtime.sendMessage({ type: 'md-ai-save-scenario', name, prompt: scenarioText, scenarioId: selectedScenarioId });
            if (!response || !response.ok) throw new Error(response ? response.error : 'Не удалось сохранить сценарий.');
            populateScenarios(response.scenarios); scenarioSelect.value = 'custom:' + response.scenario.id;
            selectedScenarioId = response.scenario.id; prompt.value = response.scenario.prompt; closeScenarioEditor();
            scenarioStatus.textContent = response.updated ? 'Сценарий обновлён.' : 'Сценарий сохранён.'; scenarioStatus.hidden = false;
          } catch (error) { scenarioSaveError.textContent = error.message; scenarioSaveError.hidden = false; }
          finally { confirmScenario.disabled = false; }
        };
      }
    }

    const comparison = add('div', '', body); comparison.className = 'comparison';
    const originalPane = add('section', '', comparison); originalPane.className = 'pane original-pane';
    const originalHeader = add('div', '', originalPane); originalHeader.className = 'pane-header'; add('span', 'Исходный текст', originalHeader);
    const originalContent = add('div', '', originalPane); originalContent.className = 'pane-content';
    const loader = add('div', '', comparison); loader.className = 'comparison-loader';
    add('div', '', loader).className = 'loader-spinner'; add('span', 'AI работает…', loader);
    const resultPane = add('section', '', comparison); resultPane.className = 'pane result-pane';
    const resultHeader = add('div', '', resultPane); resultHeader.className = 'pane-header'; add('span', 'Результат AI', resultHeader);
    const resultContent = add('div', '', resultPane); resultContent.className = 'pane-content';

    function placeholder(text = 'Здесь появится результат AI') {
      resultContent.replaceChildren();
      const empty = add('div', '', resultContent); empty.className = 'placeholder';
      add('span', '✦', empty).className = 'placeholder-icon'; add('p', text, empty);
    }
    function renderOriginal() {
      originalContent.replaceChildren();
      const source = message.snapshot && message.snapshot.source;
      if (!source) { add('p', 'Выделенный текст недоступен.', originalContent); return; }
      if (source.format === 'rich-text') formatted(source.document, originalContent);
      else if (Array.isArray(source.cells)) {
        const table = add('table', '', originalContent); table.className = 'table-preview';
        for (const cell of source.cells) {
          const row = add('tr', '', table); add('td', 'Строка ' + cell.row + ', столбец ' + cell.column, row); add('td', cell.text, row);
        }
      } else add('pre', source, originalContent);
    }
    renderOriginal(); placeholder();

    function renderDiff(parts, side) {
      const box = add('div', ''); box.className = 'diff-text';
      for (const part of parts) {
        if (side === 'old' && part.type === 'insert') continue;
        if (side === 'new' && part.type === 'delete') continue;
        add(part.type === 'equal' ? 'span' : part.type === 'delete' ? 'del' : 'ins', part.text, box);
      }
      return box;
    }
    function renderJson(value) {
      const tree = add('div', '', resultContent); tree.className = 'json-tree';
      let nodes = 0;
      function entry(key, item, parent, depth) {
        if (++nodes > 5000) return;
        const object = item !== null && typeof item === 'object';
        if (object) {
          const details = add('details', '', parent); details.className = 'json-node'; details.open = depth < 3;
          const summary = add('summary', '', details);
          add('span', key, summary).className = 'json-key';
          add('span', Array.isArray(item) ? '[' + item.length + ']' : '{' + Object.keys(item).length + '}', summary).className = 'json-type';
          for (const [childKey, child] of Object.entries(item)) entry(childKey, child, details, depth + 1);
        } else {
          const row = add('div', '', parent); row.className = 'json-primitive';
          add('span', key + ':', row).className = 'json-key';
          const type = item === null ? 'null' : typeof item;
          add('span', typeof item === 'string' ? '"' + item + '"' : String(item), row).className = 'json-' + type;
        }
      }
      entry('root', value, tree, 0);
      const controls = add('div', '', resultHeader); controls.className = 'json-controls';
      const expand = add('button', 'Развернуть', controls); expand.type = 'button';
      const collapse = add('button', 'Свернуть', controls); collapse.type = 'button';
      expand.onclick = () => tree.querySelectorAll('details').forEach(node => { node.open = true; });
      collapse.onclick = () => tree.querySelectorAll('details').forEach(node => { node.open = false; });
    }
    const svgNS = 'http://www.w3.org/2000/svg';
    function svgNode(tag, attrs, parent, text) {
      const node = document.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
      if (text) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    function plantSvg(source) {
      const model = Preview.plantUmlModel(source);
      if (!model) return null;
      const width = 720;
      const names = model.type === 'flow' ? [...new Set(model.edges.flatMap(edge => [edge.from, edge.to]))] : [];
      const height = model.type === 'sequence' ? 100 + model.messages.length * 66 : 60 + names.length * 86;
      const svg = svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': 'Предпросмотр PlantUML' });
      const defs = svgNode('defs', {}, svg);
      const marker = svgNode('marker', { id: 'arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto' }, defs);
      svgNode('path', { d: 'M0,0 L8,4 L0,8 z', fill: '#635bff' }, marker);
      if (model.type === 'sequence') {
        const step = width / model.participants.length;
        const positions = new Map(model.participants.map((name, index) => [name, step * index + step / 2]));
        model.participants.forEach(name => {
          const x = positions.get(name);
          svgNode('line', { x1: x, y1: 60, x2: x, y2: height - 15, stroke: '#d7d9e2', 'stroke-dasharray': '4 4' }, svg);
          svgNode('rect', { x: x - Math.min(70, step * .4), y: 15, width: Math.min(140, step * .8), height: 38, rx: 8, fill: '#efefff', stroke: '#c9c5f6' }, svg);
          svgNode('text', { x, y: 39, 'text-anchor': 'middle', fill: '#344054', 'font-size': 12, 'font-family': 'Segoe UI' }, svg, name.slice(0, 24));
        });
        model.messages.forEach((item, index) => {
          const y = 90 + index * 66, from = positions.get(item.from), to = positions.get(item.to);
          if (from === to) {
            svgNode('path', { d: 'M' + from + ',' + y + ' C' + (from + 42) + ',' + (y - 25) + ' ' + (from + 42) + ',' + (y + 25) + ' ' + from + ',' + y, fill: 'none', stroke: '#635bff', 'stroke-width': 1.7, 'marker-end': 'url(#arrow)' }, svg);
            svgNode('text', { x: from, y: y - 31, 'text-anchor': 'middle', fill: '#475467', 'font-size': 11, 'font-family': 'Segoe UI' }, svg, item.text.slice(0, 70));
          } else {
            svgNode('line', { x1: from, y1: y, x2: to, y2: y, stroke: '#635bff', 'stroke-width': 1.7, 'marker-end': 'url(#arrow)' }, svg);
            svgNode('text', { x: (from + to) / 2, y: y - 9, 'text-anchor': 'middle', fill: '#475467', 'font-size': 11, 'font-family': 'Segoe UI' }, svg, item.text.slice(0, 70));
          }
        });
      } else {
        const positions = new Map(names.map((name, index) => [name, 48 + index * 86]));
        model.edges.forEach(edge => {
          const y = positions.get(edge.from), next = positions.get(edge.to);
          svgNode('line', { x1: 360, y1: y + 20, x2: 360, y2: next - 25, stroke: '#635bff', 'stroke-width': 1.7, 'marker-end': 'url(#arrow)' }, svg);
          if (edge.text) svgNode('text', { x: 375, y: (y + next) / 2, fill: '#667085', 'font-size': 11 }, svg, edge.text);
        });
        names.forEach(name => {
          const y = positions.get(name);
          svgNode('rect', { x: 270, y: y - 24, width: 180, height: 46, rx: 10, fill: '#efefff', stroke: '#c9c5f6' }, svg);
          svgNode('text', { x: 360, y: y + 4, 'text-anchor': 'middle', fill: '#344054', 'font-size': 12, 'font-family': 'Segoe UI' }, svg, name.slice(0, 30));
        });
      }
      return svg;
    }
    async function renderDiagram(source, version) {
      const preview = add('div', '', resultContent); preview.className = 'diagram-preview';
      const mermaidId = 'md-mermaid-' + version;
      try {
        if (/@start\w*/i.test(source)) {
          const svg = plantSvg(source);
          if (svg) preview.appendChild(svg);
          else { preview.remove(); add('pre', source, resultContent); return; }
        } else {
          if (!window.mermaid) throw new Error('Локальный рендерер Mermaid не загружен.');
          window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
          const rendered = await window.mermaid.render(mermaidId, source);
          if (version !== renderVersion) return;
          preview.innerHTML = rendered.svg;
        }
        const details = add('details', '', resultContent); details.className = 'diagram-code';
        add('summary', 'Показать код схемы', details); add('pre', source, details);
      } catch (error) {
        preview.replaceChildren(); add('div', 'Не удалось отрисовать схему. Проверьте код ниже.', preview).className = 'diagram-error';
        const details = add('details', '', resultContent); details.className = 'diagram-code'; details.open = true;
        add('summary', 'Код схемы', details); add('pre', source, details);
      } finally {
        // Mermaid may leave its temporary render container after a syntax error.
        for (const node of [document.getElementById(mermaidId), document.getElementById('d' + mermaidId)]) {
          if (node) node.remove();
        }
      }
    }
    function renderReview(result) {
      const score = Math.max(0, Math.min(100, result.score));
      const box = add('div', '', resultContent); box.className = 'review-result ' + (score < 30 ? 'review-low' : score < 80 ? 'review-mid' : 'review-good');
      const top = add('div', '', box); top.className = 'score-top';
      add('div', score + '%', top).className = 'score-number'; add('span', 'готовность к разработке', top).className = 'score-label';
      const track = add('div', '', box); track.className = 'score-track';
      const fill = add('div', '', track); fill.className = 'score-fill'; fill.style.width = score + '%';
      const stage = score < 30 ? 'Черновик: документ пока сырой' : score < 60 ? 'Требует серьёзной доработки' : score < 80 ? 'Есть недочёты, которые стоит исправить' : score < 90 ? 'В целом готово, но лучше довести до 90+' : 'Готово к разработке';
      add('h3', stage, box).className = 'review-stage';
      if (result.summary) add('p', result.summary, box).className = 'review-summary';
      add('h4', 'Что улучшить', box).className = 'recommendations-title';
      const list = add('ul', '', box); list.className = 'recommendations';
      result.recommendations.forEach((item, index) => {
        const row = add('li', '', list); row.className = 'recommendation';
        add('span', String(index + 1), row).className = 'recommendation-index';
        add('span', item.text, row).className = 'recommendation-text';
        if (item.impact) add('span', '+' + item.impact + ' п.п.', row).className = 'impact';
      });
    }

    let renderVersion = 0;
    let currentResult = null;
    async function renderResult(result) {
      const version = ++renderVersion;
      resultContent.replaceChildren();
      if (message.action === 'review') { renderReview(result); return; }
      if (message.action === 'spelling') {
        const richSource = message.snapshot.source && message.snapshot.source.format === 'rich-text';
        if (richSource && result && result.format === 'rich-text') {
          const parts = richDecorations(message.snapshot.source.document, result.document);
          originalContent.replaceChildren();
          formatted(message.snapshot.source.document, originalContent, { parts, side: 'old' });
          formatted(result.document, resultContent, { parts, side: 'new' });
        } else {
          const before = textOf(message.snapshot.source), after = String(result);
          const parts = Preview.diff(before, after);
          originalContent.replaceChildren(); originalContent.appendChild(renderDiff(parts, 'old'));
          resultContent.appendChild(renderDiff(parts, 'new'));
        }
        add('span', 'Изменения подсвечены', originalHeader).className = 'diff-legend';
        return;
      }
      if (message.action === 'table') {
        const table = add('table', '', resultContent); table.className = 'table-preview';
        const headerRow = add('tr', '', table); ['Ячейка', 'Результат'].forEach(text => add('th', text, headerRow));
        for (const change of result.cells) {
          const before = message.snapshot.source.cells.find(cell => cell.id === change.id);
          const row = add('tr', '', table); add('td', 'Строка ' + before.row + ', столбец ' + before.column, row);
          const cell = add('td', 'text' in change ? change.text : before.text, row);
          cell.style.backgroundColor = 'backgroundColor' in change ? change.backgroundColor : before.backgroundColor;
          cell.style.color = 'color' in change ? change.color : before.color;
        }
        return;
      }
      if (result && result.format === 'rich-text') { formatted(result.document, resultContent); return; }
      if (message.action === 'json') {
        try { renderJson(JSON.parse(result)); }
        catch (_) { add('pre', result, resultContent); }
        return;
      }
      if (message.action === 'diagram') { await renderDiagram(String(result), version); return; }
      add('pre', result, resultContent);
    }

    const status = add('p', '', body); status.className = 'dialog-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const bottom = add('div', ''); bottom.className = 'bottom-area';
    const applyMode = add('fieldset', '', bottom); applyMode.className = 'apply-mode'; applyMode.hidden = true;
    let selectedMode = 'replace';
    for (const [value, text] of [['replace', 'Заменить выделение'], ['after', 'Вставить после выделения']]) {
      const label = add('label', '', applyMode); const radio = add('input', '', label);
      radio.type = 'radio'; radio.name = 'applyMode'; radio.value = value; radio.checked = value === 'replace'; add('span', text, label);
      radio.onchange = () => { if (radio.checked) selectedMode = value; };
    }
    const actions = add('div', '', bottom); actions.className = 'dialog-actions';
    const cancel = add('button', 'Закрыть', actions); cancel.type = 'button';
    const spacer = add('span', '', actions); spacer.className = 'spacer';
    const run = add('button', message.action === 'review' ? 'Проверить требования' : 'Запустить AI', actions); run.type = 'button'; run.className = 'primary';
    const readOnly = !!(message.snapshot && message.snapshot.readOnly);
    const apply = add('button', readOnly ? 'Копировать результат' : message.action === 'table' ? 'Применить изменения' : 'Заменить выделение', actions); apply.type = 'button'; apply.className = 'apply'; apply.hidden = true;
    if (message.action === 'review') run.classList.add('review-run');

    if (scenarioSelect) {
      populateScenarios = data => {
        scenarioSelect.replaceChildren(); add('option', 'Выберите сценарий', scenarioSelect).value = ''; scenarioMap.clear();
        for (const [name, values, prefix] of [['Готовые', data && data.presets, 'preset:'], ['Мои', data && data.custom, 'custom:']]) {
          if (!Array.isArray(values) || !values.length) continue;
          const group = document.createElement('optgroup'); group.label = name; scenarioSelect.appendChild(group);
          for (const item of values) {
            const option = add('option', item.name, group); option.value = prefix + item.id; scenarioMap.set(option.value, item);
          }
        }
      };
      populateScenarios(message.scenarios);
      scenarioSelect.onchange = () => {
        const scenario = scenarioMap.get(scenarioSelect.value);
        if (scenario) { selectedScenarioId = scenarioSelect.value.startsWith('custom:') ? scenario.id : null; prompt.value = scenario.prompt; prompt.focus(); }
      };
    }

    let closed = false;
    const id = message.snapshot && message.snapshot.id;
    async function send(type, extra) {
      const result = await chrome.runtime.sendMessage({ type, id, ...extra });
      if (!result || !result.ok) throw new Error(result ? result.error : 'Фоновый процесс недоступен.');
      return result;
    }
    function close() {
      if (closed) return;
      closed = true; if (dialog.open) dialog.close(); host.remove(); closePrevious = null;
      if (id) send('md-ai-close').catch(() => {});
    }
    closePrevious = close; closeButton.onclick = close; cancel.onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); if (scenarioSavePanel && !scenarioSavePanel.hidden) scenarioSavePanel.hidden = true; else close(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(dialog.querySelectorAll('button, textarea, select, input, summary')).filter(node => !node.hidden && !node.disabled && !node.closest('[hidden]'));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    function fail(error) {
      status.textContent = error.message; status.className = 'dialog-status error';
      status.tabIndex = -1; status.focus(); status.scrollIntoView({ block: 'nearest' });
    }
    function setBusy(value) {
      run.disabled = value || !!message.error;
      run.textContent = value ? 'Выполняется…' : currentResult ? (message.action === 'review' ? 'Повторить анализ' : 'Повторить запрос') : message.action === 'review' ? 'Проверить требования' : 'Запустить AI';
      if (prompt) prompt.disabled = value;
      if (scenarioSelect) scenarioSelect.disabled = value;
      if (scenarioSave) scenarioSave.disabled = value;
      loader.classList.toggle('is-visible', value);
      resultPane.classList.toggle('is-loading', value);
      if (currentResult) apply.disabled = value;
    }
    run.disabled = !!message.error;
    run.onclick = async () => {
      if (closed) return;
      setBusy(true); status.textContent = ''; status.className = 'dialog-status'; apply.hidden = true; applyMode.hidden = true;
      try {
        const response = await send('md-ai-run', { prompt: prompt ? prompt.value : '' });
        if (closed) return;
        currentResult = response.result;
        await renderResult(response.result);
        if (message.action !== 'review') {
          apply.hidden = false;
          applyMode.hidden = message.action === 'table' || readOnly;
        }
        status.textContent = message.action === 'review' ? '' : readOnly
          ? 'Сложный блок не изменяется автоматически. Скопируйте результат и вставьте его вручную.'
          : 'Проверьте результат перед вставкой.';
      } catch (error) { if (!closed) fail(error); }
      finally { if (!closed) setBusy(false); }
    };
    apply.onclick = async () => {
      if (readOnly) {
        const value = currentResult && currentResult.format === 'rich-text' ? Rich.text(currentResult.document) : String(currentResult);
        apply.disabled = true;
        try {
          try { await navigator.clipboard.writeText(value); }
          catch (_) {
            const area = add('textarea', '', dialog); area.value = value; area.style.cssText = 'position:fixed;left:-10000px;top:0';
            area.focus(); area.select();
            const copied = document.execCommand('copy'); area.remove();
            if (!copied) throw new Error('Не удалось скопировать результат. Выделите его в правой панели и скопируйте вручную.');
          }
          status.className = 'dialog-status'; status.textContent = 'Результат скопирован в буфер обмена.';
        } catch (error) { fail(error); }
        finally { apply.disabled = false; }
        return;
      }
      apply.disabled = true; dialog.close();
      try { await send('md-ai-apply', { mode: message.action === 'table' ? 'replace' : selectedMode }); if (!closed) close(); }
      catch (error) { if (!closed) { dialog.showModal(); apply.disabled = false; fail(error); } }
    };

    document.documentElement.appendChild(host);
    dialog.showModal();
    (prompt || (message.error ? cancel : run)).focus();
  });
})();
