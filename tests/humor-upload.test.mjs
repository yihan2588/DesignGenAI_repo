import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_UPLOAD_BYTES, MAX_SOURCE_BYTES, validateUploadSource, prepareUploadImage } from '../lib/humor/upload-image.ts';

test('source validation rejects empty, unsupported and over-limit files before transport', () => {
 for (const file of [{size:0,type:'image/jpeg'},{size:MAX_SOURCE_BYTES+1,type:'image/jpeg'},{size:100,type:'image/heic'}]) assert.ok(validateUploadSource(file));
 for (const type of ['image/jpeg','image/png','image/webp']) assert.equal(validateUploadSource({size:MAX_SOURCE_BYTES,type}),null);
});
test('small files remain intact and large images are reduced below multipart transport limit', async () => {
 const small = new File(['small'],'small.jpg',{type:'image/jpeg'});
 assert.equal(await prepareUploadImage(small),small);
 let closed=false, dimensions;
 const originalBitmap=globalThis.createImageBitmap, originalDocument=globalThis.document;
 globalThis.createImageBitmap=async()=>({width:4000,height:3000,close(){closed=true;}});
 globalThis.document={createElement(){const canvas={width:0,height:0,getContext(){return {fillRect(){},drawImage(){dimensions=[canvas.width,canvas.height];}}},toBlob(callback,type){callback(new Blob([new Uint8Array(200000)],{type}));}};return canvas;}};
 try {
  const source=new File([new Uint8Array(4*1024*1024)],'large.png',{type:'image/png'});
  const result=await prepareUploadImage(source);
  assert.equal(result.type,'image/jpeg'); assert.ok(result.size<=MAX_UPLOAD_BYTES); assert.deepEqual(dimensions,[1600,1200]); assert.ok(closed);
  const form=new FormData(); form.set('photo',result); form.set('public_ack','on'); form.set('request_key',crypto.randomUUID());
  assert.ok((await new Response(form).arrayBuffer()).byteLength < 3*1024*1024);
  globalThis.createImageBitmap=async()=>{throw Error('decode failed');};
  await assert.rejects(prepareUploadImage(source),/could not be read/);
  globalThis.createImageBitmap=async()=>({width:8000,height:6000,close(){}});
  await assert.rejects(prepareUploadImage(source),/20 megapixels/);
 } finally {globalThis.createImageBitmap=originalBitmap;globalThis.document=originalDocument;}
});
