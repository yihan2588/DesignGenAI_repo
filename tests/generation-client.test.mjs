import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startGeneration} from '../lib/humor/generation-client.ts';
test('ready and in-flight responses remain usable; HTML login pages never leak parser errors',async()=>{for(const status of ['ready','generating','pending'])assert.equal((await startGeneration('run',async()=>Response.json({status,runId:'run'}))).status,status);await assert.rejects(startGeneration('run',async()=>new Response('<html>login</html>')),/session may have expired/);await assert.rejects(startGeneration('run',async()=>Response.json({status:'unknown'})),/could not be confirmed/);await assert.rejects(startGeneration('run',async()=>Response.json({error:'Try later.'},{status:429})),/Try later/);});
