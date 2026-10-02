const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function loadStorage(window) {
  const module = { exports: {} };
  vm.runInNewContext(compile('storage.ts'), {
    module, exports: module.exports, window,
    require: (name) => (name === 'react-native' ? { Platform: { OS: 'web' } } : {}),
  });
  return module.exports;
}

function loadAPI(window, storage) {
  const module = { exports: {} };
  vm.runInNewContext(compile('auth-api.ts'), {
    module, exports: module.exports, URL, URLSearchParams, window, __DEV__: false, process: { env: {} },
    require: (name) => {
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name === './storage') return storage;
      return {};
    },
  });
  return module.exports;
}

test('the hosted web app keeps a session only in this tab unless the parent asks to be remembered', async () => {
  const window = { sessionStorage: memoryStorage(), localStorage: memoryStorage() };
  const { SecureStore, setRememberThisDevice, rememberThisDevice } = loadStorage(window);
  await SecureStore.setItemAsync('familyos.session-cookie', 'token-1');
  assert.equal(window.sessionStorage.getItem('familyos.session-cookie'), 'token-1');
  assert.equal(window.localStorage.getItem('familyos.session-cookie'), null);

  setRememberThisDevice(true);
  assert.equal(rememberThisDevice(), true);
  assert.equal(window.localStorage.getItem('familyos.session-cookie'), 'token-1');
  assert.equal(window.sessionStorage.getItem('familyos.session-cookie'), null);
  assert.equal(await SecureStore.getItemAsync('familyos.session-cookie'), 'token-1');

  setRememberThisDevice(false);
  assert.equal(window.localStorage.getItem('familyos.session-cookie'), null);
  assert.equal(await SecureStore.getItemAsync('familyos.session-cookie'), 'token-1');

  await SecureStore.deleteItemAsync('familyos.session-cookie');
  assert.equal(await SecureStore.getItemAsync('familyos.session-cookie'), null);
});

test('the hosted web app always talks to the server it was opened from', async () => {
  const window = {
    location: { protocol: 'https:', origin: 'https://familyos.example' },
    sessionStorage: memoryStorage(), localStorage: memoryStorage(),
  };
  const storage = loadStorage(window);
  await storage.SecureStore.setItemAsync('familyos.api-url', 'https://elsewhere.example');
  const api = loadAPI(window, storage);
  assert.equal(api.HOSTED_WEB, true);
  assert.equal(api.DEFAULT_API_URL, 'https://familyos.example');
  assert.equal(await api.readSavedAPIURL(), 'https://familyos.example');
  await assert.rejects(api.saveAPIURL('https://elsewhere.example'), /server it was opened from/);
});
