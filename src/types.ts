/**
 * linkguard types.
 *
 * The six tools mirror the documented hosted URL scanner surface:
 * synchronous scans (with or without intent context), asynchronous
 * scans that return a task_id, and the two polling tools that check
 * a task's status and fetch its result. Every operation is forwarded
 * to the hosted remote MCP endpoint; HTTP access is described by a
 * minimal response surface so tests can inject a fake fetch.
 */

export interface ScanOptions {
  url: string;
}

export interface ScanWithIntentOptions {
  url: string;
  intent?: string;
}

export interface TaskOptions {
  task_id: string;
}

export interface RemoteResult {
  /** The result text exactly as the upstream remote server returns it. */
  text: string;
}

export interface RemoteConfig {
  /** Hosted endpoint override; defaults to the documented endpoint. */
  endpoint?: string;
  /** Optional API key, sent as the X-API-Key header when present. */
  apiKey?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
