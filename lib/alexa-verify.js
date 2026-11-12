/**
 * Checks that a request to the Alexa endpoint really comes from Amazon, as Alexa
 * certification requires for skills hosted outside AWS Lambda:
 * https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
 *
 *  1. The certificate URL is https://s3.amazonaws.com/echo.api/… (port 443).
 *  2. The certificate is current, names echo-api.amazon.com, and chains up to a trusted root.
 *  3. The Signature-256 header is the certificate's RSA-SHA256 signature of the raw body.
 *  4. The request timestamp is at most 150 seconds old.
 *  5. Optionally, the skill ID is one of ours (ALEXA_SKILL_ID, comma-separated).
 *
 * Server-only (node:crypto, node:tls). No dependencies.
 */
import { X509Certificate, createVerify } from 'node:crypto';
import { rootCertificates } from 'node:tls';

const MAX_AGE_MS = 150 * 1000;
const certCache = new Map(); // url → certificates (Amazon rotates them rarely)

export class AlexaVerifyError extends Error {}
const fail = (msg) => {
  throw new AlexaVerifyError(msg);
};

/** Step 1: only Amazon's own certificate location is accepted. */
export function isValidCertUrl(raw) {
  let u;
  try {
    u = new URL(String(raw)); // resolves "/echo.api/../" and lowercases the host
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname === 's3.amazonaws.com' &&
    (u.port === '' || u.port === '443') &&
    u.pathname.startsWith('/echo.api/')
  );
}

const splitPem = (pem) => String(pem).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];

const current = (cert, now) => new Date(cert.validFrom).getTime() <= now && now <= new Date(cert.validTo).getTime();

let trustedRoots;
const defaultRoots = () => (trustedRoots ||= rootCertificates.map((p) => new X509Certificate(p)));

/** Step 2: the signing certificate (first in the chain) is current, for echo-api.amazon.com, and trusted. */
export function checkChain(pem, { now = Date.now(), roots = defaultRoots() } = {}) {
  const certs = splitPem(pem).map((p) => new X509Certificate(p));
  if (!certs.length) fail('No certificate.');
  const [leaf] = certs;
  if (!current(leaf, now)) fail('Certificate expired or not yet valid.');
  const names = String(leaf.subjectAltName || '').split(/,\s*/);
  if (!names.includes('DNS:echo-api.amazon.com')) fail('Certificate is not for echo-api.amazon.com.');

  // Walk up the chain until a certificate is a trusted root or was issued by one.
  // (Amazon also sends cross-signed certificates above that, which may be older; they're not needed.)
  const trusted = (c) =>
    roots.some((root) => c.fingerprint256 === root.fingerprint256 || (c.checkIssued(root) && c.verify(root.publicKey)));
  for (let i = 0; ; i++) {
    if (trusted(certs[i])) break;
    const [child, parent] = [certs[i], certs[i + 1]];
    if (!parent) fail('Certificate chain does not reach a trusted root.');
    if (!parent.ca || !current(parent, now) || !child.checkIssued(parent) || !child.verify(parent.publicKey)) {
      fail('Certificate chain is broken.');
    }
  }
  return leaf;
}

async function loadChain(url, fetchImpl) {
  if (certCache.has(url)) return certCache.get(url);
  const res = await fetchImpl(url);
  if (!res.ok) fail(`Could not download the certificate (HTTP ${res.status}).`);
  const pem = await res.text();
  if (certCache.size > 20) certCache.clear();
  certCache.set(url, pem);
  return pem;
}

const header = (headers, name) => {
  if (typeof headers?.get === 'function') return headers.get(name);
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? headers[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Verifies one request and returns its parsed body. Throws AlexaVerifyError when it isn't genuine.
 * rawBody must be the exact bytes Alexa sent (string or Buffer), not re-serialised JSON.
 */
export async function verifyAlexaRequest({ headers, rawBody, now = Date.now(), skillIds = [], fetchImpl = fetch, roots } = {}) {
  const certUrl = header(headers, 'SignatureCertChainUrl');
  const signature = header(headers, 'Signature-256');
  if (!certUrl || !signature) fail('Missing signature headers.');
  if (!isValidCertUrl(certUrl)) fail('Certificate URL is not Amazon’s.');

  const leaf = checkChain(await loadChain(certUrl, fetchImpl), { now, roots });
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
  const ok = createVerify('RSA-SHA256').update(body).verify(leaf.publicKey, signature, 'base64');
  if (!ok) fail('Signature does not match the body.');

  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    fail('Body is not JSON.');
  }
  const sent = Date.parse(event?.request?.timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > MAX_AGE_MS) fail('Request is too old.');

  if (skillIds.length) {
    const id = event?.context?.System?.application?.applicationId || event?.session?.application?.applicationId;
    if (!skillIds.includes(id)) fail('Request is for another skill.');
  }
  return event;
}

export const skillIdsFromEnv = (value = process.env.ALEXA_SKILL_ID) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
