// Ad hoc Playwright smoke check, driven against the real dev server — the
// "browser verification against its own spec testing criteria" step that
// PROGRESS.md calls for alongside `npm test`, made repeatable instead of a
// one-off. Not part of the Vitest suite: run it manually with
// `npm run test:browser` while `npm run dev` is up (or let it fail fast if
// the server isn't reachable).
//
// Extend this as new steps land — it covers Step 6 (palette, brush size,
// drag-to-paint, eraser, pause/resume, clear), Step 7 (click-drag-release
// launch, all four ember patterns, low-burst ignition of flammable vs.
// non-flammable material), and Step 8 (the FPS/particle/active-cell readout
// appears and its numbers move — not a substitute for the user's own manual
// frame-rate-feel/flag-toggle checks, which need a human).
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

  // Step 8 — readout: appears top-right, formatted as expected, particle
  // count reacts to the sim (checked again mid-firework below).
  const readoutPattern = /^FPS: \d+ \| Particles: \d+ \| Active cells: \d+$/;
  await page.waitForFunction(
    (pattern) => {
      const el = document.querySelector("#readout");
      return el && new RegExp(pattern).test(el.textContent ?? "");
    },
    readoutPattern.source,
    { timeout: 2000 },
  );
  console.log("readout text:", await page.locator("#readout").textContent());
  await shot(page, "readout-visible");

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

  await page.click("button:has-text('Clear')");

  // Step 7 — fireworks. Switch to Launch mode; a click-drag-release from
  // near the bottom sets power by drag distance (direction doesn't matter).
  await page.click("#palette button:has-text('Launch')");

  async function launch(dragUpPx) {
    const x = box.x + box.width / 2;
    const yStart = box.y + box.height - 20;
    await page.mouse.move(x, yStart);
    await page.mouse.down();
    await page.mouse.move(x, yStart - dragUpPx, { steps: 10 });
    await page.mouse.up();
  }

  for (const pattern of ["Ring", "Willow", "Crossette", "Strobe"]) {
    await page.click(`#firework-patterns button:has-text('${pattern}')`);
    await launch(box.height * 0.5); // max-power drag -> bursts near the top
    await page.waitForTimeout(900); // ~time-to-apex for a max-power shot
    await shot(page, `firework-${pattern.toLowerCase()}-burst`);
    if (pattern === "Ring") {
      const readoutText = await page.locator("#readout").textContent();
      const particles = Number(readoutText?.match(/Particles: (\d+)/)?.[1] ?? 0);
      console.log("readout during ring burst:", readoutText, "-> particles > 0:", particles > 0);
    }
    await page.waitForTimeout(900); // let embers fall/droop/split further
    await shot(page, `firework-${pattern.toLowerCase()}-falling`);
    if (pattern === "Strobe") {
      // Two shots close together to catch the whole burst mid-toggle (all
      // strobe embers from one shell share the same flicker phase).
      await page.waitForTimeout(45);
      await shot(page, "firework-strobe-flicker-a");
      await page.waitForTimeout(45);
      await shot(page, "firework-strobe-flicker-b");
    }
    await page.waitForTimeout(1500); // let it fully clear before the next launch
  }

  // Low-height burst directly over painted wood should ignite it.
  await page.click("button:has-text('Clear')");
  await page.click("#palette button:has-text('wood')");
  const groundY = box.y + box.height - 20;
  await page.mouse.move(box.x + box.width / 2 - 100, groundY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, groundY, { steps: 10 });
  await page.mouse.up();
  await page.click("#palette button:has-text('Launch')");
  await page.click("#firework-patterns button:has-text('Ring')");
  await launch(0); // no drag -> lowest possible burst, right above the wood
  await page.waitForTimeout(2000);
  await shot(page, "firework-low-burst-ignites-wood");

  // Low-height burst over stone should ignite nothing.
  await page.click("button:has-text('Clear')");
  await page.click("#palette button:has-text('stone')");
  await page.mouse.move(box.x + box.width / 2 - 100, groundY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, groundY, { steps: 10 });
  await page.mouse.up();
  await page.click("#palette button:has-text('Launch')");
  await launch(0);
  await page.waitForTimeout(2000);
  await shot(page, "firework-low-burst-over-stone-no-ignition");

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
