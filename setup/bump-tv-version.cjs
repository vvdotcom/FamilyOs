#!/usr/bin/env node
/**
 * Bump the Fire TV app's version before every Amazon Appstore upload. The store refuses a build whose
 * version is not higher than the last one (it uses it to block downgrades).
 *
 *   yarn version:tv          -> patch bump, for example 1.0.0 -> 1.0.1
 *   yarn version:tv minor    -> 1.0.1 -> 1.1.0
 *
 * Updates, in step:
 *   apps/vega/manifest.toml            [package] version   (Vega OS .vpkg)
 *   apps/vega/package.json             version
 *   apps/expo-multi-tv/app.json        expo.version and expo.android.versionCode (Fire OS APK)
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const part = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(part)) {
  console.error('Usage: bump-tv-version.cjs [major|minor|patch]');
  process.exit(1);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);
const eol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

const manifestFile = 'apps/vega/manifest.toml';
const manifest = read(manifestFile);
const match = manifest.match(/(\[package\][\s\S]*?\nversion\s*=\s*")(\d+)\.(\d+)\.(\d+)(")/);
if (!match) {
  console.error(`No [package] version in ${manifestFile}`);
  process.exit(1);
}
let [major, minor, patch] = [Number(match[2]), Number(match[3]), Number(match[4])];
if (part === 'major') [major, minor, patch] = [major + 1, 0, 0];
if (part === 'minor') [minor, patch] = [minor + 1, 0];
if (part === 'patch') patch += 1;
const version = `${major}.${minor}.${patch}`;
write(manifestFile, manifest.replace(match[0], `${match[1]}${version}${match[5]}`));

const vegaPackageFile = 'apps/vega/package.json';
const vegaPackage = read(vegaPackageFile);
write(vegaPackageFile, vegaPackage.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`));

const appJsonFile = 'apps/expo-multi-tv/app.json';
const appJsonText = read(appJsonFile);
const appJson = JSON.parse(appJsonText);
appJson.expo.version = version;
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = (Number(appJson.expo.android.versionCode) || 0) + 1;
write(appJsonFile, JSON.stringify(appJson, null, 2).replace(/\n/g, eol(appJsonText)) + eol(appJsonText));

console.log(`Fire TV version ${version} (Android versionCode ${appJson.expo.android.versionCode}).`);
