import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import config from '../config/app.json' with {type:'json'};
import handler from '../api/index.mjs';

test('Vercel starts outside the checkout and serves bundled Fuji configuration',async()=>{
  const cwd=process.cwd();
  const dir=await mkdtemp(join(tmpdir(),'ecoloop-vercel-test-'));
  const server=createServer(handler);
  try{
    process.chdir(dir);
    process.env.DATA_DIR=join(dir,'data');
    process.env.VERCEL='1';
    delete process.env.NULLMAPS_URL;
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const base=`http://127.0.0.1:${server.address().port}`;
    const [app,maps]=await Promise.all([fetch(base+'/api/config'),fetch(base+'/api/maps/config')]);
    assert.equal(app.status,200);
    assert.equal((await app.json()).pickupContract,config.pickupContract);
    assert.equal(maps.status,503);
    assert.match((await maps.json()).error,/Nullmaps trên Vercel/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    process.chdir(cwd);
    await rm(dir,{recursive:true,force:true});
  }
});
