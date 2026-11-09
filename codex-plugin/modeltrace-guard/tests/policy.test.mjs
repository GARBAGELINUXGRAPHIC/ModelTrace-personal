import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALLOWED_LIST, isAllowedModel, classifySample, isMismatch, newState, updateConfirmation, validateConfig, readState } from '../scripts/state.mjs';
import { queueAlert, userNotice } from '../scripts/alerts.mjs';
import { controlContext, handleHook, run } from '../scripts/guard.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withState } from '../scripts/state.mjs';

test('default allowed_list contains exactly the five requested IDs; matching is exact', () => {
  assert.deepEqual(DEFAULT_ALLOWED_LIST, ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.2-astra', 'gpt-6.2-bel', 'gpt-6.2-sol']);
  for (const model of DEFAULT_ALLOWED_LIST) assert.equal(isAllowedModel(model), true, model);
  for (const model of ['gpt-6-sol', 'gpt-6.3-sol', 'gpt-7-astra', 'GPT-6-ASTRA', 'luna', 'gpt-6-luna', '', null]) assert.equal(isAllowedModel(model), false, model);
});

test('policy checks the fingerprint candidate even when selector honestly says Luna or is absent from the bank', () => {
  for (const expected of ['gpt-6-luna', 'gpt-6.1-sol', null]) {
    const evidence = classifySample({ results: [{ model: 'gpt-6-luna', probability: 0.4 }] }, expected, [], 'allowed-list');
    assert.equal(evidence.outcome, 'policy_violation');
    assert.equal(isMismatch(evidence), true);
  }
  const allowed = classifySample({ results: [{ model: 'gpt-6-astra', probability: 0.4 }] }, 'gpt-6.1-sol', [], 'allowed-list');
  assert.equal(allowed.outcome, 'compatible');
  assert.equal(isMismatch(allowed), false);
});

test('policy violation alerts and halts immediately with no retry batch and blocks subsequent work', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'modeltrace-policy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = newState(randomUUID()), now = Date.now();
  state.enabled = true; state.policy = 'allowed-list'; state.expected = 'gpt-6-luna';
  const sample = { ...classifySample({ results: [{ model: 'gpt-6-luna', probability: 0.4 }] }, state.expected, [], state.policy), challenge: randomUUID(), at: now, expected: state.expected };
  const alert = queueAlert(state, sample);
  assert.ok(alert);
  updateConfirmation(state, sample, {}, now);
  assert.equal(state.taskHalt.policy, 'allowed-list');
  assert.equal(state.taskHalt.retryCount, 0);
  assert.equal(state.confirmation, null);
  assert.match(userNotice(alert), /立即暂停/);
  assert.match(controlContext(state, directory), /No retries/);
  await withState(directory, state.session, current => Object.assign(current, state));
  const result = await handleHook({ session_id: state.session, hook_event_name: 'PreToolUse', tool_name: 'exec_command', tool_input: { cmd: 'git status' } }, directory);
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
});

test('custom configuration controls membership without hidden Luna/version conditions', () => {
  const allowed_list = ['custom-model', 'gpt-6-luna'];
  const configured = validateConfig({ allowed_list });
  assert.notEqual(configured.allowed_list, allowed_list);
  for (const model of allowed_list) assert.equal(classifySample({ results: [{ model, probability: 0.2 }] }, null, [], 'allowed-list', configured.allowed_list).outcome, 'compatible');
  assert.equal(classifySample({ results: [{ model: 'gpt-6-astra', probability: 0.9 }] }, 'gpt-6-astra', [], 'allowed-list', configured.allowed_list).outcome, 'policy_violation');
  for (const value of [[], ['duplicate', 'duplicate'], [null], [''], ['has space'], 'process.exit()']) assert.throws(() => validateConfig({ allowed_list: value }), /allowed_list/);
});

test('CLI stores config.allowed_list, freezes it in checkpoints and invalidates old checkpoints on change', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'modeltrace-list-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = randomUUID(), args = ['--session', session, '--data-dir', directory];
  const first = await run(['start', ...args, '--policy', 'allowed-list'], {});
  assert.deepEqual(first.allowed_list, DEFAULT_ALLOWED_LIST);
  assert.deepEqual(first.pending.allowed_list, DEFAULT_ALLOWED_LIST);
  const configured = await run(['configure', ...args, '--allowed-list', '["custom-model"]'], {});
  assert.equal(configured.policy, 'allowed-list');
  assert.deepEqual(configured.allowed_list, ['custom-model']);
  assert.equal(configured.epoch, first.epoch + 1);
  assert.equal(configured.pending, null);
  const state = await readState(directory, session);
  assert.deepEqual(state.config.allowed_list, ['custom-model']);
  assert.equal(state.samples.length, 0);
  await assert.rejects(() => run(['configure', ...args, '--allowed-list', '[]'], {}), /allowed_list/);
  assert.deepEqual((await readState(directory, session)).config.allowed_list, ['custom-model']);
});
