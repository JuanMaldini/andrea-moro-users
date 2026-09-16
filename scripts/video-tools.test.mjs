import test from "node:test";
import assert from "node:assert/strict";
import { decide, hasFaststart, verifyOutput } from "./lib/pb-video.mjs";

const compatible = { vCodec: "h264", aCodec: "aac", pixFmt: "yuv420p", transfer: "bt709" };
test("compatible files are preserved; only container/faststart needs remux", () => {
  assert.equal(decide(compatible, { isMp4: true, faststart: true }), "skip");
  assert.equal(decide(compatible, { isMp4: true, faststart: false }), "remux");
  assert.equal(decide(compatible, { isMp4: false, faststart: true }), "remux");
  assert.equal(decide({ ...compatible, aCodec: "" }, { isMp4: true, faststart: true }), "skip");
});
test("HEVC, unknown pixel format, 10-bit, HDR and incompatible audio require encoding", () => {
  for (const patch of [{ vCodec: "hevc" }, { pixFmt: "" }, { pixFmt: "yuv420p10le" }, { transfer: "smpte2084" }, { transfer: "arib-std-b67" }, { aCodec: "pcm_s16le" }]) {
    assert.equal(decide({ ...compatible, ...patch }, { isMp4: true, faststart: true }), "encode");
  }
});
function atom(type) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(8);
  buffer.write(type, 4);
  return buffer;
}
test("faststart reads moov before mdat, rejects the reverse and truncated headers", async (t) => {
  for (const [buffer, expected] of [
    [Buffer.concat([atom("ftyp"), atom("moov"), atom("mdat")]), true],
    [Buffer.concat([atom("ftyp"), atom("mdat"), atom("moov")]), false],
    [Buffer.alloc(4), false],
  ]) {
    t.mock.method(globalThis, "fetch", async () => new Response(buffer));
    assert.equal(await hasFaststart("https://test.invalid/video.mp4"), expected);
    t.mock.restoreAll();
  }
});
test("servers ignoring Range cannot cause a whole-file download into memory", async (t) => {
  let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream({
    pull(controller) {
      chunks++;
      const buffer = Buffer.alloc(32768);
      atom("moov").copy(buffer);
      controller.enqueue(buffer);
    },
    cancel() { cancelled = true; },
  });
  t.mock.method(globalThis, "fetch", async () => new Response(body, { status: 200 }));
  assert.equal(await hasFaststart("https://test.invalid/video.mp4"), true);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 3);
});
test("missing or invalid media fails output validation", () => {
  assert.equal(verifyOutput("nonexistent-video-fixture.mp4", 10).ok, false);
});
