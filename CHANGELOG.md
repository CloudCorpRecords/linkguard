# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `linkguard scan <url>`, `linkguard scan-intent <url>`,
  `linkguard async-scan <url>`, `linkguard async-scan-intent <url>`,
  `linkguard status <task_id>`, and `linkguard result <task_id>`.
- MCP server (`linkguard mcp`, stdio) with six tools matching the
  documented PreClick surface: `url_scanner_scan`,
  `url_scanner_scan_with_intent`, `url_scanner_async_scan`,
  `url_scanner_async_scan_with_intent`, `url_scanner_async_task_status`,
  and `url_scanner_async_task_result`.
- Implementation forwards each call as JSON-RPC `tools/call` to the
  hosted endpoint `https://preclick.ai/mcp` (overridable with
  `LINKGUARD_ENDPOINT`), handling plain JSON and text/event-stream
  (SSE) responses. The scanning engine itself stays upstream.
- `PRECLICK_API_KEY` is optional: sent as the `X-API-Key` header when
  set; the keyless trial tier is used when it is absent.
- Intent text is limited to 248 characters, enforced locally before
  any request is made.
- All HTTP goes through an injectable fetch function, so tests run on
  fixtures with no network access.
