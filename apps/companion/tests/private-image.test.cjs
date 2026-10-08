const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/privateImage.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const { loadWebImage, imageFailureText, PrivateImageError } = mod.exports;

test('web images are fetched with the session header and shown from a local URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.headers]);
    return { ok: true, status: 200, blob: async () => 'jpeg-bytes' };
  };
  const url = await loadWebImage('https://api/v1/chores/verifications/v1/photo?variant=thumb', { Authorization: 'Bearer s' },
    fetchImpl, (blob) => `blob:local/${blob}`);
  assert.equal(url, 'blob:local/jpeg-bytes');
  assert.deepEqual(calls, [['https://api/v1/chores/verifications/v1/photo?variant=thumb', { Authorization: 'Bearer s' }]]);
});

test('a reviewed (deleted) photo says so; other failures say unavailable', async () => {
  const gone = async () => ({ ok: false, status: 404, blob: async () => '' });
  const refused = async () => ({ ok: false, status: 401, blob: async () => '' });
  await assert.rejects(loadWebImage('u', undefined, gone, String), (error) => {
    assert.equal(imageFailureText(error), 'Photo removed after review');
    return true;
  });
  await assert.rejects(loadWebImage('u', undefined, refused, String), (error) => {
    assert.equal(imageFailureText(error), 'Unavailable');
    return true;
  });
  assert.equal(imageFailureText(new Error('network')), 'Unavailable');
  assert.equal(new PrivateImageError('x', 500).name, 'PrivateImageError'); // Error classes from the vm realm aren't this realm's Error.
});
