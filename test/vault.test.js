import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Twitch} from '../twitch.js';
test('Windows DPAPI round trip, one-time OAuth state and mocked token refresh',{skip:process.platform!=='win32'},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pulse-vault-'));const hooks={gap(){},error(){},list:()=>[]};
 const originalId=process.env.TWITCH_CLIENT_ID,originalSecret=process.env.TWITCH_CLIENT_SECRET;
 delete process.env.TWITCH_CLIENT_ID;delete process.env.TWITCH_CLIENT_SECRET;
 t.after(()=>{for(const [k,v] of [['TWITCH_CLIENT_ID',originalId],['TWITCH_CLIENT_SECRET',originalSecret]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}rmSync(dir,{recursive:true,force:true});});
 let expired=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.endsWith('/validate')){if(expired){expired=false;return new Response(null,{status:401});}return Response.json({client_id:'mock-app',user_id:'7',scopes:['user:read:chat']});}
  assert.ok(url.endsWith('/token'));const refresh=options.body.get('grant_type')==='refresh_token';return Response.json({access_token:refresh?'mock-refreshed':'mock-initial',refresh_token:'mock-refresh',scope:['user:read:chat']});
 });
 const first=new Twitch(dir,hooks);
 first.configure('mock-app','mock-secret');
 assert.ok(!readFileSync(first.clientFile,'utf8').includes('mock-secret'));
 const authorization=new URL(first.authorize());assert.equal(authorization.searchParams.get('client_id'),'mock-app');
 const state=authorization.searchParams.get('state');await first.finish(state,'mock-code');
 assert.equal(first.user,'7');assert.ok(!readFileSync(first.file,'utf8').includes('mock-initial'));await assert.rejects(first.finish(state,'mock-code'),/state/);
 const restored=new Twitch(dir,hooks);expired=true;await restored.init();assert.equal(restored.token.access_token,'mock-refreshed');
});

