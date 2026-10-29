import test from 'node:test';import assert from 'node:assert/strict';
import {galleryQuery,galleryAction,publishInput} from '../lib/gallery/contracts.ts';
const id='00000000-0000-4000-8000-000000000001';
test('gallery requests bound searches, pages, public names and snapshot references',()=>{
 assert.equal(galleryQuery.parse({}).filter,'latest');
 assert.equal(galleryQuery.safeParse({page:'-1'}).success,false);
 assert.equal(galleryQuery.safeParse({q:'x'.repeat(161)}).success,false);
 assert.equal(publishInput.safeParse({sessionId:id,optionId:id,revision:0,authorName:'Someone'}).success,false);
 assert.equal(publishInput.safeParse({sessionId:id,optionId:id,revision:1,authorName:'   '}).success,false);
 assert.equal(publishInput.parse({sessionId:id,optionId:id,revision:2,authorName:' Studio '}).authorName,'Studio');
});
test('reaction mutations are explicit and reporting needs a bounded reason',()=>{
 assert.equal(galleryAction.safeParse({id,action:'like'}).success,false);
 assert.equal(galleryAction.parse({id,action:'like',value:false}).value,false);
 assert.equal(galleryAction.safeParse({id,action:'report'}).success,false);
 assert.equal(galleryAction.safeParse({id,action:'report',reason:'x'.repeat(501)}).success,false);
 assert.equal(galleryAction.safeParse({id,action:'post_remove'}).success,false);
 assert.equal(galleryAction.safeParse({id,action:'unpublish'}).success,true);
});
