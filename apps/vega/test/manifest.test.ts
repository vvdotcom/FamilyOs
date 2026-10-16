import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// The Fire TV Home screen shows a gray tile when the manifest loses its icon line, and nothing else fails.
test('the Vega manifest declares the Hometide launcher icon', () => {
  const manifest = readFileSync(join(__dirname, '..', 'manifest.toml'), 'utf8');
  expect(manifest).toMatch(/^icon = "@image\/hometide_icon\.png"$/m);
  expect(existsSync(join(__dirname, '..', 'assets', 'image', 'hometide_icon.png'))).toBe(true);
});

// The wall calendar's weather loops play through Vega's media pipeline, which needs the media services.
test('the Vega manifest asks for media playback, but nothing for DRM or catalog search', () => {
  const manifest = readFileSync(join(__dirname, '..', 'manifest.toml'), 'utf8');
  for (const id of ['com.amazon.media.server', 'com.amazon.mediabuffer.service', 'com.amazon.mediatransform.service',
    'com.amazon.media.playersession.service', 'com.amazon.media.secureplayback']) {
    expect(manifest).toContain(`id = "${id}"`);
  }
  expect(manifest).not.toMatch(/com\.amazon\.drm\.|IContentLauncher/);
});
