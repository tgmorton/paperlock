import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Maximize2,
  Minimize2,
  Check,
  ChevronLeft,
  ChevronRight,
  Send,
  MousePointerClick,
} from "lucide-react";

export default function QuestionPanel({
  questions,
  answers,
  blocks,
  activeQuestionId,
  onQuestionSelect,
  onFreeTextChange,
  onSubmit,
  isSubmitted,
  mode,
  onModeToggle,
}) {
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const textareaRef = useRef(null);

  // Auto-focus textarea when a free_text question becomes active
  useEffect(() => {
    if (activeQuestionId) {
      const q = questions.find((q) => q.id === activeQuestionId);
      if (q?.question_type === "free_text" && textareaRef.current) {
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    }
  }, [activeQuestionId, questions]);

  // Get preview text for selected blocks
  const getSelectedPreview = (blockIds) => {
    if (!blockIds || blockIds.length === 0 || !blocks) return null;
    const selectedBlocks = blocks
      .filter((b) => blockIds.includes(b.id))
      .sort((a, b) => {
        if (a.page_number !== b.page_number) return a.page_number - b.page_number;
        return (a.block_order ?? 0) - (b.block_order ?? 0);
      });
    const text = selectedBlocks.map((b) => b.text).join(" ");
    if (text.length > 120) return text.slice(0, 120) + "...";
    return text;
  };

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    return q.question_type === "free_text"
      ? !!a?.free_text
      : a?.selected_block_ids?.length > 0;
  }).length;

  const handleSubmitClick = () => {
    setSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    await onSubmit();
    setSubmitting(false);
    setSubmitDialogOpen(false);
  };

  // Focus / floating mode — single question card
  if (mode === "focus" && activeQuestionId) {
    const q = questions.find((q) => q.id === activeQuestionId);
    const qIndex = questions.findIndex((q) => q.id === activeQuestionId);
    const hasPrev = qIndex > 0;
    const hasNext = qIndex < questions.length - 1;
    const answer = answers[q.id];
    const preview = getSelectedPreview(answer?.selected_block_ids);

    return (
      <div className="question-floating-card">
        <div className="question-floating-header">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => hasPrev && onQuestionSelect(questions[qIndex - 1].id)}
              disabled={!hasPrev}
              title="Previous question"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Badge variant="secondary" className="font-semibold text-xs">
              Q{q.order + 1} / {questions.length}
            </Badge>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => hasNext && onQuestionSelect(questions[qIndex + 1].id)}
              disabled={!hasNext}
              title="Next question"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onModeToggle}
            className="gap-1.5 text-xs"
          >
            <Maximize2 className="size-3" />
            Expand
          </Button>
        </div>
        <p className="question-prompt">{q.prompt}</p>
        {q.question_type === "free_text" ? (
          <Textarea
            ref={textareaRef}
            value={answer?.free_text || ""}
            onChange={(e) => onFreeTextChange(q.id, e.target.value)}
            placeholder="Type your answer..."
            disabled={isSubmitted}
            className="mt-3 text-sm"
          />
        ) : (
          <div className="mt-3">
            <div className="selected-indicator">
              {answer?.selected_block_ids?.length ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-green-600" />
                  {answer.selected_block_ids.length} region(s) selected
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <MousePointerClick className="size-3.5" />
                  Select a text region on the PDF
                </span>
              )}
            </div>
            {preview && (
              <div className="selected-preview">
                "{preview}"
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Persistent sidebar mode
  return (
    <>
      <div className={`question-panel ${mode === "persistent" ? "panel-enter" : "panel-exit"}`}>
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h3>Questions</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {answeredCount}/{questions.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onModeToggle}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <Minimize2 className="size-3" />
            Collapse
          </Button>
        </div>
        <div className="question-list">
          {questions.map((q) => {
            const answer = answers[q.id];
            const isActive = activeQuestionId === q.id;
            const isAnswered =
              q.question_type === "free_text"
                ? !!answer?.free_text
                : answer?.selected_block_ids?.length > 0;
            const preview = getSelectedPreview(answer?.selected_block_ids);

            return (
              <div
                key={q.id}
                className={`question-item ${isActive ? "active" : ""} ${
                  isAnswered ? "answered" : ""
                }`}
                onClick={() => onQuestionSelect(q.id)}
              >
                <div className="question-header">
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className="text-xs font-semibold"
                  >
                    Q{q.order + 1}
                  </Badge>
                  <span className="question-points">
                    {q.points} pt{q.points !== 1 ? "s" : ""}
                  </span>
                  {isAnswered && (
                    <span className="check-mark">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                <p className="question-prompt">{q.prompt}</p>

                {isActive && q.question_type === "free_text" && (
                  <Textarea
                    ref={textareaRef}
                    value={answer?.free_text || ""}
                    onChange={(e) => onFreeTextChange(q.id, e.target.value)}
                    placeholder="Type your answer..."
                    disabled={isSubmitted}
                    className="mt-3 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                {isActive && q.question_type === "region_select" && (
                  <div className="mt-2">
                    <div className="selected-indicator">
                      {answer?.selected_block_ids?.length ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="size-3.5 text-green-600" />
                          {answer.selected_block_ids.length} region(s) selected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <MousePointerClick className="size-3.5" />
                          Select a text region on the PDF
                        </span>
                      )}
                    </div>
                    {preview && (
                      <div className="selected-preview">
                        "{preview}"
                      </div>
                    )}
                  </div>
                )}

                {!isActive &&
                  q.question_type === "region_select" &&
                  preview && (
                    <div className="selected-preview compact">
                      "{preview}"
                    </div>
                  )}
              </div>
            );
          })}
        </div>

        <div className="panel-footer">
          {!isSubmitted && (
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleSubmitClick}
            >
              <Send className="size-4" />
              Submit Assignment
            </Button>
          )}
          {isSubmitted && (
            <div className="submitted-badge">
              <Check className="size-4 inline mr-1.5" />
              Submitted
            </div>
          )}
          <button
            className="back-to-assignments"
            onClick={() => navigate("/dashboard")}
          >
            <ChevronLeft className="size-3.5" />
            Back to assignments
          </button>
        </div>
      </div>

      {/* Submit confirmation dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit assignment?</DialogTitle>
            <DialogDescription>
              You have answered {answeredCount} of {questions.length} questions.
              Once submitted, you will not be able to change your answers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Confirm Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
