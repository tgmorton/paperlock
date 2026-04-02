import { Highlighter, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#FFEB3B" },
  { label: "Green", value: "#81C784" },
  { label: "Blue", value: "#64B5F6" },
  { label: "Pink", value: "#F48FB1" },
];

export default function AnnotationTools({
  mode,
  onModeChange,
  highlightColor,
  onColorChange,
}) {
  return (
    <div className="annotation-toolbar">
      {/* Highlight toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onModeChange(mode === "highlight" ? "off" : "highlight")}
        className={`annotation-tool-btn ${mode === "highlight" ? "annotation-tool-active" : ""}`}
        title="Highlight"
      >
        <Highlighter className="size-4" />
      </Button>

      {/* Color picker — visible when highlight mode is ON */}
      {mode === "highlight" && (
        <div className="annotation-color-picker">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`annotation-color-dot ${highlightColor === c.value ? "active" : ""}`}
              style={{ backgroundColor: c.value }}
              onClick={() => onColorChange(c.value)}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* Separator between highlight and note */}
      <div className="annotation-toolbar-sep" />

      {/* Note toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onModeChange(mode === "note" ? "off" : "note")}
        className={`annotation-tool-btn ${mode === "note" ? "annotation-tool-active" : ""}`}
        title="Add note"
      >
        <StickyNote className="size-4" />
      </Button>

      {/* Close / deactivate */}
      {mode !== "off" && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onModeChange("off")}
          className="annotation-tool-btn"
          title="Cancel"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
