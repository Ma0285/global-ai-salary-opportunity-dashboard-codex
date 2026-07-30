import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outDir = join(process.cwd(), "qa");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector(".map3d-canvas canvas", { timeout: 15000 });
  await page.waitForTimeout(1000);

  const canvasMetrics = await page.evaluate(() => {
    const canvas = document.querySelector(".map3d-canvas canvas");
    const box = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    return box ? { found: true, width: Math.round(box.width), height: Math.round(box.height) } : { found: false, width: 0, height: 0 };
  });

  const pagePath = join(outDir, `${viewport.name}.png`);
  const mapPath = join(outDir, `${viewport.name}-map.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  await page.locator(".map3d-shell").screenshot({ path: mapPath });
  const distinct = countDistinctSampleColors(mapPath);

  console.log(`${viewport.name}: ${JSON.stringify({ ...canvasMetrics, distinct })} screenshot=${pagePath} map=${mapPath}`);
  if (!canvasMetrics.found || canvasMetrics.width < 200 || canvasMetrics.height < 200 || distinct < 40) {
    throw new Error(`${viewport.name} map canvas appears blank or undersized`);
  }
  await page.close();
}

await browser.close();

function countDistinctSampleColors(path) {
  const image = PNG.sync.read(readFileSync(path));
  const colors = new Set();
  const stepX = Math.max(1, Math.floor(image.width / 80));
  const stepY = Math.max(1, Math.floor(image.height / 80));
  for (let y = 0; y < image.height; y += stepY) {
    for (let x = 0; x < image.width; x += stepX) {
      const index = (image.width * y + x) << 2;
      colors.add(`${image.data[index]},${image.data[index + 1]},${image.data[index + 2]},${image.data[index + 3]}`);
    }
  }
  return colors.size;
}
