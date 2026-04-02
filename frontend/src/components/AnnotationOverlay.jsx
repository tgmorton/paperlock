import { useState, useRef, useEffect } from "react";
import { StickyNote, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function AnnotationOverlay({
  annotations,
  pageIndex,
  pageDimensions,
  onDeleteAnnotation,
  onNoteClick,
  activeNoteId,
  onNoteUpdate,
  disabled, // when true, all annotations are non-interactive (e.g. answering a question)
}) {
  if (!pageDimensions || !annotations) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: pageDimensions.width,
        height: pageDimensions.height,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {annotations.map((ann) =>
        ann.annotation_type === "highlight" ? (
          <HighlightAnnotation
            key={ann.id}
            annotation={ann}
            onDelete={onDeleteAnnotation}
            disabled={disabled}
          />
        ) : (
          <NoteAnnotation
            key={ann.id}
            annotation={ann}
            isActive={activeNoteId === ann.id}
            onClick={onNoteClick}
            onDelete={onDeleteAnnotation}
            onUpdate={onNoteUpdate}
            disabled={disabled}
          />
        )
      )}
    </div>
  );
}

function HighlightAnnotation({ annotation, onDelete, disabled }) {
  const [hovered, setHovered] = useState(false);
  const pos = annotation.position_data;

  return (
    <div
      className="annotation-highlight"
      style={{
        position: "absolute",
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: `${pos.width}%`,
        height: `${pos.height}%`,
        backgroundColor: annotation.color || "#FFEB3B",
        opacity: 0.35,
        borderRadius: 3,
        pointerEvents: disabled ? "none" : "auto",
        cursor: "default",
        transition: "opacity 0.15s ease",
        ...(hovered ? { opacity: 0.5 } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && !disabled && (
        <button
          className="annotation-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(annotation.id);
          }}
          title="Remove highlight"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function NoteAnnotation({ annotation, isActive, onClick, onDelete, onUpdate, disabled }) {
  const pos = annotation.position_data;
  const [content, setContent] = useState(annotation.content || "");
  const textareaRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Sync content from props when annotation changes
  useEffect(() => {
    setContent(annotation.content || "");
  }, [annotation.content]);

  // Focus textarea when becoming active
  useEffect(() => {
    if (isActive && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isActive]);

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);

    // Debounced save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onUpdate(annotation.id, newContent);
    }, 500);
  };

  return (
    <>
      {/* Note icon marker */}
      <div
        className={`annotation-note-marker ${isActive ? "active" : ""}`}
        style={{
          position: "absolute",
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          pointerEvents: disabled ? "none" : "auto",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(isActive ? null : annotation.id);
        }}
      >
        <StickyNote className="size-4" />
      </div>

      {/* Expanded note card */}
      {isActive && (
        <div
          className="annotation-note-card"
          style={{
            position: "absolute",
            left: `${pos.x}%`,
            top: `calc(${pos.y}% + 28px)`,
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="annotation-note-card-header">
            <span className="annotation-note-card-title">Note</span>
            <div className="annotation-note-card-actions">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDelete(annotation.id)}
                className="annotation-note-delete"
                title="Delete note"
              >
                <Trash2 className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onClick(null)}
                title="Close"
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder="Write a note..."
            className="annotation-note-textarea"
            rows={3}
          />
        </div>
      )}
    </>
  );
}
