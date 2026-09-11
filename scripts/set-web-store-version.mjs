import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = new URL('../dist/manifest.json', import.meta.url);
const runNumber = Number.parseInt(process.env.RELEASE_RUN_NUMBER ?? '', 10);
const runAttempt = Number.parseInt(process.env.RELEASE_RUN_ATTEMPT ?? '1', 10);
const shortSha = (process.env.RELEASE_SHA ?? '').slice(0, 7);

if (!Number.isInteger(runNumber) || runNumber < 1) {
  throw new Error('RELEASE_RUN_NUMBER must be a positive integer.');
}
if (!Number.isInteger(runAttempt) || runAttempt < 1 || runAttempt > 9) {
  throw new Error('RELEASE_RUN_ATTEMPT must be between 1 and 9.');
}

const now = new Date();
const serial = runNumber * 10 + runAttempt;
if (serial > 65_535) {
  throw new Error('Generated version component exceeds Chrome\'s 65535 limit.');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourceVersion = manifest.version;
manifest.version = `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}.${serial}`;
manifest.version_name = shortSha ? `${sourceVersion} (${shortSha})` : sourceVersion;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Web Store version: ${manifest.version} / ${manifest.version_name}`);
