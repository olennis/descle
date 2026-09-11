import { readFile } from 'node:fs/promises';

const accessToken = process.env.CWS_ACCESS_TOKEN;
const publisherId = process.env.CWS_PUBLISHER_ID;
const extensionId = process.env.CWS_EXTENSION_ID;
const zipPath = process.env.CWS_ZIP_PATH ?? 'descle-web-store.zip';

for (const [name, value] of Object.entries({
  CWS_ACCESS_TOKEN: accessToken,
  CWS_PUBLISHER_ID: publisherId,
  CWS_EXTENSION_ID: extensionId,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
const apiBase = 'https://chromewebstore.googleapis.com';
const authHeaders = { Authorization: `Bearer ${accessToken}` };

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { rawResponse: text };
  }

  if (!response.ok) {
    throw new Error(`Chrome Web Store API ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

const zip = await readFile(zipPath);
console.log(`Uploading ${zipPath} (${zip.byteLength} bytes)...`);

const upload = await requestJson(`${apiBase}/upload/v2/${itemName}:upload`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    'Content-Type': 'application/zip',
  },
  body: zip,
});

let uploadState = upload.uploadState;
for (let attempt = 1; uploadState === 'IN_PROGRESS' && attempt <= 12; attempt += 1) {
  console.log(`Upload is processing (${attempt}/12)...`);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const status = await requestJson(`${apiBase}/v2/${itemName}:fetchStatus`, {
    headers: authHeaders,
  });
  uploadState = status.lastAsyncUploadState;
}

if (uploadState !== 'SUCCEEDED') {
  throw new Error(`Package upload did not succeed. Final state: ${uploadState ?? 'unknown'}`);
}

console.log(`Uploaded extension version ${upload.crxVersion ?? '(processed asynchronously)'}.`);
console.log('Submitting the uploaded revision for review...');

const publication = await requestJson(`${apiBase}/v2/${itemName}:publish`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    publishType: 'DEFAULT_PUBLISH',
    skipReview: false,
    blockOnWarnings: false,
  }),
});

console.log(`Submission accepted. State: ${publication.state ?? 'submitted'}`);
if (publication.warningInfo?.warnings?.length) {
  console.warn(`Web Store warnings: ${JSON.stringify(publication.warningInfo.warnings)}`);
}
