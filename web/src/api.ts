// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

type Method = "GET" | "POST";

// Thrown when an API request fails. Carries the request details as fields (not
// just in the message) so callers can report them as structured data. status
// is undefined when no HTTP response was received (network or CORS failure).
export class ApiError extends Error {
  readonly method: Method;
  readonly path: string;
  readonly status?: number;

  constructor(message: string, method: Method, path: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

async function call(path: string, method: Method): Promise<AppState> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method });
  } catch (e) {
    // fetch rejects on network/CORS errors; keep its message for the UI.
    throw new ApiError((e as Error).message, method, path);
  }
  if (!res.ok) throw new ApiError(`${method} ${path} failed: ${res.status}`, method, path, res.status);
  return res.json() as Promise<AppState>;
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};
