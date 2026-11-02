import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  apiKeyFromEnv,
  asyncScanRemote,
  asyncScanWithIntentRemote,
  asyncTaskResultRemote,
  asyncTaskStatusRemote,
  callRemoteTool,
  endpointFromEnv,
  extractJsonPayloads,
  MAX_INTENT_LENGTH,
  parseToolResponse,
  scanRemote,
  scanWithIntentRemote,
} from "../src/remote.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Captured { url?: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }

function resp(body: string, opts: Partial<HttpResponse> = {}): HttpResponse {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => body, ...opts };
}
const jsonResult = (text: string) =>
  JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } });
const sseResult = (text: string) =>
  `event: message\ndata: ${jsonResult(text)}\n\n`;

function fake(captured: Captured, body: string): FetchFn {
  return async (url, init) => { captured.url = url; captured.init = init; return resp(body); };
}
function sentArgs(c: Captured): Record<string, unknown> {
  return JSON.parse(c.init?.body ?? "{}").params.arguments;
}
function sentName(c: Captured): string {
  return JSON.parse(c.init?.body ?? "{}").params.name;
}

describe("env helpers", () => {
  it("apiKeyFromEnv returns a trimmed key or undefined", () => {
    assert.equal(apiKeyFromEnv({ PRECLICK_API_KEY: " k " }), "k");
    assert.equal(apiKeyFromEnv({}), undefined);
    assert.equal(apiKeyFromEnv({ PRECLICK_API_KEY: "  " }), undefined);
  });
  it("endpointFromEnv defaults and overrides", () => {
    assert.equal(endpointFromEnv({}), "https://preclick.ai/mcp");
    assert.equal(endpointFromEnv({ LINKGUARD_ENDPOINT: " https://example.test/mcp " }), "https://example.test/mcp");
    assert.equal(endpointFromEnv({ LINKGUARD_ENDPOINT: " " }), "https://preclick.ai/mcp");
  });
});

describe("extractJsonPayloads / parseToolResponse", () => {
  it("parses plain JSON result content", () => {
    assert.equal(parseToolResponse(jsonResult("risk_score: 12")), "risk_score: 12");
  });
  it("parses SSE data lines, ignoring comments", () => {
    assert.equal(parseToolResponse(`: keep-alive\n${sseResult("sse verdict")}`), "sse verdict");
  });
  it("extracts multiple payloads and uses the last result", () => {
    const body = `data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\ndata: ${jsonResult("final")}\n\n`;
    assert.equal(extractJsonPayloads(body).length, 2);
    assert.equal(parseToolResponse(body), "final");
  });
  it("preserves structured results as JSON when there is no text part", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { risk_score: 4, task_id: "t-1" } });
    assert.deepEqual(JSON.parse(parseToolResponse(body)), { risk_score: 4, task_id: "t-1" });
  });
  it("throws on JSON-RPC error payloads", () => {
    assert.throws(() => parseToolResponse(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "bad url" } })), /PreClick remote error: bad url/);
  });
  it("throws on empty / non-JSON bodies", () => {
    assert.throws(() => parseToolResponse(""), /empty or non-JSON/);
    assert.throws(() => parseToolResponse("<html>no</html>"), /empty or non-JSON/);
  });
});

describe("callRemoteTool", () => {
  it("POSTs a tools/call JSON-RPC body to the default endpoint without a key header", async () => {
    const c: Captured = {};
    const text = await callRemoteTool(fake(c, jsonResult("ok")), "url_scanner_scan", { url: "https://example.com" });
    assert.equal(text, "ok");
    assert.equal(c.url, "https://preclick.ai/mcp");
    assert.equal(c.init?.method, "POST");
    assert.equal(c.init?.headers?.["X-API-Key"], undefined);
    const sent = JSON.parse(c.init?.body ?? "{}");
    assert.equal(sent.method, "tools/call");
    assert.equal(sent.params.name, "url_scanner_scan");
    assert.deepEqual(sent.params.arguments, { url: "https://example.com" });
    assert.ok(String(c.init?.headers?.Accept).includes("text/event-stream"));
  });
  it("sends the X-API-Key header and honours a custom endpoint", async () => {
    const c: Captured = {};
    await callRemoteTool(fake(c, jsonResult("ok")), "url_scanner_scan", { url: "https://example.com" }, { apiKey: "pk-1", endpoint: "https://example.test/mcp" });
    assert.equal(c.url, "https://example.test/mcp");
    assert.equal(c.init?.headers?.["X-API-Key"], "pk-1");
  });
  it("handles an SSE upstream response", async () => {
    const c: Captured = {};
    assert.equal(await callRemoteTool(fake(c, sseResult("from sse")), "url_scanner_scan", { url: "https://example.com" }), "from sse");
  });
  it("surfaces HTTP failures with status and body detail", async () => {
    const failing: FetchFn = async () => resp("slow down", { ok: false, status: 429, statusText: "Too Many Requests" });
    await assert.rejects(() => callRemoteTool(failing, "url_scanner_scan", { url: "https://example.com" }), /HTTP 429.*slow down/);
  });
  it("surfaces connection failures naming the endpoint", async () => {
    const failing: FetchFn = async () => { throw new Error("fetch failed"); };
    await assert.rejects(() => callRemoteTool(failing, "url_scanner_scan", { url: "https://example.com" }), /Failed to reach PreClick remote at https:\/\/preclick\.ai\/mcp: fetch failed/);
  });
});

