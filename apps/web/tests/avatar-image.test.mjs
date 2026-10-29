import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { prepareAvatarImage } from '../lib/avatar-image.ts';

test('avatar uploads decode fully, normalize orientation, strip metadata and store bounded JPEGs', async()=>{
 for (const format of ['jpeg','png','webp']) {
  const bytes=await sharp({create:{width:1200,height:800,channels:3,background:'#946f45'}}).withMetadata({orientation:6}).toFormat(format).toBuffer();
  const output=await prepareAvatarImage(new File([bytes],`photo.${format}`,{type:`image/${format}`}));
  const metadata=await sharp(output).metadata();
  assert.equal(metadata.format,'jpeg'); assert.equal(metadata.width,512); assert.equal(metadata.height,512);
  assert.equal(metadata.exif,undefined); assert.equal(metadata.orientation,undefined); assert.ok(output.length<2*1024*1024);
 }
});
test('avatar upload rejects header-only corruption and disguised files',async()=>{
 for(const [bytes,type] of [[Buffer.from([255,216,255,224]),'image/jpeg'],[Buffer.from([137,80,78,71,13,10,26,10]),'image/png'],[Buffer.from('<svg/>'),'image/jpeg']]) {
  await assert.rejects(prepareAvatarImage(new File([bytes],'photo',{type})),/could not be read/);
 }
});
