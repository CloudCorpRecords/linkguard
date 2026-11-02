# BUILD-REPORT — linkguard (original: cybrlab-ai/preclick-mcp)

Built 2026-10-26 for the MCP Rebuild 100 program (Tranche Batch 3).
Local only; nothing pushed or published.

## Identity

- Original: `cybrlab-ai/preclick-mcp` (rank 116, 6 stars) — a HOSTED
  remote MCP at `https://preclick.ai/mcp` (streamable HTTP, optional
  `X-API-Key` header, keyless trial tier)
- npm: `@reneturcios/linkguard`, bin `linkguard`, version 0.1.0
- Registry name: `io.github.CloudCorpRecords/linkguard`
  (matches package.json `mcpName`, server.json `name`, and the
  Dockerfile `io.modelcontextprotocol.server.name` label)
- server.json description: 68 chars (≤100, counted)
- server.json OCI package entry: no `version` field (version only in
  the tagged identifier `ghcr.io/cloudcorprecords/linkguard:0.1.0`)
- Files: 19/19 per TEMPLATE.md checklist (verified from disk)

## Design (program precedent for proprietary remote servers)

Per the repowiki / libdocs-remote / codehost-remote precedent,
linkguard does NOT reproduce the upstream scanning engine. It is a
compatible local stdio client: each tool call is forwarded as one
JSON-RPC 2.0 `tools/call` POST to the hosted endpoint and the
upstream result is returned. Responses are handled in both shapes:
plain JSON, and `text/event-stream` (SSE) bodies whose `data:`
lines carry JSON-RPC payloads.

- Endpoint: `LINKGUARD_ENDPOINT` env override, default
  `https://preclick.ai/mcp`
- Auth: `PRECLICK_API_KEY` env — when set, sent as the `X-API-Key`
  header; when absent, no header is sent (keyless trial tier)
- Accept header: `application/json, text/event-stream`
- Async flow: the async scan tools submit upstream and return its
  `task_id`; the status/result tools forward that same `task_id`
  (the value upstream identifies as its taskId) to the matching
  upstream polling tools. Forwarding is 1:1 by tool name.
- Intent: optional on both `_with_intent` tools; capped at 248
  characters, enforced locally (zod `.max(248)` at the MCP layer
  and a length check in the core) before any request is made.
- All HTTP behind an injectable `FetchFn`; registered via the
  low-level MCP `Server` API with explicit inputSchema literals.

## Tools (6/6, full documented set)

| Tool | Required | Optional |
| --- | --- | --- |
| `url_scanner_scan` | `url` | — |
| `url_scanner_scan_with_intent` | `url` | `intent` (≤248 chars) |
| `url_scanner_async_scan` | `url` | — |
| `url_scanner_async_scan_with_intent` | `url` | `intent` (≤248 chars) |
| `url_scanner_async_task_status` | `task_id` | — |
| `url_scanner_async_task_result` | `task_id` | — |

## Verification (all foreground, verified from disk/output)

- tsc: `./node_modules/.bin/tsc` exit 0; `dist/cli.js` present;
  `node dist/cli.js --version` → `0.1.0`; unknown command prints
  Usage and exits 2
- Tests: 18/18 pass (`tsx --test test/*.test.ts`, fake fetch only —
  plain JSON, SSE, structured-result preservation, JSON-RPC error,
  HTTP 429, connection failure, X-API-Key header on/off, custom
  endpoint, request-body shape, intent 248-passes / 249-rejected,
  task_id forwarding for both polling tools)
- Parity: fixture
  `harness/fixtures/preclick-mcp-tools-original.json`
  (`_source`: docs-derived from the public README, remote-forwarding
  noted, not hand-probed) vs live stdio rebuild via
  `harness/parity.py` → `parity_pct == 100.0`, identical 6/6,
  output in `parity-out/parity.json` (verdict PASS)
- Lockfile: Clean Route 3 — generated in a temp copy with no
  `node_modules` present via offline
  `npm install --package-lock-only --ignore-scripts` (exit 0);
  verified parses, name `@reneturcios/linkguard`, 128 package
  entries; only the lockfile was copied back. Local build/test used
  a sibling build's `node_modules`.

## Honest gaps

- Hosted dependency: linkguard is only a client. Scanning quality,
  verdicts, availability, rate limits, and the trial tier's terms
  are entirely the upstream service's; if `preclick.ai` is down or
  changes, this client inherits that.
- No live call to `https://preclick.ai/mcp` was made or claimed;
  wire behaviour (plain JSON + SSE framing, header shape) is proven
  against fake-fetch fixtures only, so upstream response-shape drift
  is unverified until a publish-wave live smoke.
- The fixture is docs-derived from the public README, not
  hand-probed against the live hosted server; if the live tool
  surface differs from the documented one, parity is against the
  documentation.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run (belongs
  to the publish wave).
