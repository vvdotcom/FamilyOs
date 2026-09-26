const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function harness(replies) {
  const requests = [];
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/cognito.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const reply = replies.shift();
      if (!reply) throw new Error('Unexpected request');
      return { ok: reply.ok !== false, json: async () => reply.data };
    },
  });
  return { client: new module.exports.CognitoAccounts('public-client', 'us-west-2'), requests };
}

test('registration and email confirmation use public Cognito APIs without client secrets', async () => {
  const h = harness([{ data: { UserConfirmed: false } }, { data: {} }]);
  await h.client.signUp(' parent@example.test ', 'Test-password-123!');
  await h.client.confirm('parent@example.test', '123456');
  assert.equal(h.requests[0].url, 'https://cognito-idp.us-west-2.amazonaws.com/');
  assert.equal(h.requests[0].options.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.SignUp');
  assert.equal(h.requests[0].body.Username, 'parent@example.test');
  assert.equal(h.requests[0].body.SecretHash, undefined);
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.requests[1].body.ConfirmationCode, '123456');
});

test('password sign-in uses the existing USER_AUTH flow and returns only the ID token', async () => {
  const h = harness([{ data: { AuthenticationResult: { IdToken: 'id-token', RefreshToken: 'not-persisted' } } }]);
  assert.equal(await h.client.signIn('parent@example.test', 'example'), 'id-token');
  assert.equal(h.requests[0].body.AuthFlow, 'USER_AUTH');
  assert.equal(h.requests[0].body.AuthParameters.PREFERRED_CHALLENGE, 'PASSWORD');
});

test('password challenge continues with Cognito session and rejects unhandled MFA', async () => {
  const h = harness([
    { data: { ChallengeName: 'PASSWORD', Session: 'challenge-session' } },
    { data: { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'mfa-session' } },
  ]);
  await assert.rejects(h.client.signIn('parent@example.test', 'example'), error => error.code === 'AdditionalChallengeRequired');
  assert.equal(h.requests[1].body.Session, 'challenge-session');
  assert.equal(h.requests[1].body.ChallengeName, 'PASSWORD');
});

test('unverified accounts are identifiable and AWS error details are not displayed verbatim', async () => {
  const h = harness([{ ok: false, data: { __type: 'aws#UserNotConfirmedException', message: 'private details' } }]);
  await assert.rejects(h.client.signIn('parent@example.test', 'example'), error => {
    assert.equal(error.code, 'UserNotConfirmedException');
    assert.equal(error.message.includes('private details'), false);
    return true;
  });
});

test('a successful response without a token cannot sign a user in', async () => {
  const h = harness([{ data: {} }]);
  await assert.rejects(h.client.signIn('parent@example.test', 'example'), /did not return a sign-in token/);
});

test('resend and password reset use separate Cognito operations', async () => {
  const h = harness([{ data: {} }, { data: {} }, { data: {} }]);
  await h.client.resend('parent@example.test');
  await h.client.forgotPassword('parent@example.test');
  await h.client.resetPassword('parent@example.test', '654321', 'New-password-123!');
  assert.deepEqual(h.requests.map(r => r.options.headers['X-Amz-Target'].split('.').pop()),
    ['ResendConfirmationCode', 'ForgotPassword', 'ConfirmForgotPassword']);
  assert.equal(h.requests[2].body.ConfirmationCode, '654321');
});
