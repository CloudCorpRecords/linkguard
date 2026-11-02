#!/usr/bin/env node
/**
 * linkguard CLI.
 *   linkguard scan <url>
 *   linkguard scan-intent <url> [--intent text]
 *   linkguard async-scan <url>
 *   linkguard async-scan-intent <url> [--intent text]
 *   linkguard status <task_id>
 *   linkguard result <task_id>
 *   linkguard mcp
 * PRECLICK_API_KEY is optional (sent as X-API-Key when set);
 * LINKGUARD_ENDPOINT overrides the hosted endpoint.
 * Exit codes: 0 success, 1 error, 2 usage.
 */
import {
  asyncScanRemote,
  asyncScanWithIntentRemote,
  asyncTaskResultRemote,
  asyncTaskStatusRemote,
  configFromEnv,
  scanRemote,
  scanWithIntentRemote,
  VERSION,
} from "./remote.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  linkguard scan <url>
  linkguard scan-intent <url> [--intent text]
  linkguard async-scan <url>
  linkguard async-scan-intent <url> [--intent text]
  linkguard status <task_id>
  linkguard result <task_id>
  linkguard mcp
  linkguard --version`);
  process.exit(2);
}
function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx < 0 || idx + 1 >= args.length ? undefined : args[idx + 1];
}
function withoutFlags(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = configFromEnv();
  try {
    if (cmd === "scan") {
      const [url] = rest;
      if (!url) usage();
      console.log((await scanRemote(fetchFn, { url }, config)).text);
    } else if (cmd === "scan-intent") {
      const [url] = withoutFlags(rest, ["--intent"]);
      if (!url) usage();
      console.log((await scanWithIntentRemote(fetchFn, { url, intent: flagValue(rest, "--intent") }, config)).text);
    } else if (cmd === "async-scan") {
      const [url] = rest;
      if (!url) usage();
      console.log((await asyncScanRemote(fetchFn, { url }, config)).text);
    } else if (cmd === "async-scan-intent") {
      const [url] = withoutFlags(rest, ["--intent"]);
      if (!url) usage();
      console.log((await asyncScanWithIntentRemote(fetchFn, { url, intent: flagValue(rest, "--intent") }, config)).text);
    } else if (cmd === "status") {
      const [taskId] = rest;
      if (!taskId) usage();
      console.log((await asyncTaskStatusRemote(fetchFn, { task_id: taskId }, config)).text);
    } else if (cmd === "result") {
      const [taskId] = rest;
      if (!taskId) usage();
      console.log((await asyncTaskResultRemote(fetchFn, { task_id: taskId }, config)).text);
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
