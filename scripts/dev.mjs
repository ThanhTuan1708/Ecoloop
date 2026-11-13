import { spawn } from 'node:child_process';
const envArgs=['--env-file-if-exists=.env','--env-file-if-exists=.env.local'];
const children=[spawn(process.execPath,[...envArgs,'server/start.mjs'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0'],{stdio:'inherit'})];
let closing=false;function stop(code=0){if(closing)return;closing=true;children.forEach(child=>child.kill());setTimeout(()=>process.exit(code),200).unref();}
for(const child of children)child.on('exit',code=>stop(code||0));
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
