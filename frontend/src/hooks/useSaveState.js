import { useState, useRef, useCallback } from "react";

export function useSaveState(saveFn, { debounceMs = 0 } = {}) {
  // status: "idle" | "saving" | "saved" | "error"
  const [status, setStatus] = useState("idle");
  const debounceRef = useRef(null);
  const retryRef = useRef(null);
  const savedTimerRef = useRef(null);
  const pendingArgsRef = useRef(null); // latest payload not yet confirmed saved
  const inFlightRef = useRef(null); // Promise of the save currently running

  // Run the save exactly once. Resolves on success, REJECTS on failure (so
  // flush() callers can react). Does not retry — that's runWithRetry's job.
  const runOnce = useCallback(
    async (args) => {
      // Coalesce with an in-flight save of the same payload.
      if (inFlightRef.current) {
        try {
          await inFlightRef.current;
        } catch {
          /* fall through and try again below */
        }
        if (pendingArgsRef.current === null) return; // a prior save covered it
      }
      setStatus("saving");
      const p = Promise.resolve(saveFn(...args));
      inFlightRef.current = p;
      try {
        await p;
        if (pendingArgsRef.current === args) pendingArgsRef.current = null;
        setStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
      } catch (err) {
        setStatus("error");
        throw err;
      } finally {
        if (inFlightRef.current === p) inFlightRef.current = null;
      }
    },
    [saveFn]
  );

  // Save with a single tracked, cancellable retry. Never throws (fire-and-forget
  // path used by triggerSave) — a newer triggerSave cancels a pending retry so a
  // stale retry can't overwrite a newer answer.
  const runWithRetry = useCallback(
    async (args) => {
      try {
        await runOnce(args);
      } catch {
        retryRef.current = setTimeout(() => {
          retryRef.current = null;
          runOnce(args).catch(() => {}); // stays in "error" if it fails again
        }, 2000);
      }
    },
    [runOnce]
  );

  const triggerSave = useCallback(
    async (...args) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      pendingArgsRef.current = args;

      if (debounceMs > 0) {
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          runWithRetry(args);
        }, debounceMs);
      } else {
        await runWithRetry(args);
      }
    },
    [debounceMs, runWithRetry]
  );

  // Force any pending (debounced/in-flight) save to settle. REJECTS if the save
  // fails, so callers (e.g. submit) can abort instead of locking unsaved data.
  const flush = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    if (inFlightRef.current) {
      await inFlightRef.current; // throws if the in-flight save fails
    }
    if (pendingArgsRef.current) {
      await runOnce(pendingArgsRef.current); // throws on failure
    }
  }, [runOnce]);

  return { triggerSave, flush, status };
}
