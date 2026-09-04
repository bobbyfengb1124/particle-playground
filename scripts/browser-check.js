// Ad hoc Playwright smoke check, driven against the real dev server — the
// "browser verification against its own spec testing criteria" step that
// PROGRESS.md calls for alongside `npm test`, made repeatable instead of a
// one-off. Not part of the Vitest suite: run it manually with
// `npm run test:browser` while `npm run dev` is up (or let it fail fast if
// the server isn't reachable).
//
// Extend this as new steps land — right now it covers Step 6 (palette,
// brush size, drag-to-paint, eraser, pause/resume, clear).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
const shotDir = path.join(__dirname, "..", "screenshots");
mkdirSync(shotDir, { recursive: true });

let shotIndex = 0;
async function shot(page, name) {
  shotIndex++;
  const file = path.join(shotDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("screenshot:", file);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(baseUrl);
  await page.waitForSelector("#scene");
  await page.waitForSelector("#palette button");
  await shot(page, "initial");

  const canvas = page.locator("#scene");
  const box = await canvas.boundingBox();

  // Select Water and drag-paint a horizontal band.
  await page.click("#palette button:has-text('water')");
  const y = box.y + 150;
  await page.mouse.move(box.x + 100, y);
  await page.mouse.down();
  for (let x = 100; x <= 500; x += 20) {
    await page.mouse.move(box.x + x, y);
  }
  await page.mouse.up();
  await shot(page, "water-painted");

  // Let it settle/spread for a bit.
  await page.waitForTimeout(1500);
  await shot(page, "water-settled");

  // Paint some stone as a floor/wall, then sand above it.
  await page.click("#palette button:has-text('stone')");
  const floorY = box.y + box.height - 30;
  await page.mouse.move(box.x + 550, floorY);
  await page.mouse.down();
  for (let x = 550; x <= 850; x += 15) {
    await page.mouse.move(box.x + x, floorY);
  }
  await page.mouse.up();

  await page.click("#palette button:has-text('sand')");
  await page.mouse.move(box.x + 700, box.y + 50);
  await page.mouse.down();
  await page.mouse.up();
  await shot(page, "stone-and-sand-seed");
  await page.waitForTimeout(1500);
  await shot(page, "sand-fell-on-stone");

  // Bump up brush size and paint a bigger blob.
  await page.fill("#brush-slider", "6");
  await page.dispatchEvent("#brush-slider", "input");
  await page.click("#palette button:has-text('wood')");
  await page.mouse.move(box.x + 200, box.y + 400);
  await page.mouse.down();
  await page.mouse.up();
  await shot(page, "big-brush-wood-blob");

  // Eraser: drag across part of the wood blob.
  await page.click("#palette button:has-text('Eraser')");
  await page.mouse.move(box.x + 170, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + 400);
  await page.mouse.up();
  await shot(page, "eraser-drag");

  // Pause: verify sim freezes.
  await page.click("button:has-text('Pause')");
  await shot(page, "paused-label");
  const pausedLabel = await page.locator("#overlay button", { hasText: "Resume" }).count();
  console.log("pause button now says Resume:", pausedLabel === 1);

  // While paused, paint a fresh sand column mid-air and confirm it does NOT fall.
  await page.click("#palette button:has-text('sand')");
  await page.mouse.move(box.x + 900, box.y + 60);
  await page.mouse.down();
  await page.mouse.up();
  await shot(page, "paused-sand-seed");
  await page.waitForTimeout(1000);
  await shot(page, "paused-sand-unchanged");

  // Resume and confirm it now falls.
  await page.click("button:has-text('Resume')");
  await page.waitForTimeout(1500);
  await shot(page, "resumed-sand-fell");

  // Clear grid.
  await page.click("button:has-text('Clear')");
  await shot(page, "cleared");

  console.log("console errors:", JSON.stringify(errors));
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
