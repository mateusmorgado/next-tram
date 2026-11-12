import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSign, X509Certificate } from 'node:crypto';
import { verifyAlexaRequest, isValidCertUrl, checkChain, AlexaVerifyError } from '../lib/alexa-verify.js';

// A throwaway test CA and an "echo-api.amazon.com" certificate it signed (test/fixtures).
const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const ROOT = fixture('alexa-test-root.pem');
const LEAF = fixture('alexa-test-leaf.pem');
const KEY = fixture('alexa-test-key.pem');
const roots = [new X509Certificate(ROOT)];
const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem';

const now = Date.parse('2026-11-12T10:00:00Z');
const body = (extra = {}) =>
  JSON.stringify({
    context: { System: { application: { applicationId: 'amzn1.ask.skill.mine' } } },
    request: { type: 'LaunchRequest', timestamp: new Date(now - 5000).toISOString(), locale: 'en-US' },
    ...extra,
  });
const sign = (raw) => createSign('RSA-SHA256').update(raw).sign(KEY, 'base64');
const fetchImpl = async () => ({ ok: true, status: 200, text: async () => LEAF + ROOT });
const verify = (raw, headers = {}, opts = {}) =>
  verifyAlexaRequest({ headers: { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(raw), ...headers }, rawBody: raw, now, roots, fetchImpl, ...opts });

test('only Amazon’s certificate URL is accepted', () => {
  for (const ok of [
    'https://s3.amazonaws.com/echo.api/echo-api-cert.pem',
    'https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem',
    'https://s3.amazonaws.com/echo.api/../echo.api/echo-api-cert.pem',
    'https://S3.AMAZONAWS.COM/echo.api/x.pem',
  ])
    assert.ok(isValidCertUrl(ok), ok);
  for (const bad of [
    'http://s3.amazonaws.com/echo.api/echo-api-cert.pem',
    'https://notamazon.com/echo.api/echo-api-cert.pem',
    'https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem',
    'https://s3.amazonaws.com/invalid.path/echo-api-cert.pem',
    'https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem',
    'not a url',
  ])
    assert.ok(!isValidCertUrl(bad), bad);
});

test('a correctly signed request passes and comes back parsed', async () => {
  const raw = body();
  const event = await verify(raw);
  assert.equal(event.request.type, 'LaunchRequest');
});

test('a changed body, old timestamp, foreign skill or untrusted chain is refused', async () => {
  const raw = body();
  await assert.rejects(verify(raw.replace('LaunchRequest', 'IntentRequest'), { 'Signature-256': sign(raw) }), AlexaVerifyError);
  const old = body({ request: { type: 'LaunchRequest', timestamp: new Date(now - 200000).toISOString() } });
  await assert.rejects(verify(old), /too old/);
  await assert.rejects(verify(raw, {}, { skillIds: ['amzn1.ask.skill.other'] }), /another skill/);
  assert.ok(await verify(raw, {}, { skillIds: ['amzn1.ask.skill.mine'] }));
  await assert.rejects(verify(raw, {}, { roots: [] }), /trusted root/);
  await assert.rejects(verify(raw, { SignatureCertChainUrl: 'https://evil.example/echo.api/x.pem' }), /Amazon/);
  await assert.rejects(verifyAlexaRequest({ headers: {}, rawBody: raw }), /Missing/);
});

test('the certificate must be for echo-api.amazon.com and current', () => {
  assert.throws(() => checkChain(ROOT, { now, roots }), /echo-api/);
  assert.throws(() => checkChain(LEAF + ROOT, { now: Date.parse('2001-01-01'), roots }), /expired/);
  assert.ok(checkChain(LEAF + ROOT, { now, roots }));
});

test('Amazon’s real certificate chain reaches a root Node trusts', () => {
  // echo-api-cert-12.pem from s3.amazonaws.com/echo.api, valid until Dec 2023.
  const amazon = fixture('amazon-echo-api-cert-2023.pem');
  assert.ok(checkChain(amazon, { now: Date.parse('2023-06-01') }));
  assert.throws(() => checkChain(amazon, { now: Date.parse('2024-06-01') }), /expired/);
});
