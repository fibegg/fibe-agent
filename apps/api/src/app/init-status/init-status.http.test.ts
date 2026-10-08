import 'reflect-metadata';
import { afterEach, expect, test } from 'bun:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import express from 'express';
import type { Server } from 'node:http';
import { AppController } from '../app.controller';
import { serveIndexLogic, clearCacheForTests } from '../serve-index.util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InitStatusController } from './init-status.controller';
import { ConfigService } from '../config/config.service';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { readPostInitState, writePostInitState, runPostInitOnce } from '../../post-init-runner';

let chatServer: Server | undefined;
let root: string;
let app: Awaited<ReturnType<typeof NestFactory.create>>;
afterEach(async () => { await app?.close(); if (chatServer) await new Promise<void>(resolve => chatServer!.close(() => resolve())); chatServer=undefined; clearCacheForTests(); if (root) rmSync(root,{recursive:true,force:true}); });

test('actual managed HTTP status/retry requires authentication and admits only failed setup', async () => {
  root=mkdtempSync(join(tmpdir(),'preset-init-http-'));
  const config={getAgentPassword:()=> 'fixture-managed-password',getConversationDataDir:()=>root,getPostInitScript:()=> 'exit 7',getPlaygroundsDir:()=>root,getSystemPrompt:()=> 'fixture prompt'};
  @Module({controllers:[InitStatusController],providers:[AgentAuthGuard,{provide:ConfigService,useValue:config}]})
  class FixtureModule {}
  app=await NestFactory.create(FixtureModule,new FastifyAdapter(),{logger:false});
  app.setGlobalPrefix('api');
  await app.listen(0,'127.0.0.1');
  const url=await app.getUrl();
  expect((await fetch(`${url}/api/init-status`)).status).toBe(401);
  const headers={Authorization:'Bearer fixture-managed-password'};
  writePostInitState(root,{state:'succeeded'});
  expect((await fetch(`${url}/api/init-status/retry`,{method:'POST',headers})).status).toBe(409);
  writePostInitState(root,{state:'failed',error:'fixture failure'});
  expect((await fetch(`${url}/api/init-status/retry`,{method:'POST'})).status).toBe(401);
  expect(readPostInitState(root)?.state).toBe('failed');
  const response=await fetch(`${url}/api/init-status/retry`,{method:'POST',headers});
  expect(response.status).toBe(201);
  const claimed=await response.json() as {runId:string;scriptDigest:string};
  expect(claimed.runId).toBeTruthy();
  expect(claimed.scriptDigest).toBeTruthy();
  const deadline=Date.now()+2000;
  while (readPostInitState(root)?.state==='running' && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
  const status=await (await fetch(`${url}/api/init-status`,{headers})).json() as {state:string;runId:string};
  expect(status.state).toBe('failed');
  expect(status.runId).toBe(claimed.runId);
});


test('actual chat document and health stay reachable while setup is pending, running or failed', async () => {
  root=mkdtempSync(join(tmpdir(),'preset-chat-http-'));
  writeFileSync(join(root,'index.html'),'<html><head></head><body>fixture-chat-document</body></html>');
  const chat=express();
  chat.use((request,response,next)=>serveIndexLogic(request,response,next,root));
  chatServer=chat.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>chatServer!.once('listening',resolve));
  const address=chatServer.address() as {port:number};
  const chatUrl=`http://127.0.0.1:${address.port}`;
  const config={getAgentPassword:()=> 'fixture-managed-password',getConversationDataDir:()=>root,getPostInitScript:()=> 'exit 7',getPlaygroundsDir:()=>root,getSystemPrompt:()=> 'fixture prompt'};
  @Module({controllers:[InitStatusController,AppController],providers:[AgentAuthGuard,{provide:ConfigService,useValue:config}]})
  class ReachabilityFixtureModule {}
  app=await NestFactory.create(ReachabilityFixtureModule,new FastifyAdapter(),{logger:false});
  app.setGlobalPrefix('api');
  await app.listen(0,'127.0.0.1');
  const url=await app.getUrl();
  const headers={Authorization:'Bearer fixture-managed-password'};
  const verify=async (expected:string)=>{
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
    expect(await (await fetch(chatUrl)).text()).toContain('fixture-chat-document');
    const status=await (await fetch(`${url}/api/init-status`,{headers})).json() as {state:string};
    expect(status.state).toBe(expected);
  };
  await verify('pending');
  const release=join(root,'release');
  const execution=runPostInitOnce(root,'while [ ! -f "$FIBE_PRESET_INPUT_RELEASE" ]; do sleep .01; done; exit 5',root,{timeoutMs:2000,env:{FIBE_PRESET_INPUT_RELEASE:release}});
  try { await verify('running'); } finally { writeFileSync(release,'release'); await execution; }
  await verify('failed');
});
