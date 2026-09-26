const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function harness(data, cookie = 'familyos_session=test-session; Secure; HttpOnly', platform = 'ios') {
  const stored = new Map();
  const requests = [];
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/auth-api.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL, URLSearchParams, __DEV__: true, process: { env: {} },
    require: (name) => {
      if (name === 'react-native') return { Platform: { OS: platform } };
      assert.equal(name, './storage');
      return { SecureStore: {
        getItemAsync: async (key) => stored.get(key) || null,
        setItemAsync: async (key, value) => stored.set(key, value),
        deleteItemAsync: async (key) => stored.delete(key),
      } };
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, headers: { get: () => cookie }, json: async () => ({ data }) };
    },
  });
  return { ...module.exports, stored, requests };
}

const account = { accountId: 'parent-1', email: 'parent@example.test', householdId: 'home-1' };
test('household reads and edits carry the explicit session and revision', async () => {
  const h = harness({revision:2});
  h.stored.set('familyos.session-cookie','owner-session');
  const api = new h.FamilyOSAPI('https://familyos.example.test');
  await api.household();
  await api.editHousehold({expectedRevision:1,kind:'event',value:{id:'event'}});
  assert.equal(h.requests[0].options.headers.Authorization,'Bearer owner-session');
  assert.equal(h.requests[1].options.headers.Authorization,'Bearer owner-session');
  assert.equal(JSON.parse(h.requests[1].options.body).expectedRevision,1);
  assert.equal(h.requests[1].url,'https://familyos.example.test/v1/companion/edit');
});

test('TV pairing approval, device listing, and revocation use the signed-in parent session', async () => {
  const h = harness({ deviceId: 'tv-1', deviceName: 'Living Room TV' });
  h.stored.set('familyos.session-cookie', 'parent-session');
  const api = new h.FamilyOSAPI('http://192.168.1.20:8787');
  await api.approveTV('123456');
  await api.pairedTVs();
  await api.unpairTV('tv-1');

  assert.deepEqual(h.requests.map((request) => new URL(request.url).pathname), [
    '/v1/pairing/approve', '/v1/devices', '/v1/devices/tv-1/revoke',
  ]);
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer parent-session');
  assert.deepEqual(JSON.parse(h.requests[0].options.body), { code: '123456' });
  assert.equal(h.requests[2].options.headers.Authorization, 'Bearer parent-session');
});
for (const method of ['signIn', 'verifyEmail', 'exchangeCognitoSession']) {
  test(`${method} returns the account, not the session envelope`, async () => {
    const h = harness({ authenticated: true, account });
    const api = new h.FamilyOSAPI('https://familyos.example.test');
    assert.equal(await api[method]('input', 'input', 'input'), account);
    assert.equal(h.stored.get('familyos.session-cookie'), 'test-session');
  });
}

test('malformed session clears saved credentials', async () => {
  const h = harness({ authenticated: false, account: null });
  const api = new h.FamilyOSAPI('https://familyos.example.test');
  await assert.rejects(api.signIn('parent@example.test', 'example'), /authenticated account/);
  assert.equal(h.stored.size, 0);
});

test('missing session cookie does not create a local session', async () => {
  const h = harness({ authenticated: true, account }, null);
  const api = new h.FamilyOSAPI('https://familyos.example.test');
  await assert.rejects(api.exchangeCognitoSession('test-token', '', ''), /sign-in session/);
  assert.equal(h.stored.size, 0);
});

test('changing servers clears the prior server session', async () => {
  const h = harness({ authenticated: true, account });
  h.stored.set('familyos.session-cookie', 'old-session');
  await h.saveAPIURL('http://192.168.1.20:8787/');
  assert.equal(h.stored.has('familyos.session-cookie'), false);
  assert.equal(await h.readSavedAPIURL(), 'http://192.168.1.20:8787');
  assert.throws(() => h.normalizeAPIURL('http://public.example.com'), /Use HTTPS/);
});

test('browser preview defaults to loopback and blocks hosted services', async () => {
  const h = harness({}, undefined, 'web');
  assert.equal(h.DEFAULT_API_URL, 'http://127.0.0.1:8787');
  assert.throws(() => h.normalizeAPIURL('https://familyos-api.example.test'), /browser preview is for local testing only/i);
  assert.equal(h.normalizeAPIURL('http://192.168.1.20:8787'), 'http://192.168.1.20:8787');
});

test('native auth accepts JSON session token when iOS hides response cookies', async () => {
  const h = harness({ authenticated: true, account, sessionToken: 'native-token' }, null);
  const api = new h.FamilyOSAPI('https://familyos.example.test');
  assert.equal(await api.exchangeCognitoSession('id-token', 'Parent', 'Family'), account);
  await api.session();
  assert.equal(h.requests[0].options.headers['X-FamilyOS-Session-Transport'], 'bearer');
  assert.equal(h.requests[1].options.headers.Authorization, 'Bearer native-token');
  assert.equal(h.requests[1].options.credentials, 'omit');
  await api.signOut();
  assert.equal(h.stored.has('familyos.session-cookie'), false);
});
