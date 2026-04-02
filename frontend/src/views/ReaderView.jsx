import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import PdfViewer from "../components/PdfViewer";
import BlockOverlay from "../components/BlockOverlay";
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

  const blockSaveFn = useCallback(
    (data) => {
      if (!submission) return;
      return api.saveAnswer(submission.id, data);
    },
    [submission]
  );

  const freeTextSaveFn = useCallback(
    (data) => {
      if (!submission) return;
      return api.saveAnswer(submission.id, data);
    },
    [submission]
  );

  const { triggerSave: triggerBlockSave, status: blockSaveStatus } =
    useSaveState(blockSaveFn);
  const { triggerSave: triggerFreeTextSave, status: freeTextSaveStatus } =
    useSaveState(freeTextSaveFn, { debounceMs: 300 });

  // Combined save status: prefer showing the most "active" state
  const saveStatus =
    blockSaveStatus === "error" || freeTextSaveStatus === "error"
      ? "error"
      : blockSaveStatus === "saving" || freeTextSaveStatus === "saving"
        ? "saving"
        : blockSaveStatus === "saved" || freeTextSaveStatus === "saved"
          ? "saved"
          : "idle";

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
          };
        }
        setAnswers(restored);
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

  const handleBlockClick = useCallback(
    async (blockIds) => {
      if (!activeQuestionId || !submission || submission.is_submitted) return;

      const question = assignment.questions.find(
        (q) => q.id === activeQuestionId
      );
      const current = answers[activeQuestionId] || {
        selected_block_ids: [],
        free_text: "",
      };

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

      const newAnswer = { ...current, selected_block_ids: newSelected };
      setAnswers((prev) => ({ ...prev, [activeQuestionId]: newAnswer }));

      await triggerBlockSave({
        question_id: activeQuestionId,
        selected_block_ids: newSelected,
        free_text: current.free_text,
      });
    },
    [activeQuestionId, answers, assignment, submission, triggerBlockSave]
  );

  const handleFreeTextChange = useCallback(
    async (questionId, text) => {
      const current = answers[questionId] || {
        selected_block_ids: [],
        free_text: "",
      };
      const newAnswer = { ...current, free_text: text };
      setAnswers((prev) => ({ ...prev, [questionId]: newAnswer }));

      await triggerFreeTextSave({
        question_id: questionId,
        selected_block_ids: current.selected_block_ids,
        free_text: text,
      });
    },
    [answers, triggerFreeTextSave]
  );

  const handleSubmit = async () => {
    if (!submission) return;
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
    return assignment.questions.filter((q) => {
      const a = answers[q.id];
      return q.question_type === "free_text"
        ? !!a?.free_text
        : a?.selected_block_ids?.length > 0;
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

  const selectionGranularity = activeQuestion?.selection_granularity || "sentence";

  // Render overlay for a specific page
  const renderOverlay = useCallback(
    (pageIndex, dims) => (
      <BlockOverlay
        key={pageIndex}
        blocks={blocks}
        pageDimensions={dims}
        pageIndex={pageIndex}
        activeQuestionId={activeQuestionId}
        selectionGranularity={selectionGranularity}
        selectedBlockIds={[
          ...selectedBlockIds,
          ...(searchHighlight ? [searchHighlight] : []),
        ]}
        onBlockClick={handleBlockClick}
        searchHighlightId={searchHighlight}
        showHints={showHints}
      />
    ),
    [
      blocks,
      activeQuestionId,
      selectionGranularity,
      selectedBlockIds,
      handleBlockClick,
      searchHighlight,
      showHints,
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
          />
        </div>

        <QuestionPanel
          questions={assignment.questions}
          answers={answers}
          blocks={blocks}
          activeQuestionId={activeQuestionId}
          onQuestionSelect={handleQuestionSelect}
          onFreeTextChange={handleFreeTextChange}
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
