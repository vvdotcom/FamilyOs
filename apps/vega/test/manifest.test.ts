import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// The Fire TV Home screen shows a gray tile when the manifest loses its icon line, and nothing else fails.
test('the Vega manifest declares the Hometide launcher icon', () => {
  const manifest = readFileSync(join(__dirname, '..', 'manifest.toml'), 'utf8');
  expect(manifest).toMatch(/^icon = "@image\/hometide_icon\.png"$/m);
  expect(existsSync(join(__dirname, '..', 'assets', 'image', 'hometide_icon.png'))).toBe(true);
});
