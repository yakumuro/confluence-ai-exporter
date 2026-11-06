"""Create local panel and AI-dialog previews with deterministic Chrome API mocks."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
preview_dir = root / "artifacts"
preview_dir.mkdir(exist_ok=True)

source = (root / "popup" / "popup.html").read_text(encoding="utf-8")
mock = r'''<script>
const noop = () => {};
const reconnectTest = location.search.includes('reconnect');
let connected = true;
let runtimeError = null;
window.chrome = {
  runtime: {
    openOptionsPage: noop,
    getManifest: () => ({ content_scripts: [] }),
    onMessage: { addListener: noop },
    sendMessage: async () => ({ ok: true }),
    get lastError() { return runtimeError; }
  },
  tabs: {
    query: async () => [{ id: 1 }],
    get: async () => ({ id: 1, url: location.href }),
    sendMessage: (id, message, callback) => {
      runtimeError = null;
      if (message.type === 'PING' && !connected) {
        runtimeError = { message: 'Receiving end does not exist' };
        callback();
      }
      else if (message.type === 'PING') callback({ ok: true });
      else if (message.type === 'PREPARE') callback({ ok: true, page: { title: 'Руководство по установке сервиса' } });
      else if (message.type === 'LOAD_TREE') callback({ ok: true, tree: [] });
      else callback({ ok: true });
    }
  },
  scripting: { executeScript: async () => { if (!connected) throw new Error('No host access'); return []; } },
  permissions: {
    contains: async () => connected,
    request: async () => { connected = true; return true; }
  },
  storage: {
    local: { get: (key, callback) => callback(key === 'mdExporterOnboardingSeen' ? { mdExporterOnboardingSeen: !location.hash.includes('onboarding') } : {}), set: noop },
    onChanged: { addListener: noop }
  }
};
</script>'''
source = source.replace('<script src="popup.js"></script>', mock + '\n  <script src="../popup/popup.js"></script>')
source = source.replace('href="popup.css"', 'href="../popup/popup.css"')
source = source.replace('</head>', '<style>*{animation:none!important;transition:none!important}</style></head>')
source = source.replace('</body>', '''<script>
window.addEventListener('load', () => setTimeout(() => {
  const tab = location.hash === '#import' ? 'importTab' : location.hash === '#export' ? 'exportTab' : 'aiTab';
  document.getElementById(tab).click();
  if (reconnectTest) {
    setTimeout(() => {
      connected = false;
      document.getElementById('refresh').click();
    }, 200);
    setTimeout(() => {
      document.title = connected && document.getElementById('contextLabel').textContent === 'Готово' ? 'PASS: reconnect' : 'FAIL: reconnect';
    }, 1100);
  }
  if (location.hash === '#onboarding-test') {
    document.getElementById('storyNext').click();
    const second = document.getElementById('storyTitle').textContent === 'Markdown и AsciiDoc';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const third = document.getElementById('storyTitle').textContent === 'Точечные AI-правки';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const fourth = document.getElementById('storyTitle').textContent === 'AI функции по выделенному тексту';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const fifth = document.getElementById('storyTitle').textContent === 'Проверка готовности';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closed = document.getElementById('onboarding').hidden;
    document.getElementById('showOnboarding').click();
    const reopened = !document.getElementById('onboarding').hidden && document.getElementById('storyTitle').textContent === 'Работает с вашим Confluence';
    document.title = second && third && fourth && fifth && closed && reopened ? 'PASS: onboarding' : 'FAIL: onboarding';
  }
}, 50));
</script></body>''')
(preview_dir / 'popup-preview.html').write_text(source, encoding='utf-8')

settings = (root / 'popup' / 'ai-settings.html').read_text(encoding='utf-8')
settings_mock = '''<script>window.chrome={storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{},setAccessLevel:async()=>{}}}};</script>'''
settings = settings.replace('<script src="../lib/ai-client.js"></script>', settings_mock + '\n  <script src="../lib/ai-client.js"></script>')
settings = settings.replace('src="ai-settings.js"', 'src="../popup/ai-settings.js"')
settings = settings.replace('href="ai-settings.css"', 'href="../popup/ai-settings.css"')
(preview_dir / 'settings-preview.html').write_text(settings, encoding='utf-8')

dialog = r'''<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>AI dialog preview</title>
  <style>
    body{margin:0;background:#f5f6f8;color:#344054;font:15px/1.6 "Segoe UI",sans-serif}
    main{max-width:1000px;margin:30px auto;padding:30px;background:white;border-radius:12px}
  </style>
</head>
<body>
<main><h1>Требования к сервису</h1><p>Демонстрационная страница Confluence для проверки AI-окна.</p></main>
<script>
const previewAction = location.hash.replace('#', '') || 'spelling';
const action = previewAction === 'readonly' ? 'spelling' : previewAction === 'plantuml' || previewAction === 'mermaid' ? 'diagram' : previewAction;
const samples = {
  spelling: {
    source: {
      format: 'rich-text',
      document: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Система должна ' },
        { type: 'text', text: 'позвалять', bold: true, color: '#c9364f' },
        { type: 'text', text: ' пользавателю сохранить ' },
        { type: 'text', text: 'документ', href: '/display/DOCS/Document', color: '#5147e5' },
        { type: 'text', text: ' , даже если сеть временно не доступна.' }
      ] }] }
    },
    result: {
      format: 'rich-text',
      document: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Система должна ' },
        { type: 'text', text: 'позволять', bold: true, color: '#c9364f' },
        { type: 'text', text: ' пользователю сохранить ' },
        { type: 'text', text: 'документ', href: '/display/DOCS/Document', color: '#5147e5' },
        { type: 'text', text: ', даже если сеть временно недоступна.' }
      ] }] }
    }
  },
  review: {
    source: 'Сервис должен сохранять рабочий документ. Пользователь может продолжить редактирование при кратковременном отсутствии сети. После восстановления соединения изменения отправляются на сервер.',
    result: {
      format: 'review', score: 68,
      summary: 'Основной сценарий понятен, но перед разработкой нужно уточнить критерии приемки и поведение при конфликтах.',
      recommendations: [
        { text: 'Добавьте измеримые критерии приемки для локального сохранения и последующей синхронизации.', impact: 12 },
        { text: 'Опишите разрешение конфликтов, если документ изменился на сервере и на устройстве.', impact: 9 },
        { text: 'Укажите ограничения по времени автономной работы и объёму сохраняемых данных.', impact: 6 }
      ]
    }
  },
  json: {
    source: '{"service":{"name":"documents","enabled":true},"retry":{"attempts":3}}',
    result: JSON.stringify({ service: { name: 'documents', enabled: true, owners: ['platform', 'analytics'] }, retry: { attempts: 3, delayMs: 500, strategy: 'exponential' }, limits: { maxSizeMb: 25, offline: null } }, null, 2)
  },
  custom: {
    source: 'Система сохраняет документ локально при потере сети. После восстановления соединения документ синхронизируется с сервером.',
    result: 'При потере сети документ сохраняется локально, а после восстановления соединения автоматически синхронизируется с сервером.'
  },
  plantuml: {
    source: '@startuml\nparticipant Пользователь as User\nparticipant Сервис as Service\nUser -> Service: Сохранить документ\nService --> Service: Проверить данные\nService --> User: Результат сохранения\n@enduml',
    result: '@startuml\nparticipant Пользователь as User\nparticipant Сервис as Service\nUser -> Service: Сохранить документ\nService --> Service: Проверить данные\nService --> User: Результат сохранения\n@enduml'
  },
  mermaid: {
    source: 'flowchart TD\nA[Документ] --> B{Есть сеть?}\nB -->|Да| C[Сохранить на сервере]\nB -->|Нет| D[Сохранить локально]\nD --> C',
    result: 'flowchart TD\nA[Документ] --> B{Есть сеть?}\nB -->|Да| C[Сохранить на сервере]\nB -->|Нет| D[Сохранить локально]\nD --> C'
  }
};
const sample = samples[previewAction] || samples.spelling;
let dialogRoot;
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(options) {
  const shadow = attachShadow.call(this, options);
  if (this.id === 'md-exporter-ai-dialog') dialogRoot = shadow;
  return shadow;
};
let openDialog;
if (location.search.includes('copy')) Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} } });
window.chrome = { runtime: {
  onMessage: { addListener: listener => { openDialog = listener; } },
  sendMessage: async message => {
    if (message.type === 'md-ai-run') {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { ok: true, result: sample.result };
    }
    return { ok: true };
  }
} };
window.addEventListener('load', () => {
  openDialog({
    type: 'md-ai-open', action,
    snapshot: { id: 'preview', source: sample.source, readOnly: previewAction === 'readonly' },
    scenarios: { presets: [], custom: [] }
  });
  if (!location.search.includes('initial')) {
    setTimeout(() => dialogRoot.querySelector('.dialog-actions .primary').click(), 100);
  }
  if (location.search.includes('copy')) {
    setTimeout(() => dialogRoot.querySelector('.dialog-actions .apply').click(), 500);
    setTimeout(() => {
      const status = dialogRoot.querySelector('.dialog-status').textContent;
      const copy = dialogRoot.querySelector('.dialog-actions .apply');
      document.title = status.includes('скопирован') && copy.textContent === 'Копировать результат' && dialogRoot.querySelector('.apply-mode').hidden ? 'PASS: read-only copy' : 'FAIL: ' + status;
    }, 1000);
  }
});
</script>
<script src="../lib/ai-rich-text.js"></script>
<script src="../lib/ai-preview.js"></script>
<script src="../lib/mermaid.min.js"></script>
<script src="../content/ai-ui.js"></script>
</body>
</html>'''
(preview_dir / 'ai-dialog-preview.html').write_text(dialog, encoding='utf-8')
