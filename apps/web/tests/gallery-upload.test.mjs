import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
const MAX_GALLERY_BYTES = 2 * 1024 * 1024;
import { prepareGalleryImage } from "../lib/gallery-image.ts";

const prepare = (file) => prepareGalleryImage(file, MAX_GALLERY_BYTES);

test("image uploads are decoded, resized, converted to JPEG and stripped of EXIF", async () => {
  const source = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#b45135" } })
    .withExif({ IFD0: { Artist: "Private camera owner" } }).png().toBuffer();
  const output = await prepare(new File([source], "meal.png", {type: "image/png"}));
  const info = await sharp(output).metadata();
  assert.equal(info.format, "jpeg");
  assert.equal(info.width, 2000);
  assert.equal(info.height, 1000);
  assert.equal(info.exif, undefined);
  assert.ok(output.length <= MAX_GALLERY_BYTES);
});

test("rejects empty, oversized, disguised and truncated images", async () => {
  await assert.rejects(prepare(new File([], "empty.jpg", {type:"image/jpeg"})));
  await assert.rejects(prepare(new File([new Uint8Array(MAX_GALLERY_BYTES + 1)], "large.jpg", {type:"image/jpeg"})));
  await assert.rejects(prepare(new File(["<svg></svg>"], "fake.png", {type:"image/png"})));
  await assert.rejects(prepare(new File([new Uint8Array([137,80,78,71,13,10,26,10])], "truncated.png", {type:"image/png"})));
  await assert.rejects(prepare(new File(["<svg></svg>"], "vector.svg", {type:"image/svg+xml"})));
});
