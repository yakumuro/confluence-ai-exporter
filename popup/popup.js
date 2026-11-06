/**
 * Popup расширения: настройки выгрузки, дерево дочерних страниц, прогресс.
 */
(function () {
  'use strict';

  const CONTENT_FILES = [
    'lib/zip.js',
    'lib/converter.js',
    'lib/asciidoc.js',
    'lib/markdown-importer.js',
    'lib/confluence-api.js',
    'content/content.js',
    'lib/ai-shortcuts.js',
    'content/ai-shortcuts.js'
  ];
  const SETTINGS_KEY = 'mdExporterSettings';
  const ONBOARDING_KEY = 'mdExporterOnboardingSeen';
  const STORIES = [
    { visual: 'connection', title: 'Работает с вашим Confluence', text: 'Просто откройте нужную страницу — домен определять и настраивать не нужно. Подключите своего AI-провайдера через кнопку с шестерёнкой.' },
    { visual: 'documents', title: 'Markdown и AsciiDoc', text: 'Экспортируйте одну страницу или целое дерево вместе с вложениями. Импорт Markdown и AsciiDoc поможет перенести материалы обратно.' },
    { visual: 'editing', title: 'Точечные AI-правки', text: 'Выделите текст и исправьте ошибки, измените оформление, JSON или схему. При коррекции текста исходное форматирование сохраняется.' },
    { visual: 'context', title: 'AI функции по выделенному тексту', text: 'Выделите нужный фрагмент и откройте контекстное меню. Выберите действие Confluence AI Exporter, чтобы исправить или преобразовать только этот текст.' },
    { visual: 'review', title: 'Проверка готовности', text: 'AI оценит полноту и непротиворечивость требований, покажет процент готовности и конкретные рекомендации для улучшения.' }
  ];
  const STORY_VISUALS = {
    documents: '<div class="docs-scene"><span class="file-chip chip-md"><b>.md</b><small>Markdown</small></span><div class="doc-sheet"><span class="doc-fold"></span><b>Confluence</b><i></i><i></i><i></i><em>страница + вложения</em></div><span class="file-chip chip-adoc"><b>.adoc</b><small>AsciiDoc</small></span><span class="exchange-arrow arrow-forward">→</span><span class="exchange-arrow arrow-back">←</span></div>',
    editing: '<div class="editing-scene"><div class="editor-sheet"><div class="editor-top"><i></i><i></i><i></i><span>AI-редактор</span></div><p>Текст <del>с ошипкой</del></p><p>Текст <mark>с ошибкой</mark></p><i class="editor-line"></i><i class="editor-line short"></i><span class="editor-cursor"></span></div><span class="ai-orb">AI</span><span class="spark spark-one"></span><span class="spark spark-two"></span></div>',
    context: '<div class="context-scene"><div class="context-page"><i></i><i></i><p>Выделите <span>нужный фрагмент</span> текста</p><i></i><i></i></div><div class="context-menu"><b>Confluence AI Exporter</b><span class="menu-active">Исправить текст</span><span>Изменить оформление</span><span>Проверить требования</span></div><span class="mouse-pointer"></span></div>',
    review: '<div class="review-scene"><div class="score-ring"><span>92<small>%</small></span></div><div class="review-report"><b>Готово к разработке</b><span><i>✓</i>Сценарии описаны</span><span><i>✓</i>Критерии измеримы</span><span><i>✓</i>Зависимости учтены</span></div></div>',
    connection: '<div class="connection-scene"><span class="connect-node node-one"></span><span class="connect-node node-two"></span><span class="connect-node node-three"></span><div class="confluence-hub"><img src="../icons/logo.svg" alt=""><b>Confluence</b><span>подключено</span></div><div class="secure-pill"><i>✓</i>Локально и под контролем</div></div>'
  };
  let storyIndex = 0;
  let onboardingReturnFocus = null;
  function onboardingOpen() {
    return !document.getElementById('onboarding').hidden;
  }
  function renderStory() {
    const story = STORIES[storyIndex];
    const visual = document.getElementById('storyVisual');
    visual.className = 'story-visual story-visual-' + story.visual;
    visual.innerHTML = STORY_VISUALS[story.visual];
    document.getElementById('storyTitle').textContent = story.title;
    document.getElementById('storyText').textContent = story.text;
    const card = document.getElementById('storyCard');
    card.classList.remove('story-enter');
    void card.offsetWidth;
    card.classList.add('story-enter');
    document.getElementById('storyPrev').disabled = storyIndex === 0;
    document.getElementById('storyNext').textContent = storyIndex === STORIES.length - 1 ? 'Начать работу' : 'Далее';
    document.querySelectorAll('#storyProgress button').forEach(function (button, index) {
      button.classList.toggle('is-active', index === storyIndex);
      if (index === storyIndex) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  function openOnboarding() {
    if (onboardingOpen()) return;
    onboardingReturnFocus = document.activeElement;
    storyIndex = 0;
    document.getElementById('onboarding').hidden = false;
    renderStory();
    document.getElementById('storyNext').focus();
  }
  function closeOnboarding() {
    if (!onboardingOpen()) return;
    document.getElementById('onboarding').hidden = true;
    const saved = {}; saved[ONBOARDING_KEY] = true;
    chrome.storage.local.set(saved);
    if (onboardingReturnFocus && onboardingReturnFocus.isConnected) onboardingReturnFocus.focus();
    onboardingReturnFocus = null;
  }
  function moveStory(step) {
    if (step > 0 && storyIndex === STORIES.length - 1) { closeOnboarding(); return; }
    storyIndex = Math.max(0, Math.min(STORIES.length - 1, storyIndex + step));
    renderStory();
  }
  document.getElementById('aiSettings').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('showOnboarding').addEventListener('click', openOnboarding);
  document.getElementById('storySkip').addEventListener('click', closeOnboarding);
  document.getElementById('storyPrev').addEventListener('click', function () { moveStory(-1); });
  document.getElementById('storyNext').addEventListener('click', function () { moveStory(1); });
  STORIES.forEach(function (_, index) {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-label', 'Сторис ' + (index + 1));
    button.addEventListener('click', function () { storyIndex = index; renderStory(); });
    document.getElementById('storyProgress').appendChild(button);
  });
  document.getElementById('closePopup').addEventListener('click', function () {
    window.close();
  });
  document.addEventListener('keydown', function (event) {
    if (onboardingOpen()) {
      if (event.key === 'Escape') { event.preventDefault(); closeOnboarding(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); moveStory(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); moveStory(1); }
      else if (event.key === 'Tab') {
        const nodes = Array.from(document.querySelectorAll('#onboarding button:not(:disabled)'));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      window.close();
    }
  });

  const el = {};
  let tabId = null;
  let pageInfo = null;
  let treeNodes = [];
  let treeErrors = [];
  let treeLoaded = false;
  let treeLoading = false;
  let treeIndex = new Map();
  let checkboxEls = new Map();
  let running = false;
  let importing = false;

  function cacheElements() {
    [
      'refresh', 'aiTab', 'exportTab', 'importTab', 'aiPanel', 'exportPanel', 'importPanel',
      'alert', 'settings', 'treeBlock', 'tree',
      'treeInfo', 'selectAll', 'selectNone', 'settingsAttachments', 'attachments',
      'outputHint', 'download', 'downloadLabel', 'cancel', 'progressBlock', 'progressFill',
      'progressText', 'errorsToggle', 'errors', 'importCard', 'markdownFile',
      'importButton', 'importStatus',
      'importCodeMacro', 'importCodeTitle', 'importCodeLanguage', 'importExpandMacro',
      'importExpandTitle', 'importPlantUmlMacro', 'contextIndicator', 'contextLabel', 'contextTitle',
      'contextSubtitle', 'fileDropZone', 'fileDropTitle', 'fileDropHint'
    ].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function setContextState(state, title, subtitle) {
    el.contextIndicator.className = 'head-subtitle context-indicator' + (state ? ' is-' + state : '');
    el.contextLabel.textContent = state === 'error' ? 'Ошибка' : state === 'loading' ? 'Проверка' : 'Готово';
    el.contextTitle.textContent = title;
    el.contextSubtitle.textContent = subtitle;
  }

  function updateFilePicker() {
    const file = el.markdownFile.files && el.markdownFile.files[0];
    el.fileDropZone.classList.toggle('has-file', !!file);
    el.fileDropTitle.textContent = file ? file.name : 'Выберите Markdown или AsciiDoc';
    el.fileDropHint.textContent = file
      ? (file.size / 1024).toFixed(file.size >= 10240 ? 0 : 1) + ' КБ · готов к импорту'
      : '.md, .markdown, .adoc, .asciidoc · до 2 МБ';
  }

  function showAlert(text) {
    if (!text) {
      el.alert.classList.add('hidden');
      el.alert.textContent = '';
      return;
    }
    el.alert.textContent = text;
    el.alert.classList.remove('hidden');
  }

  function currentMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : 'page';
  }

  function currentExportFormat() {
    const checked = document.querySelector('input[name="exportFormat"]:checked');
    return checked && checked.value === 'asciidoc' ? 'asciidoc' : 'markdown';
  }

  function currentImportMode() {
    const checked = document.querySelector('input[name="importMode"]:checked');
    return checked ? checked.value : 'append';
  }

  function getImportMacroOptions() {
    return {
      codeMacro: el.importCodeMacro.checked,
      codeMacroTitle: el.importCodeTitle.checked,
      codeLanguage: el.importCodeLanguage.checked,
      codeExpand: el.importExpandMacro.checked,
      codeExpandTitle: el.importExpandTitle.checked,
      plantUmlMacro: el.importPlantUmlMacro.checked
    };
  }

  function updateMacroOptionControls() {
    el.importCodeTitle.disabled = !el.importCodeMacro.checked;
    el.importCodeLanguage.disabled = !el.importCodeMacro.checked;
    el.importExpandTitle.disabled = !el.importExpandMacro.checked;
  }

  function selectView(name) {
    const views = [
      { name: 'ai', tab: el.aiTab, panel: el.aiPanel },
      { name: 'export', tab: el.exportTab, panel: el.exportPanel },
      { name: 'import', tab: el.importTab, panel: el.importPanel }
    ];
    for (const view of views) {
      const selected = view.name === name;
      view.tab.setAttribute('aria-selected', String(selected));
      view.tab.tabIndex = selected ? 0 : -1;
      view.panel.classList.toggle('hidden', !selected);
      view.panel.hidden = !selected;
    }
  }

  async function runAIAction(action, button) {
    showAlert(null);
    if (tabId == null) {
      showAlert('Сначала откройте страницу Confluence.');
      return;
    }
    const buttons = Array.from(document.querySelectorAll('[data-ai-action]'));
    buttons.forEach(function (item) { item.disabled = true; });
    if (button) button.classList.add('is-busy');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'md-ai-open-panel', tabId: tabId, action: action });
      if (!response || !response.ok) showAlert((response && response.error) || 'Не удалось открыть AI-редактор.');
    } catch (error) {
      showAlert(error.message || 'Не удалось открыть AI-редактор.');
    } finally {
      buttons.forEach(function (item) { item.disabled = false; });
      if (button) button.classList.remove('is-busy');
    }
  }

  function setImportStatus(text, type) {
    el.importStatus.textContent = text || '';
    el.importStatus.className = 'import-status' + (type ? ' ' + type : '') + (text ? '' : ' hidden');
  }

  function updateImportControls() {
    if (!el.importButton) return;
    const file = el.markdownFile.files && el.markdownFile.files[0];
    el.importButton.disabled = !pageInfo || !file || importing || running;
    el.download.disabled = !pageInfo || running || importing;
  }

  function jobStorageKey() {
    return 'job:' + tabId;
  }

  function sendToTab(message) {
    return new Promise(function (resolve) {
      if (tabId == null) {
        resolve({ ok: false, error: 'Не удалось определить активную вкладку' });
        return;
      }
      try {
        chrome.tabs.sendMessage(tabId, message, function (response) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'Пустой ответ страницы' });
        });
      } catch (error) {
        resolve({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    });
  }

  async function requestCurrentTabAccess() {
    if (!chrome.permissions || typeof chrome.tabs.get !== 'function') return false;
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = new URL(tab && tab.url ? tab.url : '');
      if (!/^https?:$/.test(url.protocol)) return false;
      const origin = url.origin + '/*';
      if (await chrome.permissions.contains({ origins: [origin] })) return true;
      return await chrome.permissions.request({ origins: [origin] });
    } catch (error) {
      return false;
    }
  }

  async function waitForContentScript() {
    let response = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await sendToTab({ type: 'PING' });
      if (response && response.ok) return response;
      if (attempt < 3) await new Promise(function (resolve) { setTimeout(resolve, 120); });
    }
    return response;
  }

  async function ensureContentScript(options) {
    let response = await sendToTab({ type: 'PING' });
    if (response && response.ok) return response;
    if (options && options.requestAccess === true) await requestCurrentTabAccess();

    let lastError = response && response.error ? response.error : '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: function () { window.__mdExporterInjected = false; }
        });
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: CONTENT_FILES
        });
      } catch (error) {
        lastError = error && error.message ? error.message : String(error);
        if (options && options.requestAccess === true && await requestCurrentTabAccess()) continue;
        break;
      }
      response = await waitForContentScript();
      if (response && response.ok) return response;
      lastError = response && response.error ? response.error : lastError;
    }
    return {
      ok: false,
      error: lastError || 'Не удалось подключиться к текущей странице Confluence.'
    };
  }

  function loadSettings() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(SETTINGS_KEY, function (data) {
        const stored = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        document.querySelector('input[name="mode"][value="' + (stored.mode === 'tree' ? 'tree' : 'page') + '"]').checked = true;
        document.querySelector('input[name="exportFormat"][value="' + (stored.exportFormat === 'asciidoc' ? 'asciidoc' : 'markdown') + '"]').checked = true;
        el.attachments.checked = stored.includeAttachments !== false;
        const savedMacroOptions = stored.importMacroOptions || {};
        const macroOptionElements = {
          codeMacro: el.importCodeMacro,
          codeMacroTitle: el.importCodeTitle,
          codeLanguage: el.importCodeLanguage,
          codeExpand: el.importExpandMacro,
          codeExpandTitle: el.importExpandTitle,
          plantUmlMacro: el.importPlantUmlMacro
        };
        Object.keys(macroOptionElements).forEach(function (key) {
          if (typeof savedMacroOptions[key] === 'boolean') {
            macroOptionElements[key].checked = savedMacroOptions[key];
          }
        });
        updateMacroOptionControls();
        resolve();
      });
    });
  }

  function saveSettings() {
    const payload = {};
    payload[SETTINGS_KEY] = {
      mode: currentMode(),
      exportFormat: currentExportFormat(),
      includeAttachments: el.attachments.checked,
      importMacroOptions: getImportMacroOptions()
    };
    chrome.storage.local.set(payload);
  }

  function markSelected(nodes) {
    return (nodes || []).map(function (node) {
      return {
        id: String(node.id),
        title: node.title || '',
        selected: true,
        children: markSelected(node.children)
      };
    });
  }

  function serializeTree(nodes) {
    return (nodes || []).map(function (node) {
      return {
        id: node.id,
        title: node.title,
        selected: node.selected !== false,
        children: serializeTree(node.children)
      };
    });
  }

  function setSubtreeState(node, selected) {
    node.selected = selected;
    const box = checkboxEls.get(node.id);
    if (box) box.checked = selected;
    for (const child of node.children || []) setSubtreeState(child, selected);
  }

  function countSelected(nodes) {
    let total = 0;
    for (const node of nodes || []) {
      if (node.selected !== false) total += 1;
      total += countSelected(node.children);
    }
    return total;
  }

  function updateOutputHint() {
    const mode = currentMode();
    const format = currentExportFormat();
    const extension = format === 'asciidoc' ? '.adoc' : '.md';
    el.downloadLabel.textContent = format === 'asciidoc' ? 'Скачать AsciiDoc' : 'Скачать Markdown';
    const selectedChildren = mode === 'tree' ? countSelected(treeNodes) : 0;
    const pages = 1 + selectedChildren;
    const withAttachments = el.attachments.checked;
    let text = '';
    if (pages === 1) {
      text = 'Будет скачан один файл <b>' + escapeHtml(safeName(pageInfo ? pageInfo.title : 'Страница')) + extension + '</b>';
      if (withAttachments) text += ' и архив <b>-attachments.zip</b> с папкой attachments, если вложения есть';
      text += '.';
      text += ' Если Chrome спросит про скачивание нескольких файлов, разрешите его.';
    } else {
      text = 'Будет скачан архив <b>' + escapeHtml(safeName(pageInfo ? pageInfo.title : 'Страница')) + '.zip</b>'
        + ' с файлами ' + extension + ' и структурой папок как в Confluence (' + pages + ' стр.).';
      if (!withAttachments) text += ' Вложения не выгружаются: ссылки на них ведут в Confluence.';
    }
    el.outputHint.innerHTML = text;
    el.outputHint.classList.remove('hidden');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeName(value) {
    return String(value || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Страница';
  }

  function renderTree(response) {
    treeIndex = new Map();
    checkboxEls = new Map();
    const fragment = document.createDocumentFragment();

    (function walk(nodes, depth) {
      for (const node of nodes) {
        treeIndex.set(node.id, node);
        const row = document.createElement('label');
        row.className = 'tree-row';
        row.style.paddingLeft = (8 + depth * 14) + 'px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = node.selected !== false;

        const title = document.createElement('span');
        title.textContent = node.title || ('page-' + node.id);
        title.title = title.textContent;

        checkbox.addEventListener('change', function () {
          setSubtreeState(node, checkbox.checked);
          updateTreeInfo();
          updateOutputHint();
        });

        row.appendChild(checkbox);
        row.appendChild(title);
        fragment.appendChild(row);
        checkboxEls.set(node.id, checkbox);

        if (node.children && node.children.length) walk(node.children, depth + 1);
      }
    })(treeNodes, 0);

    el.tree.innerHTML = '';
    el.tree.appendChild(fragment);
    updateTreeInfo(response);
  }

  function updateTreeInfo(response) {
    const selected = countSelected(treeNodes);
    const parts = ['Отмечено: ' + (selected + 1) + ' стр. (включая текущую)'];
    if (response && response.truncated) {
      parts.push('Структура показана частично: ' + response.total + ' стр.');
    }
    const errors = response && Array.isArray(response.errors) ? response.errors : treeErrors;
    if (errors.length) parts.push('Не удалось загрузить ветки: ' + errors.length);
    el.treeInfo.textContent = parts.join(' · ');
  }

  async function loadTree() {
    if (treeLoading || treeLoaded) return;
    treeLoading = true;
    el.tree.innerHTML = '<div class="muted">Загрузка структуры…</div>';
    const response = await sendToTab({ type: 'LOAD_TREE' });
    treeLoading = false;
    if (!response || !response.ok) {
      treeErrors = [];
      el.tree.innerHTML = '<div class="muted">Не удалось загрузить структуру страниц</div>';
      el.treeInfo.textContent = '';
      showAlert((response && response.error) || 'Не удалось загрузить структуру страниц');
      return;
    }
    showAlert(null);
    treeNodes = markSelected(response.tree);
    treeErrors = Array.isArray(response.errors) ? response.errors : [];
    treeLoaded = true;
    renderTree(response);
    updateOutputHint();
  }

  async function refreshPage() {
    showAlert(null);
    const response = await sendToTab({ type: 'PREPARE' });
    if (!response || !response.ok) {
      pageInfo = null;
      el.settings.classList.add('hidden');
      el.settingsAttachments.classList.add('hidden');
      el.importCard.classList.add('hidden');
      el.outputHint.classList.add('hidden');
      el.download.disabled = true;
      setContextState('error', 'Страница недоступна', (response && response.error) || 'Не удалось прочитать страницу Confluence');
      return;
    }
    pageInfo = response.page;
    setContextState('', 'Страница готова к работе', pageInfo.title || 'Confluence');
    el.settings.classList.remove('hidden');
    el.settingsAttachments.classList.remove('hidden');
    el.importCard.classList.remove('hidden');
    updateImportControls();
    updateOutputHint();
    if (currentMode() === 'tree') await loadTree();
  }

  function setFill(percent) {
    el.progressFill.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  function renderErrors(errors) {
    const list = errors || [];
    if (!list.length) {
      el.errorsToggle.classList.add('hidden');
      el.errors.classList.add('hidden');
      el.errors.innerHTML = '';
      return;
    }
    el.errorsToggle.classList.remove('hidden');
    el.errorsToggle.textContent = 'Показать замечания (' + list.length + ')';
    el.errors.innerHTML = '';
    for (const item of list) {
      const li = document.createElement('li');
      li.textContent = item;
      el.errors.appendChild(li);
    }
  }

  function applyJob(job) {
    if (!job) return;
    running = job.state === 'running';
    el.progressBlock.classList.remove('hidden');
    el.cancel.classList.toggle('hidden', !running);
    el.download.disabled = running;

    const total = job.total || 0;
    const current = job.current || 0;
    let percent = 8;
    if (job.state === 'done') percent = 100;
    else if (total > 0) percent = Math.round((current / total) * 100);
    setFill(percent);
    el.progressFill.classList.toggle('indeterminate', job.state === 'running' && total === 0);

    let text = job.message || '';
    if (job.state === 'running' && total > 0) text = (job.message ? job.message + ' · ' : '') + current + '/' + total;
    el.progressText.textContent = text;
    renderErrors(job.errors);
    updateImportControls();
  }

  function resetJobView() {
    el.progressBlock.classList.add('hidden');
    el.cancel.classList.add('hidden');
    el.progressFill.classList.remove('indeterminate');
    setFill(0);
    el.progressText.textContent = '';
    renderErrors([]);
    running = false;
    updateImportControls();
  }

  async function loadJobState() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(jobStorageKey(), function (data) {
        const job = data ? data[jobStorageKey()] : null;
        if (job && job.state === 'running' && Date.now() - (job.startedAt || 0) > 30 * 60 * 1000) {
          job.state = 'error';
          job.message = 'Экспорт был прерван (вкладка закрыта или страница перезагружена). Запустите выгрузку снова.';
        }
        if (job) applyJob(job);
        else resetJobView();
        resolve();
      });
    });
  }

  async function onDownload() {
    if (!pageInfo || importing) return;
    showAlert(null);
    saveSettings();
    const options = {
      format: currentExportFormat(),
      includeAttachments: el.attachments.checked,
      tree: currentMode() === 'tree' ? serializeTree(treeNodes) : [],
      treeErrors: currentMode() === 'tree' ? treeErrors : []
    };
    running = true;
    updateImportControls();
    el.download.disabled = true;
    el.progressBlock.classList.remove('hidden');
    el.cancel.classList.remove('hidden');
    el.progressText.textContent = 'Запуск выгрузки…';
    setFill(8);
    el.progressFill.classList.add('indeterminate');

    const response = await sendToTab({ type: 'START', options: options });
    if (!response || !response.ok) {
      if (response && response.job) {
        applyJob(response.job);
        return;
      }
      running = false;
      el.cancel.classList.add('hidden');
      updateImportControls();
      el.progressBlock.classList.add('hidden');
      showAlert((response && response.error) || 'Не удалось запустить выгрузку');
      return;
    }
    if (response.job) applyJob(response.job);
  }

  async function onCancel() {
    await sendToTab({ type: 'CANCEL' });
    el.progressText.textContent = 'Отмена…';
  }

  async function onImportDocument() {
    if (importing || !pageInfo) return;
    const file = el.markdownFile.files && el.markdownFile.files[0];
    if (!file) {
      setImportStatus('Выберите Markdown- или AsciiDoc-файл.', 'error');
      return;
    }
    if (!/\.(?:md|markdown|mdown|mkd|adoc|asciidoc|asc)$/i.test(file.name)) {
      setImportStatus('Неподдерживаемый файл. Выберите .md, .markdown, .adoc или .asciidoc.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImportStatus('Файл слишком большой. Максимальный размер: 2 МБ.', 'error');
      return;
    }

    const format = /\.(?:adoc|asciidoc|asc)$/i.test(file.name) ? 'asciidoc' : 'markdown';
    importing = true;
    updateImportControls();
    setImportStatus('Чтение файла и сохранение страницы…');
    try {
      const source = await file.text();
      const response = await sendToTab({
        type: 'IMPORT_DOCUMENT',
        source: source,
        format: format,
        mode: currentImportMode(),
        macroOptions: getImportMacroOptions()
      });
      if (!response || !response.ok) {
        setImportStatus((response && response.error) || 'Не удалось импортировать документ.', 'error');
        return;
      }
      setImportStatus(response.message || 'Документ импортирован в Confluence.', 'success');
    } catch (error) {
      setImportStatus(error && error.message ? error.message : String(error), 'error');
    } finally {
      importing = false;
      updateImportControls();
    }
  }

  function bindEvents() {
    const tabs = [el.aiTab, el.exportTab, el.importTab];
    for (const tab of tabs) {
      tab.addEventListener('click', function () {
        selectView(tab.dataset.panel);
      });
      tab.addEventListener('keydown', function (event) {
        let nextIndex = -1;
        const currentIndex = tabs.indexOf(tab);
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex < 0) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        selectView(tabs[nextIndex].dataset.panel);
      });
    }

    for (const button of document.querySelectorAll('[data-ai-action]')) {
      button.addEventListener('click', function () {
        runAIAction(button.dataset.aiAction, button);
      });
    }

    for (const radio of document.querySelectorAll('input[name="mode"]')) {
      radio.addEventListener('change', function () {
        const mode = currentMode();
        el.treeBlock.classList.toggle('hidden', mode !== 'tree');
        saveSettings();
        updateOutputHint();
        if (mode === 'tree') loadTree();
      });
    }

    for (const radio of document.querySelectorAll('input[name="exportFormat"]')) {
      radio.addEventListener('change', function () {
        saveSettings();
        updateOutputHint();
      });
    }

    el.attachments.addEventListener('change', function () {
      saveSettings();
      updateOutputHint();
    });

    el.selectAll.addEventListener('click', function () {
      for (const node of treeNodes) setSubtreeState(node, true);
      updateTreeInfo();
      updateOutputHint();
    });

    el.selectNone.addEventListener('click', function () {
      for (const node of treeNodes) setSubtreeState(node, false);
      updateTreeInfo();
      updateOutputHint();
    });

    el.download.addEventListener('click', onDownload);
    el.cancel.addEventListener('click', onCancel);
    el.markdownFile.addEventListener('change', function () {
      setImportStatus('');
      updateFilePicker();
      updateImportControls();
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      el.fileDropZone.addEventListener(type, function (event) {
        event.preventDefault();
        el.fileDropZone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      el.fileDropZone.addEventListener(type, function (event) {
        event.preventDefault();
        el.fileDropZone.classList.remove('is-dragging');
      });
    });
    el.fileDropZone.addEventListener('drop', function (event) {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      el.markdownFile.files = transfer.files;
      el.markdownFile.dispatchEvent(new Event('change'));
    });
    for (const radio of document.querySelectorAll('input[name="importMode"]')) {
      radio.addEventListener('change', function () {
        updateImportControls();
      });
    }
    el.importButton.addEventListener('click', onImportDocument);
    [
      el.importCodeMacro, el.importCodeTitle, el.importCodeLanguage, el.importExpandMacro,
      el.importExpandTitle, el.importPlantUmlMacro
    ].forEach(function (input) {
      input.addEventListener('change', function () {
        updateMacroOptionControls();
        saveSettings();
      });
    });
    el.refresh.addEventListener('click', async function () {
      el.refresh.disabled = true;
      setContextState('loading', 'Обновляем данные', 'Получаем данные из Confluence…');
      treeLoaded = false;
      treeNodes = [];
      treeErrors = [];
      try {
        await ensureContentScript({ requestAccess: true });
        await refreshPage();
        await loadJobState();
      } finally {
        el.refresh.disabled = false;
      }
    });
    el.errorsToggle.addEventListener('click', function () {
      const hidden = el.errors.classList.toggle('hidden');
      el.errorsToggle.textContent = el.errorsToggle.textContent.replace(/^(Показать|Скрыть)/, hidden ? 'Показать' : 'Скрыть');
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || tabId == null) return;
      const change = changes[jobStorageKey()];
      if (change && change.newValue) applyJob(change.newValue);
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (!message || message.type !== 'MD_EXPORT_JOB_UPDATE' || message.tabId !== tabId || !message.job) return;
      applyJob(message.job);
    });
  }

  async function init() {
    cacheElements();
    bindEvents();
    chrome.storage.local.get(ONBOARDING_KEY, function (data) {
      if (!data || !data[ONBOARDING_KEY]) openOnboarding();
    });

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) {
      setContextState('error', 'Вкладка не найдена', 'Не удалось определить активную вкладку. Откройте меню на странице Confluence.');
      return;
    }
    tabId = tab.id;

    await loadSettings();
    updateFilePicker();
    el.treeBlock.classList.toggle('hidden', currentMode() !== 'tree');

    const ping = await ensureContentScript();
    if (!ping || !ping.ok) {
      setContextState('error', 'Нет подключения к Confluence', (ping && ping.error) || 'Нет доступа к странице. Откройте Confluence и повторите попытку.');
      return;
    }
    await refreshPage();
    await loadJobState();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
