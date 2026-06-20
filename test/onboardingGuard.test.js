const { test } = require('node:test');
const assert = require('node:assert');

function stubLocation(pathname) {
  return { pathname, replaced: null, replace(url) { this.replaced = url; } };
}
function stubFetch(complete) {
  return async () => ({ ok: true, json: async () => ({ complete }) });
}

test('enforceOnboarding redirects to /setup.html when onboarding is incomplete', async () => {
  const { enforceOnboarding } = await import('../public/js/chrome.js');
  const loc = stubLocation('/');
  await enforceOnboarding(stubFetch(false), loc);
  assert.equal(loc.replaced, '/setup.html');
});

test('enforceOnboarding does nothing when onboarding is complete', async () => {
  const { enforceOnboarding } = await import('../public/js/chrome.js');
  const loc = stubLocation('/');
  await enforceOnboarding(stubFetch(true), loc);
  assert.equal(loc.replaced, null);
});

test('enforceOnboarding does not redirect when already on the setup page', async () => {
  const { enforceOnboarding } = await import('../public/js/chrome.js');
  const loc = stubLocation('/setup.html');
  await enforceOnboarding(stubFetch(false), loc);
  assert.equal(loc.replaced, null);
});

test('enforceOnboarding swallows fetch failures without redirecting', async () => {
  const { enforceOnboarding } = await import('../public/js/chrome.js');
  const loc = stubLocation('/');
  const failing = async () => { throw new Error('network down'); };
  await enforceOnboarding(failing, loc);
  assert.equal(loc.replaced, null);
});
