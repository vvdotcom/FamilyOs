// Capture typography and layout measurements from the user-supplied design.
// HTTP requests stay blocked: the self-contained document supplies its assets.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.FAMILYOS_PLAYWRIGHT || 'C:/Users/Kurst/AppData/Local/Temp/familyos-playwright-phase2/node_modules/playwright');

(async () => {
  const out = path.resolve(__dirname, '../artifacts/design-reference');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Kurst/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/^https?:/, request => request.abort());
  await page.goto('file:///C:/Users/Kurst/Downloads/Picture/Family%20Calendar%20for%20Fire%20TV.html');
  await page.waitForFunction(() => document.querySelectorAll('iframe').length === 14);
  const frames = page.frames().slice(1);
  await frames[0].waitForSelector('h1');
  const fontRules = await frames[0].evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
    .filter(rule => rule.type === CSSRule.FONT_FACE_RULE)
    .map(rule => ({ family: rule.style.fontFamily.replaceAll("'", '').replaceAll('"', ''), weight: rule.style.fontWeight, src: rule.style.src })));
  const fonts = new Map();
  for (const rule of fontRules) fonts.set(`${rule.family}-${rule.weight}`, rule);
  for (const [name, font] of fonts) {
    const data = font.src.match(/base64,([^"')]+)/)?.[1];
    if (data) fs.writeFileSync(path.join(out, `${name}.woff2`), Buffer.from(data, 'base64'));
  }
  for (let i = 0; i < frames.length; i++) {
    const data = await frames[i].evaluate(() => ({
      title: document.title,
      elements: [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'PATH', 'SVG', 'DEFS'].includes(e.tagName)).map(e => {
        const s = getComputedStyle(e); const r = e.getBoundingClientRect();
        return { tag: e.tagName, text: [...e.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim().slice(0,200), inline: e.getAttribute('style'), font: s.fontFamily, fontSize: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight, spacing: s.letterSpacing, color: s.color, background: s.backgroundColor, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }),
    }));
    fs.writeFileSync(path.join(out, `screen-${i}.json`), JSON.stringify(data, null, 2));
    console.log(`${i}: ${data.title}`);
  }
  console.log(`Extracted ${fonts.size} bundled font faces and 14 screen measurements.`);
  const iconDir = path.resolve(__dirname, '../packages/shared-ui/src/assets/design-icons');
  fs.mkdirSync(iconDir, { recursive: true });
  const iconPage = await browser.newPage({ viewport: { width: 96, height: 96 } });
  const icons = { sparkle:[0,0], menu:[0,1], alert:[0,3], soccer:[0,4], check:[0,5], weather:[0,6], home:[1,0], calendar:[1,1], chores:[1,2], meals:[1,3], lists:[1,4], photos:[1,5], moon:[1,6], left:[1,7], right:[1,8], directions:[1,9], scroll:[1,10], microphone:[1,11], photo:[6,0] };
  for (const [name, [frameIndex, svgIndex]] of Object.entries(icons)) {
    const svg = await frames[frameIndex].locator('svg').nth(svgIndex).evaluate(element => {
      const clone = element.cloneNode(true);
      clone.setAttribute('width', '96'); clone.setAttribute('height', '96');
      clone.setAttribute('style', 'color:black;display:block');
      return clone.outerHTML;
    });
    await iconPage.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await iconPage.screenshot({ path: path.join(iconDir, `${name}.png`), omitBackground: true });
  }
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
