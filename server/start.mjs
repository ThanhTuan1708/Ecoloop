import { createApp } from './app.mjs';
const server=await createApp();
const port=Number(process.env.PORT||process.env.API_PORT||4174);
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`EcoLoop server: http://${process.env.HOST||'127.0.0.1'}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
