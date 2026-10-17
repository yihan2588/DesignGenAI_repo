import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pipelineMode, enqueueReply } from '../lib/humor/dispatch.ts';
test('worker mode is opt-in and configuration errors fail closed',()=>{
 assert.equal(pipelineMode(undefined),'mvp');assert.equal(pipelineMode('mvp'),'mvp');assert.equal(pipelineMode('worker'),'worker');
 assert.throws(()=>pipelineMode('production'));
 assert.equal(enqueueReply(null,'run').status,202);
 const failed=enqueueReply({message:'internal database data'},'run');assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes('internal'));
});
test('a hosted preview requires the new pipeline instead of silently falling back to MVP',()=>{
 assert.equal(pipelineMode('worker','preview'),'worker');
 for(const value of [undefined,'','mvp','unknown']) assert.throws(()=>pipelineMode(value,'preview'),/Preview requires/);
 assert.equal(pipelineMode(undefined,'production'),'mvp');
});
