import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Markdown from "@/components/Markdown";
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
  ChevronDown,
  Send,
  MousePointerClick,
  MapPin,
  FileText,
} from "lucide-react";

const blankCount = (text) => ((text || "").match(/\{\{\d+\}\}/g) || []).length;

export default function QuestionPanel({
  questions,
  answers,
  blocks,
  sections = [],
  activeQuestionId,
  onQuestionSelect,
  onFreeTextChange,
  onOptionChange,
  onPositionalSelect,
  onJumpToPage,
  onSubmit,
  isSubmitted,
  mode,
  onModeToggle,
}) {
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const stop = (e) => e.stopPropagation();

  useEffect(() => {
    if (activeQuestionId) {
      const q = questions.find((q) => q.id === activeQuestionId);
      if (
        (q?.question_type === "free_text" || q?.question_type === "short_answer") &&
        textareaRef.current
      ) {
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    }
  }, [activeQuestionId, questions]);

  const getSelectedPreview = (blockIds) => {
    if (!blockIds || blockIds.length === 0 || !blocks) return null;
    const selectedBlocks = blocks
      .filter((b) => blockIds.includes(b.id))
      .sort((a, b) => {
        if (a.page_number !== b.page_number) return a.page_number - b.page_number;
        return (a.block_order ?? 0) - (b.block_order ?? 0);
      });
    const text = selectedBlocks.map((b) => b.text).join(" ");
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  };

  const isQuestionAnswered = (q) => {
    const a = answers[q.id];
    switch (q.question_type) {
      case "free_text":
      case "short_answer":
        return !!a?.free_text?.trim();
      case "multiple_choice":
      case "scale":
        return a?.selected_options?.length > 0;
      case "region_select":
        return a?.selected_block_ids?.length > 0;
      case "matching": {
        const need = (q.match_left || []).length;
        const got = (a?.selected_options || []).filter((v) => v != null).length;
        return need > 0 && got >= need;
      }
      case "cloze": {
        const need = blankCount(q.cloze_text);
        const got = (a?.selected_options || []).filter((v) => v != null).length;
        return need > 0 && got >= need;
      }
      default:
        return false;
    }
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;

  // --- type-specific editors ---

  const renderOptions = (q, answer) => (
    <div className="mc-options" onClick={stop}>
      {(q.options || []).map((opt, i) => {
        const selected = answer?.selected_options?.includes(i);
        return (
          <label key={i} className={`mc-option ${selected ? "selected" : ""}`}>
            <input
              type={q.allow_multiple ? "checkbox" : "radio"}
              name={`q-${q.id}`}
              checked={!!selected}
              disabled={isSubmitted}
              onChange={() => onOptionChange(q.id, i)}
            />
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );

  const renderMatching = (q, answer) => (
    <div className="match-grid" onClick={stop}>
      {(q.match_left || []).map((left, i) => (
        <div className="match-row" key={i}>
          <span className="match-left">{left}</span>
          <select
            className="match-select"
            disabled={isSubmitted}
            value={answer?.selected_options?.[i] ?? ""}
            onChange={(e) =>
              onPositionalSelect(
                q.id,
                i,
                e.target.value === "" ? null : parseInt(e.target.value)
              )
            }
          >
            <option value="">— choose —</option>
            {(q.match_right || []).map((r, j) => (
              <option key={j} value={j}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );

  const renderCloze = (q, answer) => {
    const text = q.cloze_text || "";
    const bank = q.cloze_bank || [];
    const parts = [];
    const regex = /\{\{(\d+)\}\}/g;
    let last = 0;
    let m;
    let key = 0;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last)
        parts.push(<span key={`t${key++}`}>{text.slice(last, m.index)}</span>);
      const blankIdx = parseInt(m[1]);
      parts.push(
        <select
          key={`b${key++}`}
          className="cloze-select"
          disabled={isSubmitted}
          value={answer?.selected_options?.[blankIdx] ?? ""}
          onChange={(e) =>
            onPositionalSelect(
              q.id,
              blankIdx,
              e.target.value === "" ? null : parseInt(e.target.value)
            )
          }
        >
          <option value="">____</option>
          {bank.map((w, j) => (
            <option key={j} value={j}>
              {w}
            </option>
          ))}
        </select>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length)
      parts.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
    return (
      <div className="cloze-text" onClick={stop}>
        {parts}
      </div>
    );
  };

  const renderScale = (q, answer) => {
    const min = q.scale_min ?? 1;
    const max = q.scale_max ?? 5;
    const cur = answer?.selected_options?.[0];
    const vals = [];
    for (let v = min; v <= max; v++) vals.push(v);
    return (
      <div className="scale-row" onClick={stop}>
        {vals.map((v) => (
          <button
            key={v}
            type="button"
            disabled={isSubmitted}
            className={`scale-btn ${cur === v ? "selected" : ""}`}
            onClick={() => onPositionalSelect(q.id, 0, v)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  };

  const renderRegion = (q, answer) => {
    const preview = getSelectedPreview(answer?.selected_block_ids);
    return (
      <div>
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
        {preview && <div className="selected-preview">"{preview}"</div>}
      </div>
    );
  };

  const renderGuidance = (q) =>
    q.guidance || q.target_page ? (
      <div className="q-guidance" onClick={stop}>
        {q.guidance && (
          <span className="q-guidance-text">
            <MapPin className="size-3.5" /> {q.guidance}
          </span>
        )}
        {q.target_page && onJumpToPage && (
          <button className="q-jump" onClick={() => onJumpToPage(q.target_page)}>
            <FileText className="size-3.5" /> Go to p. {q.target_page}
          </button>
        )}
      </div>
    ) : null;

  // Unified active-question editor
  const renderEditor = (q, answer) => {
    const t = q.question_type;
    let body;
    if (t === "free_text")
      body = (
        <Textarea
          ref={textareaRef}
          value={answer?.free_text || ""}
          onChange={(e) => onFreeTextChange(q.id, e.target.value)}
          placeholder="Type your answer..."
          disabled={isSubmitted}
          className="text-sm"
          onClick={stop}
        />
      );
    else if (t === "short_answer")
      body = (
        <Input
          ref={textareaRef}
          value={answer?.free_text || ""}
          onChange={(e) => onFreeTextChange(q.id, e.target.value)}
          placeholder="Your answer…"
          disabled={isSubmitted}
          onClick={stop}
        />
      );
    else if (t === "multiple_choice") body = renderOptions(q, answer);
    else if (t === "matching") body = renderMatching(q, answer);
    else if (t === "cloze") body = renderCloze(q, answer);
    else if (t === "scale") body = renderScale(q, answer);
    else body = renderRegion(q, answer);
    return (
      <div className="q-editor">
        {renderGuidance(q)}
        {body}
      </div>
    );
  };

  const handleSubmitClick = () => {
    setSubmitError(null);
    setSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit();
      setSubmitDialogOpen(false);
    } catch (err) {
      setSubmitError(err?.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Focus / floating mode (single question card) ---
  const focusOrdered = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const focusIndex = focusOrdered.findIndex((q) => q.id === activeQuestionId);
  if (mode === "focus" && activeQuestionId && focusIndex >= 0) {
    const ordered = focusOrdered;
    const qIndex = focusIndex;
    const q = ordered[qIndex];
    const answer = answers[q.id];
    return (
      <div className="question-floating-card">
        <div className="question-floating-header">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => qIndex > 0 && onQuestionSelect(ordered[qIndex - 1].id)}
              disabled={qIndex <= 0}
              title="Previous question"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Badge variant="secondary" className="font-semibold text-xs">
              {qIndex + 1} / {ordered.length}
            </Badge>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() =>
                qIndex < ordered.length - 1 && onQuestionSelect(ordered[qIndex + 1].id)
              }
              disabled={qIndex >= ordered.length - 1}
              title="Next question"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={onModeToggle} className="gap-1.5 text-xs">
            <Maximize2 className="size-3" />
            Expand
          </Button>
        </div>
        <p className="question-prompt">{q.prompt}</p>
        <div className="mt-3">{renderEditor(q, answer)}</div>
      </div>
    );
  }

  // --- Persistent sidebar mode, grouped by section ---
  const sortedSections = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const bySection = {};
  for (const q of questions) {
    const k = q.section_id ?? "__none__";
    (bySection[k] ||= []).push(q);
  }
  for (const k in bySection)
    bySection[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const knownIds = new Set(sortedSections.map((s) => s.id));
  const groups = [];
  for (const s of sortedSections) {
    if (bySection[s.id]?.length) groups.push({ section: s, qs: bySection[s.id] });
  }
  // Ungrouped = explicit "no section" PLUS any question whose section_id points
  // at a section that isn't in the list (stale/dangling) — never drop it.
  const ungrouped = [...(bySection["__none__"] || [])];
  for (const key in bySection) {
    if (key === "__none__" || knownIds.has(Number(key))) continue;
    ungrouped.push(...bySection[key]);
  }
  ungrouped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (ungrouped.length) groups.push({ section: null, qs: ungrouped });

  const toggleSection = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderQuestionItem = (q, num) => {
    const answer = answers[q.id];
    const isActive = activeQuestionId === q.id;
    const isAnswered = isQuestionAnswered(q);
    const preview = getSelectedPreview(answer?.selected_block_ids);
    return (
      <div
        key={q.id}
        role="button"
        tabIndex={0}
        className={`question-item ${isActive ? "active" : ""} ${isAnswered ? "answered" : ""}`}
        onClick={() => onQuestionSelect(q.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onQuestionSelect(q.id);
          }
        }}
      >
        <div className="question-header">
          <Badge variant={isActive ? "default" : "secondary"} className="text-xs font-semibold">
            {num}
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
        {isActive && renderEditor(q, answer)}
        {!isActive && q.question_type === "region_select" && preview && (
          <div className="selected-preview compact">"{preview}"</div>
        )}
      </div>
    );
  };

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
          {groups.map(({ section, qs }) => {
            const answeredInSection = qs.filter(isQuestionAnswered).length;
            const isCollapsed = section && collapsed.has(section.id);
            return (
              <div key={section ? section.id : "__none__"} className="q-section">
                {section && (
                  <button
                    className="q-section-header"
                    onClick={() => toggleSection(section.id)}
                  >
                    <ChevronDown
                      className={`size-4 q-section-chev ${isCollapsed ? "collapsed" : ""}`}
                    />
                    <span className="q-section-title">{section.title}</span>
                    <span className="q-section-progress">
                      {answeredInSection}/{qs.length}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="q-section-body">
                    {section?.description && (
                      <Markdown text={section.description} className="q-section-intro" />
                    )}
                    {qs.map((q, i) => renderQuestionItem(q, i + 1))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="panel-footer">
          {!isSubmitted && (
            <Button className="w-full gap-2" size="lg" onClick={handleSubmitClick}>
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
          <button className="back-to-assignments" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="size-3.5" />
            Back to assignments
          </button>
        </div>
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit assignment?</DialogTitle>
            <DialogDescription>
              You have answered {answeredCount} of {questions.length} questions. Once
              submitted, you will not be able to change your answers.
            </DialogDescription>
          </DialogHeader>
          {submitError && (
            <div className="submit-error" role="alert">
              {submitError}
            </div>
          )}
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
