// Creates backend/.env and frontend/.env.local from the .example files if they do not exist yet. Never overwrites.
import { copyFileSync, existsSync } from 'node:fs';
for (const [from, to] of [['backend/.env.example', 'backend/.env'], ['frontend/.env.example', 'frontend/.env.local']]) {
  if (existsSync(to)) console.log(`kept   ${to}`);
  else { copyFileSync(from, to); console.log(`created ${to}`); }
}
