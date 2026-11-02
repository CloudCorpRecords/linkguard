/**
 * linkguard core: forward URL scanner tool calls to the hosted
 * remote MCP endpoint at https://preclick.ai/mcp.
 *
 * The upstream service is a hosted remote MCP server (streamable
 * HTTP). This module is a compatible client only: each local call
 * becomes one JSON-RPC 2.0 `tools/call` POST to that endpoint, and
 * the upstream result is returned unchanged in substance. The
 * scanning engine itself is not reproduced here.
 *
 * The endpoint may answer with a plain JSON document or with a
 * text/event-stream (SSE) body whose `data:` lines carry JSON-RPC
 * response objects; both shapes are parsed here.
 *
 * PRECLICK_API_KEY is optional: when present it is sent as the
 * X-API-Key header documented for the hosted endpoint; when absent
 * no such header is sent (the keyless trial tier applies) and no
 * error is raised. LINKGUARD_ENDPOINT overrides the endpoint URL.
 *
 * Intent text is capped at 248 characters by the upstream service;
 * that limit is enforced locally before any request is made.
 *
 * All HTTP goes through an injected FetchFn so the wire handling is
 * fully testable offline with fixtures.
 */
import type {
  FetchFn,
  RemoteConfig,
  RemoteResult,
  ScanOptions,
  ScanWithIntentOptions,
  TaskOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const REMOTE_ENDPOINT = "https://preclick.ai/mcp";

export const MAX_INTENT_LENGTH = 248;

export function endpointFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.LINKGUARD_ENDPOINT;
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : REMOTE_ENDPOINT;
}

export function apiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.PRECLICK_API_KEY;
  const key = typeof raw === "string" ? raw.trim() : "";
  return key ? key : undefined;
}

export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): RemoteConfig {
  return { endpoint: endpointFromEnv(env), apiKey: apiKeyFromEnv(env) };
}

export function extractJsonPayloads(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const dataLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");
  const candidates = dataLines.length > 0 ? dataLines : [trimmed];
  const payloads: unknown[] = [];
  for (const candidate of candidates) {
    try {
      payloads.push(JSON.parse(candidate));
    } catch {
      // Non-JSON stream noise (comments, keep-alives) is ignored.
    }
  }
  return payloads;
}

export function resultTextFromPayload(payload: unknown): string {
  if (payload === null || typeof payload !== "object") {
    throw new Error("PreClick remote returned an unexpected response shape");
  }
  const obj = payload as Record<string, unknown>;
  if (obj.error !== undefined && obj.error !== null) {
    const err = obj.error as Record<string, unknown>;
    const message =
      typeof err.message === "string" ? err.message : JSON.stringify(obj.error);
    throw new Error(`PreClick remote error: ${message}`);
  }
  const result = obj.result;
  if (typeof result === "string") return result;
  if (result !== null && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.result === "string") return r.result;
    if (Array.isArray(r.content)) {
      const texts = r.content
        .filter(
          (part): part is Record<string, unknown> =>
            part !== null && typeof part === "object",
        )
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string);
      if (texts.length > 0) return texts.join("\n");
      if (r.content.length > 0) return JSON.stringify(r.content);
      throw new Error("PreClick remote returned an empty content list");
    }
    // Structured results (risk scores, task ids, directives) are
    // preserved verbatim as JSON rather than dropped.
    return JSON.stringify(result);
  }
  throw new Error("PreClick remote returned a response with no readable result");
}

export function parseToolResponse(body: string): string {
  const payloads = extractJsonPayloads(body);
  if (payloads.length === 0) {
    throw new Error("PreClick remote returned an empty or non-JSON response");
  }
  for (let i = payloads.length - 1; i >= 0; i--) {
    const payload = payloads[i] as Record<string, unknown>;
    if (payload && (payload.result !== undefined || payload.error !== undefined)) {
      return resultTextFromPayload(payload);
    }
  }
  return resultTextFromPayload(payloads[payloads.length - 1]);
}

let nextRequestId = 1;

export async function callRemoteTool(
  fetchFn: FetchFn,
  toolName: string,
  args: Record<string, unknown>,
  config: RemoteConfig = {},
): Promise<string> {
  const endpoint =
    typeof config.endpoint === "string" && config.endpoint.trim()
      ? config.endpoint.trim()
      : REMOTE_ENDPOINT;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const key = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  if (key) headers["X-API-Key"] = key;
  const requestBody = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRequestId++,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  let response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
    });
  } catch (err) {
    throw new Error(
      `Failed to reach PreClick remote at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const body = await response.text();
  if (!response.ok) {
    const detail = body.trim().slice(0, 200);
    throw new Error(
      `PreClick remote request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
  return parseToolResponse(body);
}

function checkedUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) throw new Error("url must be a non-empty string");
  return url;
}

function checkedIntent(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("intent must be a string");
  const intent = value.trim();
  if (!intent) return undefined;
  if (intent.length > MAX_INTENT_LENGTH) {
    throw new Error(
      `intent must be at most ${MAX_INTENT_LENGTH} characters (got ${intent.length})`,
    );
  }
  return intent;
}

function checkedTaskId(value: unknown): string {
  const taskId = typeof value === "string" ? value.trim() : "";
  if (!taskId) throw new Error("task_id must be a non-empty string");
  return taskId;
}

function scanArgs(options: ScanWithIntentOptions): Record<string, unknown> {
  const args: Record<string, unknown> = { url: checkedUrl(options.url) };
  const intent = checkedIntent(options.intent);
  if (intent !== undefined) args.intent = intent;
  return args;
}

export async function scanRemote(
  fetchFn: FetchFn,
  options: ScanOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_scan",
    { url: checkedUrl(options.url) },
    config,
  );
  return { text };
}

export async function scanWithIntentRemote(
  fetchFn: FetchFn,
  options: ScanWithIntentOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_scan_with_intent",
    scanArgs(options),
    config,
  );
  return { text };
}

export async function asyncScanRemote(
  fetchFn: FetchFn,
  options: ScanOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_async_scan",
    { url: checkedUrl(options.url) },
    config,
  );
  return { text };
}

export async function asyncScanWithIntentRemote(
  fetchFn: FetchFn,
  options: ScanWithIntentOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_async_scan_with_intent",
    scanArgs(options),
    config,
  );
  return { text };
}

export async function asyncTaskStatusRemote(
  fetchFn: FetchFn,
  options: TaskOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  // The local argument is named task_id; upstream identifies the same
  // value as its taskId. The MCP tool argument is forwarded as-is.
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_async_task_status",
    { task_id: checkedTaskId(options.task_id) },
    config,
  );
  return { text };
}

export async function asyncTaskResultRemote(
  fetchFn: FetchFn,
  options: TaskOptions,
  config: RemoteConfig = {},
): Promise<RemoteResult> {
  const text = await callRemoteTool(
    fetchFn,
    "url_scanner_async_task_result",
    { task_id: checkedTaskId(options.task_id) },
    config,
  );
  return { text };
}
