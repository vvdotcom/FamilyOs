const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/voiceInput.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, Date });
const { speechSupported, transcriptOf, listen, speak, speechErrorMessage } = mod.exports;

const plain = (value) => JSON.parse(JSON.stringify(value)); // Objects made inside the vm context.
const result = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });

function fakeWindow() {
  const made = [];
  class Recognition {
    constructor() { this.started = false; this.stopped = false; this.aborted = false; made.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    hear(...results) { this.onresult({ resultIndex: 0, results }); }
  }
  const spoken = [];
  return {
    made, spoken,
    window: {
      webkitSpeechRecognition: Recognition,
      navigator: { language: 'en-US' },
      speechSynthesis: { speak: (u) => spoken.push(u.text), cancel: () => spoken.push('<cancel>') },
      SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    },
  };
}

test('voice is offered only where the browser can listen', () => {
  assert.equal(speechSupported(undefined), false);
  assert.equal(speechSupported({}), false);
  assert.equal(speechSupported(fakeWindow().window), true);
});

test('the transcript joins finished and in-progress phrases', () => {
  assert.deepEqual(plain(transcriptOf([result(' swap Tuesday ', true), result('pickup to Lindsey', false)])),
    { text: 'swap Tuesday pickup to Lindsey', final: false });
  assert.deepEqual(plain(transcriptOf([result('what is on today', true)])), { text: 'what is on today', final: true });
  assert.deepEqual(plain(transcriptOf([])), { text: '', final: false });
});

test('releasing the mic sends what was heard once the browser finishes', () => {
  const fake = fakeWindow();
  const seen = [];
  const done = [];
  const listener = listen({ onText: (t) => seen.push(t), onDone: (t) => done.push(t), onError: assert.fail }, fake.window);
  const recognition = fake.made[0];
  assert.equal(recognition.started, true);
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, true);
  recognition.hear(result('swap Tuesday', false));
  recognition.hear(result('swap Tuesday pickup to Lindsey', true));
  listener.finish();
  assert.equal(recognition.stopped, true);
  assert.deepEqual(done, []); // Waits for the last words.
  recognition.onend();
  assert.deepEqual(seen, ['swap Tuesday', 'swap Tuesday pickup to Lindsey']);
  assert.deepEqual(done, ['swap Tuesday pickup to Lindsey']);
  recognition.onend();
  assert.equal(done.length, 1);
});

test('a browser that stops early still waits for the release', () => {
  const fake = fakeWindow();
  const done = [];
  const listener = listen({ onText() {}, onDone: (t) => done.push(t), onError: assert.fail }, fake.window);
  fake.made[0].hear(result('what is on today', true));
  fake.made[0].onerror({ error: 'no-speech' });
  fake.made[0].onend();
  assert.deepEqual(done, []);
  listener.finish();
  assert.deepEqual(done, ['what is on today']);
});

test('microphone errors are explained, and cancel drops the words', () => {
  const fake = fakeWindow();
  const errors = [];
  const done = [];
  listen({ onText() {}, onDone: (t) => done.push(t), onError: (m) => errors.push(m) }, fake.window);
  fake.made[0].onerror({ error: 'not-allowed' });
  fake.made[0].onend();
  assert.match(errors[0], /microphone/);
  assert.deepEqual(done, []);

  const listener = listen({ onText() {}, onDone: (t) => done.push(t), onError: assert.fail }, fake.window);
  fake.made[1].hear(result('add dentist', false));
  listener.cancel();
  assert.equal(fake.made[1].aborted, true);
  fake.made[1].onerror({ error: 'aborted' });
  fake.made[1].onend();
  assert.deepEqual(done, []);
  assert.match(speechErrorMessage('network'), /connection/);
});

test('without speech recognition, listen returns null', () => {
  assert.equal(listen({ onText() {}, onDone() {}, onError() {} }, {}), null);
});

test('replies are read aloud, replacing anything still being spoken', () => {
  const fake = fakeWindow();
  speak('Emma has soccer at 4.', fake.window);
  speak('   ', fake.window);
  assert.deepEqual(fake.spoken, ['<cancel>', 'Emma has soccer at 4.']);
});
