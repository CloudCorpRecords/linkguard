# linkguard

linkguard is a local stdio front end for a hosted URL safety
scanner. Before an agent follows a link, linkguard can ask the
hosted service to examine the URL — synchronously for an immediate
verdict, or asynchronously when a scan may take a while — and, when
you say why you are visiting, whether the page actually matches
that intent.

linkguard does not scan anything itself. Each tool call is
forwarded as a JSON-RPC `tools/call` POST to the hosted PreClick
remote MCP endpoint at `https://preclick.ai/mcp`, and the
upstream answer is returned as-is in substance. Both plain JSON
answers and `text/event-stream` (SSE) answers are understood.
Scanning quality, availability, and rate limits are the hosted
service's.

`PRECLICK_API_KEY` is optional. When it is set, it is sent as the
`X-API-Key` header documented for the hosted endpoint; when it is
absent, no such header is sent and the keyless trial tier applies.
`LINKGUARD_ENDPOINT` overrides the endpoint URL when set.

Intent text is capped at 248 characters by the upstream service;
linkguard enforces that limit locally before sending anything.

## Install

```bash
npx @reneturcios/linkguard scan https://example.com
docker run -i ghcr.io/cloudcorprecords/linkguard
```

## CLI

```bash
linkguard scan https://example.com
linkguard scan-intent https://example.com --intent "pay an invoice"
linkguard async-scan https://example.com
linkguard async-scan-intent https://example.com --intent "read the docs"
linkguard status <task_id>
linkguard result <task_id>
linkguard --version
```

The async commands return a `task_id` immediately. Poll it with
`status`, then fetch the finished scan with `result`.

Exit codes: `0` success, `1` upstream or validation error, `2` usage error.

## MCP server

```bash
npx -y @reneturcios/linkguard mcp
```

```json
{
  "mcpServers": {
    "linkguard": {
      "command": "npx",
      "args": ["-y", "@reneturcios/linkguard", "mcp"],
      "env": { "PRECLICK_API_KEY": "your-key-if-you-have-one" }
    }
  }
}
```

The `env` block is optional.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `url_scanner_scan` | `url` (string, required) | The upstream scan verdict for the URL, synchronously. |
| `url_scanner_scan_with_intent` | `url` (string, required), `intent` (string, optional, max 248 chars) | The upstream verdict judged against the stated intent. |
| `url_scanner_async_scan` | `url` (string, required) | A `task_id` for the submitted scan, immediately. |
| `url_scanner_async_scan_with_intent` | `url` (string, required), `intent` (string, optional, max 248 chars) | A `task_id` for the submitted intent-aware scan. |
| `url_scanner_async_task_status` | `task_id` (string, required) | The current status of the asynchronous task. |
| `url_scanner_async_task_result` | `task_id` (string, required) | The finished scan result, or the task status while it runs. |

Upstream failures — HTTP errors, JSON-RPC errors, unreachable
hosts — are reported as tool errors with the underlying message.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Tests run entirely on fake-fetch fixtures, including plain-JSON
and SSE upstream bodies; no network is used and no live call to
the hosted endpoint is made.

## License

MIT — see `LICENSE`.
