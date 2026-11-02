// Run against a release EXE. All configuration, WebView state and libraries are isolated.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts", "lifecycle");
fs.mkdirSync(output, { recursive: true });
const isolated = fs.mkdtempSync(path.join(output, "native-"));
const configDir = path.join(isolated, "config");
const library = path.join(isolated, "知识库");
const port = 9235;
const executable = process.env.KT_TEST_EXE || path.join(root, "dist/releases/0.1.2/knowledge-tree-desktop.exe");
const report = { executable, isolated, flows: {}, errors: [] };
let child, browser, page;
async function launch() {
  const env = { ...process.env, KNOWLEDGE_TREE_CONFIG_DIR: configDir, WEBVIEW2_USER_DATA_FOLDER: path.join(isolated, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  delete env.KNOWLEDGE_TREE_LIBRARY;
  child = spawn(executable, [], { env, windowsHide: true, stdio: "ignore" });
  let stopped = null; child.on("exit", (code) => { stopped = code; });
  for (let i = 0; i < 120; i++) {
    if (stopped !== null) throw new Error(`Native executable exited during startup: ${stopped}`);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  if (!browser) throw new Error("WebView2 CDP did not become available");
  for (let i = 0; i < 60; i++) {
    page = browser.contexts()[0]?.pages().find((p) => p.url().includes("tauri"));
    if (page) break; await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, "Native Tauri page missing"); page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => report.errors.push(String(error)));
}
async function invoke(command, args) { return page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args }); }
async function stop() {
  if (browser) { await browser.close(); browser = null; }
  if (child && child.exitCode === null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; }
  child = null; page = null;
}
(async () => {
  try {
    await launch();
    await page.getByRole("button", { name: "创建新知识库", exact: true }).waitFor();
    assert.equal(fs.existsSync(library), false);
    await page.screenshot({ path: path.join(output, "native-onboarding.png") });
    const nonempty = path.join(isolated, "nonempty"); fs.mkdirSync(nonempty); fs.writeFileSync(path.join(nonempty, "keep.md"), "keep");
    await page.getByLabel("知识库路径").fill(nonempty); await page.getByRole("button", { name: "验证并进入" }).click();
    await page.getByRole("alert").filter({ hasText: "空目录" }).waitFor(); assert.equal(fs.readFileSync(path.join(nonempty, "keep.md"), "utf8"), "keep");
    report.flows.nonempty = "Nonempty directory rejected without overwriting files";
    await page.getByLabel("知识库路径").fill(library); await page.getByRole("button", { name: "验证并进入" }).click();
    await page.getByRole("heading", { name: "新建学科", exact: true }).waitFor();
    const subject = await invoke("create_subject", { title: "隔离验证", description: "保留历史", id: "native-test" });
    assert.equal(subject.id, "native-test");
    const prefs = { "kt-theme": "dark", "knowledge-tree-layout": "legacy", [`kt-library:${encodeURIComponent(library.toLowerCase().replaceAll("\\", "/"))}:kt-current-subject`]: "native-test" };
    await invoke("save_preferences", { preferences: prefs, imported: false });
    await page.getByRole("button", { name: /设置 ·/ }).click();
    await page.getByText("尚未配置发布源", { exact: false }).waitFor();
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    assert.equal((await invoke("update_status")).phase, "unconfigured");
    const backup = await invoke("create_backup");
    assert.equal(JSON.parse(fs.readFileSync(path.join(backup, "manifest.json"), "utf8")).status, "verified");
    const original = fs.readFileSync(path.join(library, "native-test/subject.yaml"));
    assert.deepEqual(fs.readFileSync(path.join(backup, "library/native-test/subject.yaml")), original);
    assert.ok(fs.existsSync(path.join(backup, "library/native-test/.git")));
    await page.screenshot({ path: path.join(output, "native-settings.png") });
    report.flows.creation = "Real Tauri commands create an isolated library and subject";
    report.flows.offline = "Unconfigured updater performs no request and does not interfere with offline editing";
    report.flows.backup = "Complete verified backup includes YAML, Git and preferences";
    await stop();
    await launch();
    await page.locator(".workspace").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal((await invoke("startup_status")).ready, true);
    assert.deepEqual(fs.readFileSync(path.join(library, "native-test/subject.yaml")), original);
    report.flows.restore = "Restart restores configured library, subject, theme and layout without reinitialization";
    // Build an unversioned legacy fixture entirely inside this test's own directory.
    await invoke("create_node", { subjectId: "native-test", node: { id: "note", title: "升级保留正文", type: "concept", tags: [], references: [] } });
    await invoke("write_document", { subjectId: "native-test", nodeId: "note", content: "# 保留正文\n\n无损接入。\n" });
    await page.evaluate(() => { localStorage.setItem("kt-theme", "dark"); localStorage.setItem("knowledge-tree-layout", "legacy"); });
    await stop();
    const legacy = path.join(isolated, "legacy");
    assert.ok(library.startsWith(isolated + path.sep) && legacy.startsWith(isolated + path.sep));
    fs.renameSync(library, legacy);
    fs.unlinkSync(path.join(legacy, ".knowledge-tree.json"));
    const subjectFile = path.join(legacy, "native-test/subject.yaml");
    fs.writeFileSync(subjectFile, fs.readFileSync(subjectFile, "utf8").replace("format_version: 1\n", "") + "extension_meta: 必须保留\n");
    fs.writeFileSync(path.join(legacy, "native-test/assets/attachment.bin"), Buffer.from([0, 1, 2, 255]));
    for (const name of ["config.json", "config.previous"]) { const file = path.join(configDir, name); if (fs.existsSync(file)) fs.unlinkSync(file); }
    function inventory(dir, result = {}) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.name === ".knowledge-tree.lock") continue; if (entry.isDirectory()) inventory(file, result); else result[path.relative(legacy, file)] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); } return result; }
    const before = inventory(legacy);
    await launch();
    await page.getByRole("heading", { name: "新建学科", exact: true }).waitFor();
    assert.equal((await invoke("startup_status")).source, "legacy");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.deepEqual(inventory(legacy), before);
    const savedConfig = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
    assert.equal(savedConfig.legacy_preferences_imported, true);
    report.flows.legacy = "Unversioned legacy fixture adopted in place; SHA256 preserves every YAML/Markdown/attachment/Git file; raw old theme and layout imported";
    assert.deepEqual(report.errors, []);
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = String(error.stack || error); process.exitCode = 1; }
  finally { await stop(); fs.writeFileSync(path.join(output, "native-lifecycle-check.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
})();
