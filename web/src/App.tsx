import { useEffect, useRef, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean | undefined>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action: demo-<action> on
// success, demo-action-failed on failure. No-op when the agent isn't present
// (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", props: TrackProps) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

// Properties sent with each action's success event. prev is the state that was
// on screen just before the response was applied; next is the server response.
// The counter is global and shared by every client, so next can also reflect
// other users' actions (e.g. counter !== previousCounter + 1 after an increment).
const successProps: Record<Action, (prev: AppState, next: AppState) => TrackProps> = {
  load: (_prev, next) => ({ counter: next.counter, lastAction: next.lastAction }),
  increment: (prev, next) => ({ counter: next.counter, previousCounter: prev.counter }),
  decrement: (prev, next) => ({ counter: next.counter, previousCounter: prev.counter }),
  // A reset always returns { counter: 0, lastAction: "reset" }, so report what it cleared.
  reset: (prev) => ({ previousCounter: prev.counter, previousLastAction: prev.lastAction }),
  refresh: (prev, next) => ({
    counter: next.counter,
    lastAction: next.lastAction,
    previousCounter: prev.counter,
    counterChanged: next.counter !== prev.counter,
  }),
};

// Properties for demo-action-failed. One event covers every action, so each
// action's failure rate can be compared with its demo-<action> success event.
// Fields that are unknown for a failure (e.g. httpStatus when the request never
// got an HTTP response) are left undefined and so are not sent.
function failureProps(action: Action, e: unknown): TrackProps {
  const apiError = e instanceof ApiError ? e : undefined;
  return {
    action,
    // Truncated to stay well within Pendo's 512-byte limit for event properties.
    errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 200),
    // Sent as a string because status codes are categories to group by, not quantities.
    httpStatus: apiError?.status?.toString(),
    method: apiError?.method,
    path: apiError?.path,
  };
}

// The mount-time load runs once per page load. Without this flag, StrictMode's
// development-only double-invoked effect fires demo-load (or a failure) twice.
let initialLoadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);
  // Most recently applied state. Read when a response arrives rather than when
  // its request started, so overlapping requests each report an accurate prev.
  const latestState = useRef(state);

  const run = async (action: Action, fn: () => Promise<AppState>) => {
    try {
      setError(null);
      const next = await fn();
      const prev = latestState.current;
      latestState.current = next;
      setState(next);
      trackEvent(action, successProps[action](prev, next));
    } catch (e) {
      setError((e as Error).message);
      trackEvent("action-failed", failureProps(action, e));
    }
  };

  useEffect(() => {
    if (initialLoadStarted) return;
    initialLoadStarted = true;
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
