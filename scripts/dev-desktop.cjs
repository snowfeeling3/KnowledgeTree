// Start Tauri with a usable local Windows toolchain, without changing global Rust settings.
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const env = { ...process.env };
function output(command, args) {
  try { return execFileSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim(); }
  catch { return ''; }
}
async function main() {
  if (process.platform === 'win32' && !env.RUSTUP_TOOLCHAIN && !output('where.exe', ['link.exe'])) {
    const installed = output('rustup', ['toolchain', 'list']);
    const gnu = installed.split(/\r?\n/).map(line => line.split(/\s/)[0]).find(name => name === 'stable-x86_64-pc-windows-gnu');
    if (!gnu) throw new Error('MSVC link.exe is unavailable and the GNU toolchain is not installed. Install Visual Studio C++ Build Tools, or rustup toolchain install stable-x86_64-pc-windows-gnu with MinGW-w64.');
    const gcc = output('where.exe', ['gcc.exe']);
    if (!gcc) {
      const mingw = ['C:/Program Files/mingw64/bin', 'C:/msys64/mingw64/bin', 'C:/msys64/ucrt64/bin'].find(folder => fs.existsSync(path.join(folder, 'gcc.exe')));
      if (!mingw) throw new Error('The GNU Rust toolchain needs MinGW-w64 gcc.exe on PATH.');
      env.PATH = mingw + path.delimiter + (env.PATH || env.Path || '');
    }
    env.RUSTUP_TOOLCHAIN = gnu;
    console.log('[KnowledgeTree] Using the installed GNU/MinGW toolchain (MSVC link.exe is not available).');
  }
  if (process.argv.includes('--check')) {
    const compiler = output('rustc', ['-vV']);
    if (!compiler) throw new Error('rustc is unavailable. Install Rust and restart the terminal.');
    console.log(compiler);
    console.log('[KnowledgeTree] Development prerequisites checked.');
    return;
  }
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? 'Port 1420 is already in use. Stop the frontend preview or previous pnpm dev session before starting the desktop app. The other process has not been stopped automatically.' : error.message)));
    server.listen(1420, '127.0.0.1', () => server.close(resolve));
  });
  // The package manager launches both Vite and Tauri and retains its normal argument handling.
  const args = process.argv.slice(2);
  if (args.some(arg => !/^[a-zA-Z0-9_./:=+-]+$/.test(arg))) throw new Error('Unsupported development argument. Use the desktop package directly for complex arguments.');
  const child = spawn(`pnpm --dir apps/desktop dev${args.length ? ' ' + args.join(' ') : ''}`, { cwd: root, env, stdio: 'inherit', shell: true });
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
}
main().catch(error => { console.error(`[KnowledgeTree] ${error.message}`); process.exitCode = 1; });