describe("tool wrappers", () => {
  it("scan validates the url and forwards it trimmed", async () => {
    const c: Captured = {};
    await scanRemote(fake(c, jsonResult("verdict")), { url: " https://example.com/a " });
    assert.equal(sentName(c), "url_scanner_scan");
    assert.deepEqual(sentArgs(c), { url: "https://example.com/a" });
    await assert.rejects(() => scanRemote(fake({}, jsonResult("x")), { url: " " }), /non-empty/);
  });
  it("scan_with_intent forwards intent and omits it when absent", async () => {
    const c: Captured = {};
    await scanWithIntentRemote(fake(c, jsonResult("v")), { url: "https://example.com", intent: " pay an invoice " });
    assert.equal(sentName(c), "url_scanner_scan_with_intent");
    assert.deepEqual(sentArgs(c), { url: "https://example.com", intent: "pay an invoice" });
    const c2: Captured = {};
    await scanWithIntentRemote(fake(c2, jsonResult("v")), { url: "https://example.com" });
    assert.deepEqual(sentArgs(c2), { url: "https://example.com" });
  });
  it("intent at exactly 248 characters passes and 249 is rejected locally", async () => {
    const okIntent = "x".repeat(MAX_INTENT_LENGTH);
    const c: Captured = {};
    await scanWithIntentRemote(fake(c, jsonResult("v")), { url: "https://example.com", intent: okIntent });
    assert.equal((sentArgs(c).intent as string).length, 248);
    const tooLong = "x".repeat(MAX_INTENT_LENGTH + 1);
    await assert.rejects(() => scanWithIntentRemote(fake({}, jsonResult("v")), { url: "https://example.com", intent: tooLong }), /at most 248 characters/);
    await assert.rejects(() => asyncScanWithIntentRemote(fake({}, jsonResult("v")), { url: "https://example.com", intent: tooLong }), /at most 248 characters/);
  });
  it("async scan tools forward to their upstream names", async () => {
    const c: Captured = {};
    await asyncScanRemote(fake(c, jsonResult('{"task_id":"t-9"}')), { url: "https://example.com" });
    assert.equal(sentName(c), "url_scanner_async_scan");
    const c2: Captured = {};
    await asyncScanWithIntentRemote(fake(c2, jsonResult('{"task_id":"t-9"}')), { url: "https://example.com", intent: "read docs" });
    assert.equal(sentName(c2), "url_scanner_async_scan_with_intent");
    assert.deepEqual(sentArgs(c2), { url: "https://example.com", intent: "read docs" });
  });
  it("status and result forward task_id to their upstream tools", async () => {
    const c: Captured = {};
    await asyncTaskStatusRemote(fake(c, jsonResult("working")), { task_id: " t-9 " });
    assert.equal(sentName(c), "url_scanner_async_task_status");
    assert.deepEqual(sentArgs(c), { task_id: "t-9" });
    const c2: Captured = {};
    await asyncTaskResultRemote(fake(c2, jsonResult("done")), { task_id: "t-9" });
    assert.equal(sentName(c2), "url_scanner_async_task_result");
    assert.deepEqual(sentArgs(c2), { task_id: "t-9" });
    await assert.rejects(() => asyncTaskStatusRemote(fake({}, jsonResult("x")), { task_id: "" }), /non-empty/);
    await assert.rejects(() => asyncTaskResultRemote(fake({}, jsonResult("x")), { task_id: " " }), /non-empty/);
  });
});
