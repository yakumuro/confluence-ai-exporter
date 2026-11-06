'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('public manifest uses temporary active-tab access instead of a hard-coded Confluence host', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert(!('host_permissions' in manifest));
  assert(!('content_scripts' in manifest));
  for (const permission of ['activeTab', 'scripting', 'sidePanel', 'storage']) assert(manifest.permissions.includes(permission));
  assert.equal(manifest.side_panel.default_path, 'popup/popup.html');
  assert(fs.existsSync(path.join(root, manifest.side_panel.default_path)));
});

test('panel dynamically installs editor integration on the active tab', () => {
  const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  assert(popup.includes("'content/content.js'"));
  assert(!popup.includes('ai-shortcuts'));
  assert(popup.includes('chrome.scripting.executeScript'));
});

test('onboarding is shown once and remains available through the help button', () => {
  const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
  assert(popup.includes("const ONBOARDING_KEY = 'mdExporterOnboardingSeen'"));
  assert(popup.includes('function openOnboarding()'));
  assert(html.includes('id="showOnboarding"'));
  assert(html.includes('id="onboarding"'));
  assert.equal((popup.match(/title: '/g) || []).length, 5);
  assert(!popup.includes('kicker:'));
  assert(popup.includes("visual: 'context'"));
});

test('AsciiDoc converter and document extensions are wired into the panel', () => {
  const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
  assert(popup.includes("'lib/asciidoc.js'"));
  assert(popup.includes("type: 'IMPORT_DOCUMENT'"));
  assert(html.includes('value="asciidoc"'));
  for (const extension of ['.md', '.markdown', '.adoc', '.asciidoc', '.asc']) assert(html.includes(extension));
  assert(fs.existsSync(path.join(root, 'lib/asciidoc.js')));
});

test('manifest icons exist at their declared sizes and README starts with the banner', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const [size, file] of Object.entries(manifest.icons)) {
    const data = fs.readFileSync(path.join(root, file));
    assert.equal(data.readUInt32BE(16), Number(size));
    assert.equal(data.readUInt32BE(20), Number(size));
  }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert(readme.startsWith('![Confluence AI Exporter'));
  assert(readme.includes('(store-assets/github-banner.png)'));
  assert(fs.existsSync(path.join(root, 'store-assets/github-banner.png')));
});

test('settings and onboarding use the new name without obsolete labels', () => {
  const settings = fs.readFileSync(path.join(root, 'popup/ai-settings.html'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  assert(settings.includes('<h1>Настройки</h1>'));
  assert(!settings.includes('ИНТЕГРАЦИИ'));
  assert(!settings.includes('GET /models для списка моделей'));
  assert(!settings.includes('settings-label'));
  assert(popup.includes('CONFLUENCE AI EXPORTER'));
  assert(popup.includes('id="storyVisual"'));
  assert(script.includes('STORY_VISUALS'));
  assert(script.includes("visual: 'documents'"));
});

test('compact status, unified controls and refresh recovery are connected', () => {
  const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  assert(html.includes('id="contextIndicator"'));
  assert(html.includes('id="contextTooltip"'));
  assert(!html.includes('id="contextStatus"'));
  assert(!html.includes('help-button'));
  assert(!html.includes('close-button'));
  assert(script.includes('chrome.permissions.request'));
  assert(script.includes('ensureContentScript({ requestAccess: true })'));
  assert(script.includes('window.__mdExporterInjected = false'));
  assert(script.indexOf("visual: 'connection'") < script.indexOf("visual: 'documents'"));
  assert(script.includes('AI функции по выделенному тексту'));
  assert(!html.includes('ai-arrow'));
  assert(!html.includes('ai-section-label'));
});
