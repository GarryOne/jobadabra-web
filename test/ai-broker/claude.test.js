// The Claude Code CLI helpers of the broker's container (container/claude.mjs): arguments, input and the reading of its stream. Offline: no CLI, no token, no network.
// The result and rate-limit lines are taken from a real call of CLI 2.1.316 on the owner's subscription (1 Nov 2026), trimmed to the fields the code reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeArgs, claudeInput, readClaude, SYSTEM_PROMPT} from '../../workers/ai-broker/container/claude.mjs';

const line = o => `${JSON.stringify(o)}\n`;
const allowed = {type: 'rate_limit_event', rate_limit_info: {status: 'allowed', resetsAt: 1793588400, rateLimitType: 'five_hour', unifiedWindows: {five_hour: {utilization: 0.2, resetsAt: 1793588400, status: 'allowed'}, seven_day: {utilization: 0.05, resetsAt: 1794088800, status: 'allowed'}}}};
const ok = {type: 'result', subtype: 'success', is_error: false, result: 'pong', stop_reason: 'end_turn', usage: {input_tokens: 384, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 0}};

test('the arguments are the measured lean ones: no tools, settings, slash commands or MCP, and never --bare (it refuses an OAuth token)', () => {
  const args = claudeArgs({model: 'claude-haiku-5-5'});
  assert.deepEqual(args, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--no-session-persistence', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config', '--system-prompt', SYSTEM_PROMPT, '--model', 'claude-haiku-5-5']);
  assert.ok(!args.includes('--bare'));
  assert.deepEqual(claudeArgs({model: 'm', schema: {type: 'object'}}).slice(-2), ['--json-schema', '{"type":"object"}']);
});

test('the prompt and images are one stream-json line; an image the CLI cannot take is refused before the call', () => {
  const sent = JSON.parse(claudeInput({prompt: 'What colour?', images: [{name: 'a.PNG', base64: 'QUJD'}, {name: 'b.jpeg', base64: 'REVG'}]}));
  assert.equal(sent.type, 'user');
  assert.deepEqual(sent.message.content, [{type: 'text', text: 'What colour?'}, {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}, {type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: 'REVG'}}]);
  assert.ok(claudeInput({prompt: 'x'}).endsWith('\n') && !claudeInput({prompt: 'x'}).slice(0, -1).includes('\n'));
  assert.throws(() => claudeInput({prompt: 'x', images: [{name: 'a.bmp', base64: 'QQ=='}]}), /unsupported image/);
  assert.throws(() => claudeInput({prompt: 'x', images: [{name: 'a.png'}]}), /unsupported image/);
});

test('a good answer gives the text, the tokens (cache counted as input) and the subscription windows', () => {
  const read = readClaude(line({type: 'system', subtype: 'init'}) + line(allowed) + line({...ok, usage: {...ok.usage, cache_creation_input_tokens: 100, cache_read_input_tokens: 20}}));
  assert.equal(read.reply, 'pong');
  assert.deepEqual(read.tokens, {input: 504, output: 4});
  assert.deepEqual(read.limits, {status: 'allowed', fiveHour: allowed.rate_limit_info.unifiedWindows.five_hour, sevenDay: allowed.rate_limit_info.unifiedWindows.seven_day});
});

test('"ran out" is read from the stream\'s own window status first, then from the message; an expired token is its own word; anything else is a plain failure, never guessed as "ran out"', () => {
  const rejected = {...allowed, rate_limit_info: {...allowed.rate_limit_info, status: 'rejected', resetsAt: 1793600000}};
  assert.deepEqual(readClaude(line(rejected) + line({type: 'result', is_error: true, result: 'Something went wrong'}), '', 1).error, 'claude-limit');
  assert.equal(readClaude(line(rejected) + line({type: 'result', is_error: true, result: 'x'})).resetsAt, 1793600000);
  assert.equal(readClaude(line({type: 'result', is_error: true, result: "You've hit your usage limit"})).error, 'claude-limit');
  assert.equal(readClaude(line({type: 'result', is_error: true, result: "You've hit your usage limit"})).resetsAt, null);   // text only: no reset time is borrowed
  // Gitar on #291: the stream says the window is allowed, then a passing 429: a plain failure, never "ran out until the five-hour reset"
  const throttled = readClaude(line(allowed) + line({type: 'result', is_error: true, result: 'API Error: 429 Too Many Requests'}), '', 1);
  assert.match(throttled.error, /^claude-failed:1 API Error: 429/); assert.equal(throttled.resetsAt, undefined);
  assert.equal(readClaude(line({type: 'result', is_error: true, result: 'Not logged in · Please run /login'})).error, 'claude-auth');
  assert.equal(readClaude('', 'Error: 401 Unauthorized').error, 'claude-auth');
  assert.match(readClaude(line(allowed) + line({type: 'result', is_error: true, result: 'Overloaded, try again'}), '', 1).error, /^claude-failed:1 Overloaded/);
  assert.match(readClaude('garbage', 'segfault', 139).error, /^claude-failed:139 segfault/);
  assert.match(readClaude(line(allowed) + line({...ok, result: '  '})).error, /^claude-failed/);   // an empty answer is a failure
});
