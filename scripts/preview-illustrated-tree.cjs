// Run with the bundled runtime's NODE_PATH, against the local Vite preview.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const out = path.resolve(__dirname, "../artifacts");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(process.env.TREE_PREVIEW_URL || "http://127.0.0.1:1420/illustrated-tree-preview.html");
  await page.locator(".illustrated-tree").waitFor();
  await page.waitForFunction(() => document.querySelector(".canvas-scale")?.textContent !== "100%");
  await page.screenshot({ path: path.join(out, "illustrated-tree-overview.png") });
  const overview = await page.locator(".botanical-label").count();
  const mainLimbs = await page.locator(".botanical-wood.is-primary").count();
  const scale = () => page.locator(".canvas-scale").innerText();
  const initialScale = await scale();
  // Measure actual SVG text bounds, independently of the layout's box estimator.
  const collisionPairs = await page.locator(".botanical-label").evaluateAll((labels) => {
    const boxes = labels.map((label) => ({ title: label.textContent, box: label.getBoundingClientRect().toJSON() }));
    const collisions = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].box, b = boxes[j].box;
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([boxes[i].title, boxes[j].title]);
    }
    return collisions;
  });
  await page.getByRole("button", { name: /计算基础|机械计算|计算机组成/ }).first().click();
  await page.locator(".tree-knowledge-panel").waitFor();
  const accessible = await page.locator(".tree-knowledge-list button").count();
  await page.getByRole("button", { name: "关闭知识列表" }).click();
  for (let i = 0; i < 2; i++) await page.getByTitle("放大", { exact: true }).click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, "illustrated-tree-medium.png") });
  const mediumScale = await scale();
  for (let i = 0; i < 3; i++) await page.getByTitle("放大", { exact: true }).click();
  await page.waitForTimeout(100);
  const twigs = await page.locator(".botanical-wood.is-twig").count();
  await page.screenshot({ path: path.join(out, "illustrated-tree-near.png") });
  await page.getByTitle("适应视野").click();
  await page.getByLabel("主题", { exact: true }).selectOption("everforest");
  await page.screenshot({ path: path.join(out, "illustrated-tree-everforest.png") });
  await page.getByLabel("布局", { exact: true }).selectOption("legacy");
  await page.locator(".tree-edge").first().waitFor();
  const legacyWorks = await page.locator(".tree-edge").count() > 0;
  await page.getByLabel("布局", { exact: true }).selectOption("illustrated");
  await page.setViewportSize({ width: 650, height: 650 });
  await page.getByTitle("适应视野").click();
  await page.screenshot({ path: path.join(out, "illustrated-tree-small.png") });
  const report = { mainLimbs, overview, initialScale, mediumScale, collisionPairs, accessible, twigs, legacyWorks, errors };
  fs.writeFileSync(path.join(out, "illustrated-tree-browser-check.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
  if (mainLimbs !== 5 || overview > 16 || collisionPairs.length || !accessible || !twigs || !legacyWorks || errors.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
