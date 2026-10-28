import { beforeEach, describe, expect, it, vi } from "vitest";

// Tauri v1 没有 @tauri-apps/api/log 模块，frontendLogger 改用 console.error/info。
// 通过 spy on console.error 来验证日志输出。

import {
  redactFrontendLogText,
  reportFrontendError,
} from "@/lib/frontendLogger";

describe("frontendLogger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("redacts URL parameters and named credentials", () => {
    const redacted = redactFrontendLogText(
      "https://example.test/path?apiKey=query-secret&name=alice\n" +
        'api_key: "config secret with spaces"\n' +
        "Authorization: Bearer bearer-secret\n" +
        "Authorization: Basic dXNlcjpwYXNz\n" +
        "Authorization: Token token-secret\n" +
        "  Cookie: session=cookie-secret; preference=private\n" +
        "ApiKey standalone-secret\n" +
        "https://user:password@example.test/private",
    );

    expect(redacted).not.toContain("query-secret");
    expect(redacted).not.toContain("alice");
    expect(redacted).not.toContain("config secret with spaces");
    expect(redacted).not.toContain("secret with spaces");
    expect(redacted).not.toContain("bearer-secret");
    expect(redacted).not.toContain("dXNlcjpwYXNz");
    expect(redacted).not.toContain("token-secret");
    expect(redacted).not.toContain("standalone-secret");
    expect(redacted).not.toContain("cookie-secret");
    expect(redacted).not.toContain("preference=private");
    expect(redacted).not.toContain("user:password");
    expect(redacted).toContain("apiKey=[REDACTED]");
    expect(redacted).toContain('api_key: "[REDACTED]"');

    const escapedMultiline = redactFrontendLogText(
      '{"detail":"line1\\nsk-ant-api03-escaped-secret"}',
    );
    expect(escapedMultiline).not.toContain("sk-ant-api03-escaped-secret");
  });

  it("writes bounded, redacted errors through console.error", () => {
    const secret = "sensitive-token";
    const oversizedDetails = `${"x".repeat(2_000_000)} token=${secret}`;

    reportFrontendError(
      "window.error",
      new Error(`failed at https://example.test/?key=${secret}`),
      oversizedDetails,
    );

    expect(errorSpy).toHaveBeenCalledOnce();
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain(secret);
    expect(message).toContain("[truncated]");
    expect(message.length).toBeLessThanOrEqual(12_020);
  });

  it("serializes object-shaped rejection reasons without exposing secrets", () => {
    reportFrontendError("unhandledrejection", {
      code: 500,
      message: "auth failed",
      key: "short-secret",
      token: "object-secret",
      tokens: ["k-9f3a7c2b1e"],
      auth: ["opaque-credential"],
      credential: "AIzaRealCredential123",
      nested: { detail: "ghp_abcdef123456" },
      values: ["eyJhbGciOiJIUzI1NiJ9.cGF5bG9hZA.c2lnbmF0dXJl"],
      multiline: "line1\nsk-ant-api03-multiline-secret",
      session: { activeTab: "providers", scrollPos: 120 },
    });

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain('"code":500');
    expect(message).toContain('"message":"auth failed"');
    expect(message).not.toContain("short-secret");
    expect(message).not.toContain("object-secret");
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).not.toContain("opaque-credential");
    expect(message).not.toContain("AIzaRealCredential123");
    expect(message).not.toContain("ghp_abcdef123456");
    expect(message).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(message).not.toContain("sk-ant-api03-multiline-secret");
    expect(message).toContain('"key":"[REDACTED]"');
    expect(message).toContain('"token":"[REDACTED]"');
    expect(message).toContain('"tokens":"[REDACTED]"');
    expect(message).toContain('"auth":"[REDACTED]"');
    expect(message).toContain('"credential":"[REDACTED]"');
    expect(message).toContain(
      '"session":{"activeTab":"providers","scrollPos":120}',
    );
  });

  it("applies property-level redaction to stringified-JSON rejection reasons", () => {
    reportFrontendError(
      "unhandledrejection",
      '{"tokens":["k-9f3a7c2b1e"],"auth":["opaque-credential"],"key":"short-secret","keepMe":"visible"}',
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).not.toContain("opaque-credential");
    expect(message).not.toContain("short-secret");
    expect(message).toContain('"tokens":"[REDACTED]"');
    expect(message).toContain('"auth":"[REDACTED]"');
    expect(message).toContain('"key":"[REDACTED]"');
    expect(message).toContain('"keepMe":"visible"');
  });

  it("keeps non-JSON error strings as readable text", () => {
    reportFrontendError("window.error", "plain failure at step 3");

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain("plain failure at step 3");
  });

  it("applies property-level redaction to JSON wrapped in an Error message", () => {
    reportFrontendError(
      "unhandledrejection",
      new Error(
        '{"tokens":["k-9f3a7c2b1e"],"key":"short-secret","keepMe":"visible"}',
      ),
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).not.toContain("short-secret");
    expect(message).toContain('"tokens":"[REDACTED]"');
    expect(message).toContain('"key":"[REDACTED]"');
    expect(message).toContain('"keepMe":"visible"');
  });

  it("omits oversized JSON error strings instead of leaking truncated fields", () => {
    const padding = "x".repeat(20_000);
    reportFrontendError(
      "unhandledrejection",
      `{"tokens":["k-9f3a7c2b1e"],"padding":"${padding}"}`,
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).toContain("[oversized structured error omitted]");
  });

  it("omits oversized JSON wrapped in an Error message", () => {
    const padding = "x".repeat(20_000);
    reportFrontendError(
      "unhandledrejection",
      new Error(`{"tokens":["k-9f3a7c2b1e"],"padding":"${padding}"}`),
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).toContain("[oversized structured error omitted]");
  });

  it("redacts array credentials in prefix+JSON rejection strings", () => {
    reportFrontendError(
      "unhandledrejection",
      'Load failed: {"tokens":["ak_live_7f3d9b21c8e4"]}',
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("ak_live_7f3d9b21c8e4");
    expect(message).toContain("Load failed");
  });

  it("redacts array credentials in prefix+JSON wrapped in an Error", () => {
    reportFrontendError(
      "unhandledrejection",
      new Error(
        "Provider provisioning failed: " +
          JSON.stringify({ apiKeys: ["ak_live_7f3d9b21c8e4"] }),
      ),
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("ak_live_7f3d9b21c8e4");
  });

  it("redacts credentials in double-encoded nested JSON (escaped quotes)", () => {
    reportFrontendError(
      "unhandledrejection",
      new Error(
        JSON.stringify({
          status: 400,
          body: '{"keys":["abcd1234efgh5678ij"]}',
        }),
      ),
    );

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("abcd1234efgh5678ij");
  });

  it("redacts array credentials in a POJO (non-Error) rejection", () => {
    reportFrontendError("unhandledrejection", {
      name: "HttpError",
      message: '{"tokens":["opaqueTokenValue12345"]}',
      code: 400,
    });

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("opaqueTokenValue12345");
  });

  it("redacts container values only under sensitive keys", () => {
    const redacted = redactFrontendLogText(
      '{"tokens":["k-secret-1"],"monkey":["visible-a"],"items":["visible-b"],"config":{"theme":"dark"}}',
    );

    expect(redacted).not.toContain("k-secret-1");
    expect(redacted).toContain("visible-a");
    expect(redacted).toContain("visible-b");
    expect(redacted).toContain('"theme":"dark"');
  });

  it("preserves native WebKit-style stack frames for JSON-wrapped errors", () => {
    const err = new Error('{"tokens":["k-9f3a7c2b1e"]}');
    Object.defineProperty(err, "stack", {
      value:
        "handleClick@tauri://localhost/assets/index.js:42:15\n" +
        "dispatch@tauri://localhost/assets/index.js:99:3",
    });

    reportFrontendError("unhandledrejection", err);

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain("k-9f3a7c2b1e");
    expect(message).toContain('"tokens":"[REDACTED]"');
    expect(message).toContain("handleClick@tauri://localhost");
    expect(message).toContain("dispatch@tauri://localhost");
  });

  it("replaces every occurrence of the raw message in a V8-style stack", () => {
    const secret = "sk-ant-api03-1234567890";
    const err = new Error(`failed with ${secret}`);
    // V8 style: first line = "Error: message", then stack frames
    Object.defineProperty(err, "stack", {
      value:
        `Error: failed with ${secret}\n` +
        `    at Object.handler (app.ts:1:1)\n` +
        `    at callback (app.ts:2:3)`,
    });

    reportFrontendError("unhandledrejection", err);

    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).not.toContain(secret);
    // [REDACTED] should appear in both the message and stack first line
    expect(message).toContain("[REDACTED]");
    expect(message).toContain("app.ts:1:1");
    expect(message).toContain("app.ts:2:3");
  });

  it("detects circular references safely", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;

    reportFrontendError("window.error", obj);

    expect(errorSpy.mock.calls[0][0] as string).toContain("[Circular]");
  });
});
