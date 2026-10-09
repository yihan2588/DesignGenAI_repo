import assert from "node:assert/strict";
import { test } from "node:test";
import { validateVote, parseCaption } from "../lib/caption-validation.ts";
import { generateCaption } from "../lib/gemini.ts";
import { readFileSync } from "node:fs";

test("every assistant-authored seed saves its original prompt and two short sentences", () => {
  const seeds = JSON.parse(readFileSync(new URL("../data/ai_captions.json", import.meta.url), "utf8"));
  assert.match(seeds.prompt, /without searching online/);
  assert.match(seeds.prompt, /exactly two string fields/);
  assert.equal(seeds.captions.length, 12);
  for (const caption of [...seeds.captions, ...seeds.extra_captions]) parseCaption(caption);
});

test("votes accept only a real caption UUID and one of two ratings", () => {
  const form = new FormData();
  form.set("caption_id", "2c195fa9-64db-4591-9f9e-4edc87124fe9");
  form.set("value", "1");
  assert.deepEqual(validateVote(form), { caption_id: form.get("caption_id"), value: 1 });
  form.set("value", "-1");
  assert.equal(validateVote(form).value, -1);
  for (const value of ["0", "2", "1x", "", "Infinity"]) {
    form.set("value", value);
    assert.equal(validateVote(form), null);
  }
  form.set("value", "1");
  form.set("caption_id", "1 OR true");
  assert.equal(validateVote(form), null);
});

test("a caption contains exactly one short dish sentence and one region sentence", () => {
  const caption = { dish: "Salmon and pasta look savory and rich.", region: "This resembles Mediterranean cooking." };
  assert.deepEqual(parseCaption(caption), caption);
  for (const bad of [null, {}, { ...caption, dish: "" }, { ...caption, region: "One. Two." },
    { ...caption, dish: "a".repeat(160) + "." }, { ...caption, dish: "<script>bad</script>." },
    { ...caption, region: "No punctuation" }]) assert.throws(() => parseCaption(bad));
});

test("Gemini receives the image and exact saved prompt without search tools", async () => {
  const output = { dish: "Salmon and pasta look savory and rich.", region: "This resembles Mediterranean cooking." };
  const result = await generateCaption(Buffer.from("image"), "The exact prompt", "fake-test-key", async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(options.headers["x-goog-api-key"], "fake-test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gemini-3.1-flash-lite");
    assert.equal(body.input[0].text, "The exact prompt");
    assert.equal(body.input[1].data, Buffer.from("image").toString("base64"));
    assert.equal(body.tools, undefined);
    assert.equal(body.store, false);
    return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(output) }] }] });
  });
  assert.deepEqual(result, output);
});

test("provider failures never expose response bodies or credentials", async () => {
  await assert.rejects(generateCaption(Buffer.from("image"), "prompt", "fake-test-key", async () =>
    new Response("private provider details", {status: 429})), /busy/);
  await assert.rejects(generateCaption(Buffer.from("image"), "prompt", "fake-test-key", async () =>
    Response.json({status:"completed", steps:[{type:"model_output",content:[{type:"text",text:'{"dish":"Wrong format"}'}]}]})), /two short sentences/);
});
