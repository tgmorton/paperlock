import { Check, Loader2, AlertCircle } from "lucide-react";

export default function SaveIndicator({ status }) {
  if (status === "idle") return null;

  return (
    <div
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
      style={{
        backgroundColor:
          status === "saving"
            ? "rgba(255,255,255,0.1)"
            : status === "saved"
              ? "rgba(34,197,94,0.15)"
              : "rgba(239,68,68,0.15)",
      }}
    >
      {status === "saving" && (
        <>
          <Loader2 className="size-3 animate-spin text-white/70" />
          <span className="text-white/70">Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3 text-green-400" />
          <span className="text-green-400">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="size-3 text-red-400" />
          <span className="text-red-400">Save failed</span>
        </>
      )}
    </div>
  );
}
