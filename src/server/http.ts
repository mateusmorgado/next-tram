/**
 * The small slice of Vercel's Node request/response objects the API functions use.
 * Declared here (instead of importing @vercel/node) so tests can pass plain fakes.
 */
export type Headers = Record<string, string | string[] | undefined>;

export interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Headers;
  /** Vercel parses JSON bodies; plain text stays a string. */
  body?: unknown;
}

export interface ApiResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
  end(): unknown;
}
