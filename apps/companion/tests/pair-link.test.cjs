const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/pairLink.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function browser(hash) {
  const map = new Map();
  const replaced = [];
  const window = {
    location: { hash, pathname: '/app/', search: '' },
    sessionStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
    history: { replaceState: (_state, _title, url) => replaced.push(url) },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, window });
  return { api: module.exports, window, replaced };
}

test('the TV QR link pre-fills the pairing code once, after sign-in, and clears the address bar', () => {
  const { api, replaced } = browser('#pair=123456');
  assert.equal(api.capturePairCode(), '123456');
  assert.deepEqual(replaced, ['/app/']);
  assert.equal(api.takePairCode(), '123456');
  assert.equal(api.takePairCode(), null);
});

test('anything that is not a six-digit code is ignored', () => {
  for (const hash of ['', '#pair=12345', '#pair=1234567', '#pair=abcdef', '#other=1']) {
    const { api, replaced } = browser(hash);
    assert.equal(api.capturePairCode(), null, hash);
    assert.equal(api.takePairCode(), null, hash);
    assert.deepEqual(replaced, [], hash);
  }
});
