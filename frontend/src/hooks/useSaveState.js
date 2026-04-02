import { useState, useRef, useCallback } from "react";

export function useSaveState(saveFn, { debounceMs = 0 } = {}) {
  // status: "idle" | "saving" | "saved" | "error"
  const [status, setStatus] = useState("idle");
  const timeoutRef = useRef(null);
  const savedTimerRef = useRef(null);

  const triggerSave = useCallback(
    async (...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

      const doSave = async () => {
        setStatus("saving");
        try {
          await saveFn(...args);
          setStatus("saved");
          // Reset to idle after 2 seconds
          savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
        } catch (err) {
          setStatus("error");
          // Retry once after 2 seconds
          setTimeout(async () => {
            try {
              await saveFn(...args);
              setStatus("saved");
              savedTimerRef.current = setTimeout(
                () => setStatus("idle"),
                2000
              );
            } catch {
              setStatus("error");
            }
          }, 2000);
        }
      };

      if (debounceMs > 0) {
        timeoutRef.current = setTimeout(doSave, debounceMs);
      } else {
        await doSave();
      }
    },
    [saveFn, debounceMs]
  );

  return { triggerSave, status };
}
