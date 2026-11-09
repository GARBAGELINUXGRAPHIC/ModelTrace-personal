import test from 'node:test';
import assert from 'node:assert/strict';
import { codexExecutable } from '../scripts/app-server-client.mjs';

const desktop = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const other = '/Applications/Codex.app/Contents/Resources/codex';
const runtime = (available) => ({ platform: 'darwin', accessFile: async (p) => { if (!available.includes(p)) throw new Error('ENOENT'); } });

test('macOS uses the desktop runtime before a potentially incompatible PATH CLI', async () => {
  assert.equal(await codexExecutable({}, runtime([desktop])), desktop);
  assert.equal(await codexExecutable({}, runtime([other])), other);
  assert.equal(await codexExecutable({}, runtime([])), 'codex');
});

test('explicit runtime wins and ambiguous desktop installations require a choice', async () => {
  assert.equal(await codexExecutable({ MODELTRACE_CODEX_PATH: desktop }, runtime([desktop, other])), desktop);
  await assert.rejects(() => codexExecutable({}, runtime([desktop, other])), /Multiple Codex desktop runtimes/);
});
