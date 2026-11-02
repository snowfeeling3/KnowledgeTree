const { chromium } = require("playwright");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "artifacts/lifecycle");fs.mkdirSync(out,{recursive:true});
const isolated = fs.mkdtempSync(path.join(out,"installer-")), program = path.join(isolated,"program"), config = path.join(isolated,"config"), legacy = path.join(isolated,"legacy");
const uninstallKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Knowledge Tree";
const productKey = "HKCU\\Software\\knowledgetree\\Knowledge Tree";
const report = { isolated, flows: {}, status:"running" };
let browser, child, page, installed=false;
function registryExists(key) {return spawnSync("reg.exe",["query",key],{windowsHide:true,stdio:"ignore"}).status===0;}
async function run(exe,args){return new Promise((resolve,reject)=>{const process=spawn(exe,args,{windowsHide:true,stdio:"ignore"});process.on("error",reject);process.on("exit",code=>code===0?resolve():reject(new Error(`${path.basename(exe)} exit ${code}`)));});}
async function start(old=false){
 const env={...process.env,KNOWLEDGE_TREE_CONFIG_DIR:config,WEBVIEW2_USER_DATA_FOLDER:path.join(isolated,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port=9236"};
 if(old)env.KNOWLEDGE_TREE_LIBRARY=legacy;else delete env.KNOWLEDGE_TREE_LIBRARY;
 child=spawn(path.join(program,"knowledge-tree-desktop.exe"),[],{env,windowsHide:true,stdio:"ignore"});
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error(`App startup exit ${child.exitCode}`);try{browser=await chromium.connectOverCDP("http://127.0.0.1:9236");break;}catch{await new Promise(r=>setTimeout(r,250));}}
 assert.ok(browser);for(let i=0;i<60;i++){page=browser.contexts()[0]?.pages().find(p=>p.url().includes("tauri"));if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page);page.setDefaultTimeout(12000);
}
async function stop(){if(browser){await browser.close();browser=null;}if(child&&child.exitCode===null){const exited=new Promise(r=>child.once("exit",r));child.kill();await exited;}child=null;page=null;}
async function invoke(command,args){return page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});}
function inventory(dir,result={}){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.name===".knowledge-tree.lock")continue;if(entry.isDirectory())inventory(file,result);else result[path.relative(legacy,file)]=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");}return result;}
async function uninstall(){if(!installed)return;const exe=path.join(program,"uninstall.exe");assert.ok(exe.startsWith(isolated+path.sep));await run(exe,["/S","/UPDATE"]);for(let i=0;i<60&&fs.existsSync(path.join(program,"knowledge-tree-desktop.exe"));i++)await new Promise(r=>setTimeout(r,100));assert.equal(fs.existsSync(path.join(program,"knowledge-tree-desktop.exe")),false);
 if(registryExists(productKey)){const query=spawnSync("reg.exe",["query",productKey],{windowsHide:true,encoding:"utf8"}).stdout;assert.ok(query.includes(program));const removed=spawnSync("reg.exe",["delete",productKey,"/f"],{windowsHide:true,stdio:"ignore"});assert.equal(removed.status,0);}installed=false;}
(async()=>{try{
 // Refuse to disturb an existing real installation. /NS suppresses shortcuts. /UPDATE preserves app data during cleanup.
 assert.equal(registryExists(uninstallKey),false,"Existing real installation: run this test in an isolated Windows user/VM");assert.equal(registryExists(productKey),false,"Existing installation settings: use an isolated Windows user/VM");
 const old=path.join(root,"target/release/bundle/nsis/Knowledge Tree_0.1.0_x64-setup.exe"), latest=path.join(root,"dist/releases/0.1.1/Knowledge Tree_0.1.1_x64-setup.exe");
 await run(old,["/S","/NS",`/D=${program}`]);installed=true;await start(true);await page.getByRole("heading",{name:"新建学科",exact:true}).waitFor();
 await invoke("create_subject",{title:"隔离旧库",description:"升级验证",id:"upgrade"});
 await invoke("create_node",{subjectId:"upgrade",node:{title:"保留的笔记",id:"note",type:"concept",stage:null,parent:null,tags:["升级"],references:["local"]}});
 await invoke("write_document",{subjectId:"upgrade",nodeId:"note",content:"# 原始正文\n\n不得覆盖。\n"});
 await page.evaluate(()=>{localStorage.setItem("kt-theme","dark");localStorage.setItem("knowledge-tree-layout","legacy");});await stop();
 const subjectFile=path.join(legacy,"upgrade/subject.yaml");fs.writeFileSync(subjectFile,fs.readFileSync(subjectFile,"utf8").replace("format_version: 1\n","")+"custom_meta: 保留\n");fs.writeFileSync(path.join(legacy,"upgrade/assets/attachment.bin"),Buffer.from([0,1,2,255]));
 const before=inventory(legacy);await run(latest,["/S","/NS",`/D=${program}`]);await start();
 const status=await invoke("startup_status");assert.equal(status.version,"0.1.1");assert.equal(status.ready,true);assert.equal(status.source,"legacy");
 await page.getByRole("button",{name:/隔离旧库/}).click();await page.locator(".workspace").waitFor();assert.equal(await page.locator("html").getAttribute("data-theme"),"dark");assert.deepEqual(inventory(legacy),before);
 const configFile=JSON.parse(fs.readFileSync(path.join(config,"config.json"),"utf8"));assert.ok(configFile.library_path);assert.equal(configFile.legacy_preferences_imported,true);
 const backup=await invoke("create_backup");assert.equal(JSON.parse(fs.readFileSync(path.join(backup,"manifest.json"),"utf8")).status,"verified");
 report.flows.upgrade="Real 0.1.0 NSIS → 0.1.1 overlay preserves YAML, Markdown, binary attachments, every Git file and old preferences";
 await stop();await start();await page.locator(".workspace").waitFor();assert.equal((await invoke("startup_status")).source,"config");assert.deepEqual(inventory(legacy),before);report.flows.restart="Upgraded application restores the workspace from config on subsequent startup";await stop();await uninstall();
 await run(latest,["/S","/NS",`/D=${program}`]);installed=true;assert.ok(fs.existsSync(path.join(program,"knowledge-tree-desktop.exe")));report.flows.fresh_install="Real current-user NSIS fresh installation succeeds with an isolated program path";
 report.status="passed";
 }catch(error){report.status=String(error).includes("Existing")?"blocked-preflight":"failed";report.error=String(error.stack||error);process.exitCode=1;}
 finally{await stop();try{const needed=installed;await uninstall();report.cleanup=needed?"Temporary installation removed in UPDATE mode; user app data untouched":"No installer executed; existing installation settings unchanged";}catch(error){report.cleanupError=String(error);process.exitCode=1;}fs.writeFileSync(path.join(out,"installer-upgrade-check.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})();
