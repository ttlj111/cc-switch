import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRef, ImageRef, TranscriptChunk } from "@/types";

const core = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

// v1 uses events instead of Channel — mock listen as well
const eventApi = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/tauri", () => core);
vi.mock("@tauri-apps/api/event", () => eventApi);

import { sessionsApi } from "@/lib/api/sessions";

describe("sessionsApi · 阅读页命令（P2 契约）", () => {
  beforeEach(() => {
    core.invoke.mockReset();
    eventApi.listen.mockReset();
  });

  it("streamMessages：监听 session-stream-chunk 事件，chunk 回调给调用方", async () => {
    const chunks: TranscriptChunk[] = [];

    // listen returns an unlisten function; capture the handler so we can
    // emit a matching event after streamMessages registers it.
    let capturedHandler: ((event: any) => void) | undefined;

    eventApi.listen.mockImplementation(
      async (_event: string, handler: (event: any) => void) => {
        capturedHandler = handler;
        return vi.fn(); // unlisten
      },
    );

    // When invoke is called, capture the requestId and simulate the backend
    // pushing a chunk event through the captured listener
    core.invoke.mockImplementation(async (_cmd: string, args: any) => {
      // Simulate backend emitting a chunk event
      if (capturedHandler) {
        capturedHandler({
          payload: {
            requestId: args.requestId,
            chunk: { type: "done", payloadBytes: 3 },
          },
        });
      }
    });

    await sessionsApi.streamMessages("claude", "/a.jsonl", (chunk) =>
      chunks.push(chunk),
    );

    expect(core.invoke).toHaveBeenCalledWith(
      "stream_session_messages",
      expect.objectContaining({
        providerId: "claude",
        sourcePath: "/a.jsonl",
        requestId: expect.any(String),
      }),
    );
    expect(eventApi.listen).toHaveBeenCalledWith(
      "session-stream-chunk",
      expect.any(Function),
    );
    expect(chunks).toEqual([{ type: "done", payloadBytes: 3 }]);
  });

  it("getBlockContent 用 contentRef 参数名，分页参数可省", async () => {
    const ref: ContentRef = { kind: "sidecar", relPath: "tool-results/x.txt" };
    core.invoke.mockResolvedValue({ text: "x", totalLen: 1, truncated: false });
    await sessionsApi.getBlockContent("claude", "/a.jsonl", ref);
    await sessionsApi.getBlockContent("claude", "/a.jsonl", ref, {
      offset: 10,
      limit: 20,
    });
    expect(core.invoke.mock.calls).toEqual([
      [
        "get_session_block_content",
        {
          providerId: "claude",
          sourcePath: "/a.jsonl",
          contentRef: ref,
          offset: undefined,
          limit: undefined,
        },
      ],
      [
        "get_session_block_content",
        {
          providerId: "claude",
          sourcePath: "/a.jsonl",
          contentRef: ref,
          offset: 10,
          limit: 20,
        },
      ],
    ]);
  });

  it("getImage / revealPath", async () => {
    const image: ImageRef = {
      source: { kind: "local_file", path: "/tmp/a.png" },
      mediaType: "image/png",
      size: 3,
    };
    const bytes = new ArrayBuffer(3);
    core.invoke.mockResolvedValueOnce(bytes).mockResolvedValueOnce(true);
    await expect(
      sessionsApi.getImage("codex", "/b.jsonl", image),
    ).resolves.toBe(bytes);
    await expect(sessionsApi.revealPath("/tmp/a.png")).resolves.toBe(true);
    expect(core.invoke.mock.calls).toEqual([
      [
        "get_session_image",
        { providerId: "codex", sourcePath: "/b.jsonl", image },
      ],
      ["reveal_session_path", { path: "/tmp/a.png" }],
    ]);
  });
});
