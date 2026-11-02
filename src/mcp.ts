/**
 * linkguard MCP server. Tools: url_scanner_scan,
 * url_scanner_scan_with_intent, url_scanner_async_scan,
 * url_scanner_async_scan_with_intent, url_scanner_async_task_status,
 * url_scanner_async_task_result.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call arguments. Every call is forwarded
 * to the hosted PreClick remote MCP endpoint; see remote.ts.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  asyncScanRemote,
  asyncScanWithIntentRemote,
  asyncTaskResultRemote,
  asyncTaskStatusRemote,
  configFromEnv,
  MAX_INTENT_LENGTH,
  scanRemote,
  scanWithIntentRemote,
  VERSION,
} from "./remote.js";
import type { FetchFn } from "./types.js";

const UrlArgs = z.object({ url: z.string() });
const IntentArgs = z.object({
  url: z.string(),
  intent: z.string().max(MAX_INTENT_LENGTH).optional(),
});
const TaskArgs = z.object({ task_id: z.string() });

const TOOLS = [
  {
    name: "url_scanner_scan",
    description:
      "Scan a URL for security threats and return the upstream verdict, including risk and access guidance. Runs synchronously.",
    inputSchema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "URL to scan." } },
      required: ["url"],
    },
  },
  {
    name: "url_scanner_scan_with_intent",
    description:
      "Scan a URL for security threats together with the visitor's stated intent, so the verdict can judge whether the page matches that intent. Runs synchronously. Intent is limited to 248 characters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to scan." },
        intent: { type: "string", description: "Visitor's stated intent for visiting the URL, limited to 248 characters." },
      },
      required: ["url"],
    },
  },
  {
    name: "url_scanner_async_scan",
    description:
      "Submit a URL for asynchronous security scanning. Returns immediately with a task_id; check it with url_scanner_async_task_status and fetch the outcome with url_scanner_async_task_result.",
    inputSchema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "URL to scan." } },
      required: ["url"],
    },
  },
  {
    name: "url_scanner_async_scan_with_intent",
    description:
      "Submit a URL plus optional intent context for asynchronous security scanning. Returns immediately with a task_id; poll url_scanner_async_task_status, then read url_scanner_async_task_result. Intent is limited to 248 characters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to scan." },
        intent: { type: "string", description: "Visitor's stated intent for visiting the URL, limited to 248 characters." },
      },
      required: ["url"],
    },
  },
  {
    name: "url_scanner_async_task_status",
    description:
      "Check the status of an asynchronous scan task without blocking, using the task_id returned when the scan was submitted.",
    inputSchema: {
      type: "object" as const,
      properties: { task_id: { type: "string", description: "Task ID returned when the asynchronous scan was submitted." } },
      required: ["task_id"],
    },
  },
  {
    name: "url_scanner_async_task_result",
    description:
      "Retrieve the result of an asynchronous scan task by its task_id. If the task is still running, the upstream status is returned instead.",
    inputSchema: {
      type: "object" as const,
      properties: { task_id: { type: "string", description: "Task ID returned when the asynchronous scan was submitted." } },
      required: ["task_id"],
    },
  },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}
function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

const server = new Server({ name: "linkguard", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = configFromEnv();
  try {
    if (name === "url_scanner_scan") {
      const parsed = UrlArgs.parse(args ?? {});
      return textResult((await scanRemote(fetchFn, parsed, config)).text);
    }
    if (name === "url_scanner_scan_with_intent") {
      const parsed = IntentArgs.parse(args ?? {});
      return textResult((await scanWithIntentRemote(fetchFn, parsed, config)).text);
    }
    if (name === "url_scanner_async_scan") {
      const parsed = UrlArgs.parse(args ?? {});
      return textResult((await asyncScanRemote(fetchFn, parsed, config)).text);
    }
    if (name === "url_scanner_async_scan_with_intent") {
      const parsed = IntentArgs.parse(args ?? {});
      return textResult((await asyncScanWithIntentRemote(fetchFn, parsed, config)).text);
    }
    if (name === "url_scanner_async_task_status") {
      const parsed = TaskArgs.parse(args ?? {});
      return textResult((await asyncTaskStatusRemote(fetchFn, parsed, config)).text);
    }
    if (name === "url_scanner_async_task_result") {
      const parsed = TaskArgs.parse(args ?? {});
      return textResult((await asyncTaskResultRemote(fetchFn, parsed, config)).text);
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
