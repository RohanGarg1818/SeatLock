// Starts the API and the website together with prefixed output. They stay independent programs:
// this only spawns `npm run dev` in each folder. Ctrl+C stops both.
import { spawn } from 'node:child_process';
const procs = [['backend', 'backend'], ['frontend', 'frontend']].map(([name, dir]) => {
  const p = spawn('npm', ['run', 'dev'], { cwd: dir, shell: process.platform === 'win32' });
  const tag = (s) => s.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (d) => process.stdout.write(tag(d)));
  p.stderr.on('data', (d) => process.stderr.write(tag(d)));
  p.on('exit', (code) => { console.log(`[${name}] exited (${code})`); stop(); });
  return p;
});
let stopping = false;
function stop() { if (stopping) return; stopping = true; procs.forEach((p) => p.kill()); setTimeout(() => process.exit(0), 300); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
