import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import PdfViewer from "../components/PdfViewer";
import BlockOverlay from "../components/BlockOverlay";
import AnnotationOverlay from "../components/AnnotationOverlay";
import AnnotationTools from "../components/AnnotationTools";
import QuestionPanel from "../components/QuestionPanel";
import SearchBar from "../components/SearchBar";
import SaveIndicator from "../components/SaveIndicator";
import { useSaveState } from "../hooks/useSaveState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Search,
  Clock,
  FileText,
} from "lucide-react";

function formatCountdown(targetDate) {
  const now = new Date();
  const diff = new Date(targetDate) - now;
  if (diff <= 0) return "Past due";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function ReaderView() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [submission, setSubmission] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState(null);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [panelMode, setPanelMode] = useState("persistent");
  const [searchHighlight, setSearchHighlight] = useState(null);
  const [searchHighlightPage, setSearchHighlightPage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [instructionBanner, setInstructionBanner] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [annotationMode, setAnnotationMode] = useState("off");
  const [highlightColor, setHighlightColor] = useState("#FFEB3B");
  const [jumpTarget, setJumpTarget] = useState(null);

  // answersRef is the synchronous source of truth for answers (the `answers`
  // state mirrors it for rendering). Handlers read/write the ref so that
  // back-to-back edits compound correctly and saves never use a stale/undefined
  // value — React does not run setState updaters synchronously.
  const answersRef = useRef({});
  const applyAnswer = useCallback((questionId, updater) => {
    const prev = answersRef.current[questionId] || {
      selected_block_ids: [],
      free_text: "",
      selected_options: [],
    };
    const nextAnswer = updater(prev);
    answersRef.current = { ...answersRef.current, [questionId]: nextAnswer };
    setAnswers(answersRef.current);
    return nextAnswer;
  }, []);

  // Save state hooks
  const blockSaveFn = useCallback(
    (data) => submission ? api.saveAnswer(submission.id, data) : undefined,
    [submission]
  );
  const freeTextSaveFn = useCallback(
    (data) => submission ? api.saveAnswer(submission.id, data) : undefined,
    [submission]
  );
  const { triggerSave: triggerBlockSave, flush: flushBlockSave, status: blockSaveStatus } = useSaveState(blockSaveFn);
  const { triggerSave: triggerFreeTextSave, flush: flushFreeTextSave, status: freeTextSaveStatus } = useSaveState(freeTextSaveFn, { debounceMs: 300 });
  const saveStatus = blockSaveStatus === "error" || freeTextSaveStatus === "error" ? "error"
    : blockSaveStatus === "saving" || freeTextSaveStatus === "saving" ? "saving"
    : blockSaveStatus === "saved" || freeTextSaveStatus === "saved" ? "saved" : "idle";
  const [activeNoteId, setActiveNoteId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const a = await api.getAssignment(assignmentId);
        setAssignment(a);
        const b = await api.getBlocks(a.pdf_id);
        setBlocks(b);
        const sub = await api.startSubmission(assignmentId);
        setSubmission(sub);

        const restored = {};
        for (const ans of sub.answers) {
          restored[ans.question_id] = {
            selected_block_ids: ans.selected_block_ids || [],
            free_text: ans.free_text || "",
            selected_options: ans.selected_options || [],
          };
        }
        answersRef.current = restored;
        setAnswers(restored);

        // Load annotations
        try {
          const anns = await api.getAnnotations(a.pdf_id);
          setAnnotations(anns);
        } catch (annErr) {
          console.warn("Could not load annotations:", annErr);
        }
      } catch (err) {
        console.error("Load error:", err);
        setLoadError(err.message);
      }
    }
    load();
  }, [assignmentId]);

  // Lockdown: prevent Ctrl+S, Ctrl+P, and intercept Ctrl+F
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "p")) {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show instruction banner when a question is selected
  const handleQuestionSelect = useCallback(
    (questionId) => {
      setActiveQuestionId(questionId);
      if (!assignment) return;
      const q = assignment.questions.find((q) => q.id === questionId);
      if (q?.question_type === "region_select") {
        setInstructionBanner("Select a text region on the PDF to answer this question");
        setTimeout(() => setInstructionBanner(null), 3000);
      } else {
        setInstructionBanner(null);
      }
    },
    [assignment]
  );

  // --- Annotation handlers (defined before handleBlockClick so it can reference them) ---

  // When switching annotation mode on, deselect any active question
  const handleAnnotationModeChange = useCallback(
    (newMode) => {
      setAnnotationMode(newMode);
      if (newMode !== "off") {
        setActiveQuestionId(null);
        setInstructionBanner(null);
      }
      setActiveNoteId(null);
    },
    []
  );

  // When selecting a question, turn off annotation mode
  const handleQuestionSelectWrapped = useCallback(
    (questionId) => {
      setAnnotationMode("off");
      setActiveNoteId(null);
      handleQuestionSelect(questionId);
    },
    [handleQuestionSelect]
  );

  const handleDeleteAnnotation = useCallback(async (id) => {
    await api.deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setActiveNoteId((prev) => (prev === id ? null : prev));
  }, []);

  const handleNoteUpdate = useCallback(async (id, content) => {
    // Optimistically update in place; persist with a PATCH so the annotation
    // keeps its id (no remount, no lost focus, and it can't fail on a missing
    // pdf_id the way a delete+recreate did).
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, content } : a))
    );
    try {
      await api.updateAnnotation(id, { content });
    } catch (err) {
      console.error("Failed to update note:", err);
    }
  }, []);

  // Create highlight annotation from block click
  const handleAnnotationBlockClick = useCallback(
    async (blockIds) => {
      if (annotationMode !== "highlight" || !assignment) return;
      const matchedBlocks = blocks.filter((b) => blockIds.includes(b.id));
      if (matchedBlocks.length === 0) return;

      const minX = Math.min(...matchedBlocks.map((b) => b.x));
      const minY = Math.min(...matchedBlocks.map((b) => b.y));
      const maxX = Math.max(...matchedBlocks.map((b) => b.x + b.width));
      const maxY = Math.max(...matchedBlocks.map((b) => b.y + b.height));

      const positionData = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };

      try {
        const created = await api.createAnnotation({
          pdf_id: assignment.pdf_id,
          page_number: matchedBlocks[0].page_number,
          annotation_type: "highlight",
          position_data: positionData,
          color: highlightColor,
        });
        setAnnotations((prev) => [...prev, created]);
      } catch (err) {
        console.error("Failed to create highlight:", err);
      }
    },
    [annotationMode, assignment, blocks, highlightColor]
  );

  // Create note annotation from page click
  const handlePageClickForNote = useCallback(
    async (e, pageIndex, dims) => {
      if (annotationMode !== "note" || !assignment || !dims) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / dims.width) * 100;
      const yPct = ((e.clientY - rect.top) / dims.height) * 100;

      const positionData = {
        x: Math.max(0, Math.min(xPct, 100)),
        y: Math.max(0, Math.min(yPct, 100)),
        width: 2,
        height: 2,
      };

      try {
        const created = await api.createAnnotation({
          pdf_id: assignment.pdf_id,
          page_number: pageIndex,
          annotation_type: "note",
          position_data: positionData,
          content: "",
        });
        setAnnotations((prev) => [...prev, created]);
        setActiveNoteId(created.id);
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    },
    [annotationMode, assignment]
  );

  // --- Block click and question handlers ---

  const handleBlockClick = useCallback(
    async (blockIds) => {
      // Route to annotation creation if highlight mode is active
      if (annotationMode === "highlight") {
        handleAnnotationBlockClick(blockIds);
        return;
      }

      if (!activeQuestionId || !submission || submission.is_submitted) return;

      const question = assignment.questions.find(
        (q) => q.id === activeQuestionId
      );
      // Block clicks only answer region-select questions.
      if (question?.question_type !== "region_select") return;

      const result = applyAnswer(activeQuestionId, (current) => {
        let newSelected;
        if (question.allow_multiple) {
          const existing = new Set(current.selected_block_ids);
          for (const id of blockIds) {
            if (existing.has(id)) existing.delete(id);
            else existing.add(id);
          }
          newSelected = [...existing];
        } else {
          newSelected = blockIds;
        }
        return { ...current, selected_block_ids: newSelected };
      });

      await triggerBlockSave({
        question_id: activeQuestionId,
        selected_block_ids: result.selected_block_ids,
        free_text: result.free_text,
        selected_options: result.selected_options,
      });
    },
    [activeQuestionId, assignment, submission, annotationMode, handleAnnotationBlockClick, applyAnswer, triggerBlockSave]
  );

  const handleOptionChange = useCallback(
    async (questionId, optionIndex) => {
      if (!submission || submission.is_submitted) return;
      const question = assignment.questions.find((q) => q.id === questionId);
      if (!question) return;
      const result = applyAnswer(questionId, (current) => {
        const cur = current.selected_options || [];
        const next = question.allow_multiple
          ? cur.includes(optionIndex)
            ? cur.filter((i) => i !== optionIndex)
            : [...cur, optionIndex]
          : [optionIndex];
        return { ...current, selected_options: next };
      });
      await triggerBlockSave({
        question_id: questionId,
        selected_block_ids: result.selected_block_ids,
        free_text: result.free_text,
        selected_options: result.selected_options,
      });
    },
    [assignment, submission, applyAnswer, triggerBlockSave]
  );

  // Positional answers for matching (right-index per left), cloze (bank-index
  // per blank), and scale (value at index 0) — all stored in selected_options.
  const handlePositionalSelect = useCallback(
    async (questionId, position, value) => {
      if (!submission || submission.is_submitted) return;
      const result = applyAnswer(questionId, (current) => {
        const arr = Array.isArray(current.selected_options)
          ? [...current.selected_options]
          : [];
        arr[position] = value;
        return { ...current, selected_options: arr };
      });
      await triggerBlockSave({
        question_id: questionId,
        selected_block_ids: result.selected_block_ids,
        free_text: result.free_text,
        selected_options: result.selected_options,
      });
    },
    [submission, applyAnswer, triggerBlockSave]
  );

  const handleJumpToPage = useCallback((page) => {
    setJumpTarget((prev) => ({ page, n: (prev?.n || 0) + 1 }));
  }, []);

  const handleFreeTextChange = useCallback(
    async (questionId, text) => {
      const result = applyAnswer(questionId, (current) => ({
        ...current,
        free_text: text,
      }));
      await triggerFreeTextSave({
        question_id: questionId,
        selected_block_ids: result.selected_block_ids,
        free_text: text,
        selected_options: result.selected_options,
      });
    },
    [applyAnswer, triggerFreeTextSave]
  );

  const handleSubmit = async () => {
    if (!submission) return;
    // Flush any pending debounced/in-flight saves so the last keystrokes are
    // persisted before the submission is locked (a save after submit is
    // rejected by the server). If a save fails, abort the submit and surface
    // the error rather than locking in unsaved answers.
    try {
      await flushFreeTextSave();
      await flushBlockSave();
    } catch {
      throw new Error(
        "Couldn't save your latest answer before submitting. Check your connection and try again."
      );
    }
    await api.submit(submission.id);
    setSubmission({ ...submission, is_submitted: true });
  };

  const handleSearchResult = useCallback((block) => {
    if (block) {
      setSearchHighlightPage(block.page_number + 1);
      setSearchHighlight(block.id);
    } else {
      setSearchHighlight(null);
      setSearchHighlightPage(null);
    }
  }, []);

  // Compute progress
  const answeredCount = useMemo(() => {
    if (!assignment) return 0;
    const filled = (arr) => (arr || []).filter((v) => v != null).length;
    return assignment.questions.filter((q) => {
      const a = answers[q.id];
      switch (q.question_type) {
        case "free_text":
        case "short_answer":
          return !!a?.free_text?.trim();
        case "multiple_choice":
        case "scale":
          return a?.selected_options?.length > 0;
        case "matching":
          return filled(a?.selected_options) >= (q.match_left || []).length &&
            (q.match_left || []).length > 0;
        case "cloze": {
          const blanks = ((q.cloze_text || "").match(/\{\{\d+\}\}/g) || []).length;
          return blanks > 0 && filled(a?.selected_options) >= blanks;
        }
        default:
          return a?.selected_block_ids?.length > 0;
      }
    }).length;
  }, [assignment, answers]);

  const totalQuestions = assignment?.questions?.length || 0;
  const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // Selected block IDs for current active question
  const selectedBlockIds = activeQuestionId
    ? answers[activeQuestionId]?.selected_block_ids || []
    : [];

  // Whether to show hint outlines
  const activeQuestion = activeQuestionId
    ? assignment?.questions.find((q) => q.id === activeQuestionId)
    : null;
  const showHints =
    activeQuestion?.question_type === "region_select" &&
    selectedBlockIds.length === 0;

  // PDF block selection is only meaningful for region-select questions; for
  // free-text / multiple-choice the overlay must not capture clicks.
  const blockSelectionActive =
    activeQuestion?.question_type === "region_select";

  const selectionGranularity = activeQuestion?.selection_granularity || "sentence";

  // Render overlay for a specific page
  const renderOverlay = useCallback(
    (pageIndex, dims) => (
      <>
        {/* Annotation overlay — behind block overlay when answering questions */}
        <AnnotationOverlay
          annotations={annotations.filter((a) => a.page_number === pageIndex)}
          pageIndex={pageIndex}
          pageDimensions={dims}
          onDeleteAnnotation={handleDeleteAnnotation}
          onNoteClick={setActiveNoteId}
          activeNoteId={activeNoteId}
          onNoteUpdate={handleNoteUpdate}
          disabled={!!activeQuestionId}
        />
        <BlockOverlay
          blocks={blocks}
          pageDimensions={dims}
          pageIndex={pageIndex}
          activeQuestionId={
            annotationMode === "highlight"
              ? "__annotation__"
              : blockSelectionActive
              ? activeQuestionId
              : null
          }
          selectionGranularity={selectionGranularity}
          selectedBlockIds={[
            ...selectedBlockIds,
            ...(searchHighlight ? [searchHighlight] : []),
          ]}
          onBlockClick={handleBlockClick}
          searchHighlightId={searchHighlight}
          showHints={showHints}
        />
        {/* Click target for note creation */}
        {annotationMode === "note" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: dims.width,
              height: dims.height,
              cursor: "crosshair",
              zIndex: 10,
            }}
            onClick={(e) => handlePageClickForNote(e, pageIndex, dims)}
          />
        )}
      </>
    ),
    [
      blocks,
      activeQuestionId,
      blockSelectionActive,
      selectionGranularity,
      selectedBlockIds,
      handleBlockClick,
      searchHighlight,
      showHints,
      annotations,
      activeNoteId,
      handleDeleteAnnotation,
      handleNoteUpdate,
      annotationMode,
      handlePageClickForNote,
    ]
  );

  if (loadError)
    return <div className="loading">Error: {loadError}</div>;
  if (!assignment)
    return (
      <div className="loading">
        <div className="loading-inner">
          <FileText className="size-6 text-muted-foreground animate-pulse" />
          <span>Loading assignment...</span>
        </div>
      </div>
    );

  const pdfUrl = api.getPdfUrl(assignment.pdf_id);

  return (
    <div
      className="reader-layout"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top navigation bar */}
      <div className="reader-topbar">
        <div className="reader-topbar-left">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/dashboard")}
            className="text-white/70 hover:text-white hover:bg-white/10"
            title="Back to dashboard"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="reader-topbar-sep" />
          <span className="reader-topbar-title">{assignment.title}</span>
          <SaveIndicator status={saveStatus} />
        </div>

        <div className="reader-topbar-center">
          <div className="reader-progress-group">
            <span className="reader-progress-text">
              {answeredCount}/{totalQuestions} answered
            </span>
            <div className="reader-progress-bar">
              <div
                className="reader-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="reader-topbar-right">
          <AnnotationTools
            mode={annotationMode}
            onModeChange={handleAnnotationModeChange}
            highlightColor={highlightColor}
            onColorChange={setHighlightColor}
          />
          <div className="reader-topbar-sep" />
          {assignment.available_until && (
            <Badge variant="outline" className="reader-deadline-badge">
              <Clock className="size-3 mr-1" />
              {formatCountdown(assignment.available_until)}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSearchOpen((o) => !o)}
            className="text-white/70 hover:text-white hover:bg-white/10"
            title="Search (Ctrl+F)"
          >
            <Search className="size-4" />
          </Button>
        </div>
      </div>

      {/* Search bar overlay */}
      <SearchBar
        blocks={blocks}
        onSearchResult={handleSearchResult}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Instruction banner */}
      {instructionBanner && (
        <div className="reader-instruction-banner">
          <MousePointerClickIcon />
          {instructionBanner}
        </div>
      )}

      {/* Main content area */}
      <div
        className={`reader-main ${
          panelMode === "persistent" ? "with-sidebar" : "full-width"
        }`}
      >
        <div className="pdf-container">
          <PdfViewer
            pdfUrl={pdfUrl}
            onCurrentPageChange={setCurrentPage}
            onPageDimensions={setPageDimensions}
            renderOverlay={renderOverlay}
            searchHighlightPage={searchHighlightPage}
            jumpToPage={jumpTarget}
          />
        </div>

        <QuestionPanel
          questions={assignment.questions}
          answers={answers}
          blocks={blocks}
          sections={assignment.sections || []}
          activeQuestionId={activeQuestionId}
          onQuestionSelect={handleQuestionSelectWrapped}
          onFreeTextChange={handleFreeTextChange}
          onOptionChange={handleOptionChange}
          onPositionalSelect={handlePositionalSelect}
          onJumpToPage={handleJumpToPage}
          onSubmit={handleSubmit}
          isSubmitted={submission?.is_submitted || false}
          mode={panelMode}
          onModeToggle={() =>
            setPanelMode((m) =>
              m === "persistent" ? "focus" : "persistent"
            )
          }
        />
      </div>
    </div>
  );
}

// Small inline icon for the instruction banner
function MousePointerClickIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="m9 9 5 12 1.8-5.2L21 14Z" />
      <path d="M7.2 2.2 8 5.1" />
      <path d="m5.1 8-2.9-.8" />
      <path d="M14 4.1 12 6" />
      <path d="m6 12-1.9 2" />
    </svg>
  );
}
