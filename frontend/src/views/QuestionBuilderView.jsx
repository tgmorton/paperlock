import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import PdfViewer from "../components/PdfViewer";
import BlockOverlay from "../components/BlockOverlay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  MousePointerClick,
  Type,
  FileText,
  Save,
  Hash,
  Layers,
} from "lucide-react";

export default function QuestionBuilderView() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load assignment and blocks on mount
  useEffect(() => {
    async function load() {
      try {
        const a = await api.getAssignment(assignmentId);
        setAssignment(a);
        setQuestions(a.questions || []);
        const b = await api.getBlocks(a.pdf_id);
        setBlocks(b);
      } catch (err) {
        console.error("Load error:", err);
        setLoadError(err.message);
      }
    }
    load();
  }, [assignmentId]);

  // Derive active question from state
  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === activeQuestionId) || null,
    [questions, activeQuestionId]
  );

  // Sync edit form when active question changes
  useEffect(() => {
    if (activeQuestion) {
      setEditForm({
        prompt: activeQuestion.prompt || "",
        question_type: activeQuestion.question_type || "region_select",
        selection_granularity: activeQuestion.selection_granularity || "sentence",
        points: activeQuestion.points ?? 1.0,
        allow_multiple: activeQuestion.allow_multiple ?? false,
        correct_block_ids: activeQuestion.correct_block_ids || [],
      });
    } else {
      setEditForm(null);
    }
  }, [activeQuestionId, activeQuestion]);

  // Handle clicking a question card
  const handleQuestionSelect = useCallback((questionId) => {
    setActiveQuestionId((prev) => (prev === questionId ? null : questionId));
  }, []);

  // Handle block clicks on the PDF (toggle correct answer blocks)
  const handleBlockClick = useCallback(
    async (blockIds) => {
      if (!activeQuestionId || !activeQuestion) return;
      if (activeQuestion.question_type !== "region_select") return;

      const current = activeQuestion.correct_block_ids || [];

      // Toggle: if all blockIds are already in current, remove them. Otherwise add them.
      const allPresent = blockIds.every((id) => current.includes(id));
      let newIds;
      if (allPresent) {
        newIds = current.filter((id) => !blockIds.includes(id));
      } else {
        newIds = [...new Set([...current, ...blockIds])];
      }

      // Update local state immediately
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === activeQuestionId ? { ...q, correct_block_ids: newIds } : q
        )
      );

      // Also update the edit form
      setEditForm((prev) => (prev ? { ...prev, correct_block_ids: newIds } : prev));

      // Persist to server
      try {
        await api.updateQuestion(assignment.id, activeQuestionId, {
          correct_block_ids: newIds,
        });
      } catch (err) {
        console.error("Failed to save block selection:", err);
      }
    },
    [activeQuestionId, activeQuestion, assignment]
  );

  // Add a new question
  const handleAddQuestion = useCallback(async () => {
    if (!assignment) return;
    try {
      const newQ = await api.addQuestion(assignment.id, {
        prompt: "New question",
        question_type: "region_select",
        order: questions.length,
        points: 1.0,
        selection_granularity: "sentence",
      });
      setQuestions((prev) => [...prev, newQ]);
      setActiveQuestionId(newQ.id);
    } catch (err) {
      console.error("Failed to add question:", err);
    }
  }, [assignment, questions.length]);

  // Save the current edit form
  const handleSave = useCallback(async () => {
    if (!activeQuestionId || !editForm || !assignment) return;
    setSaving(true);
    try {
      await api.updateQuestion(assignment.id, activeQuestionId, {
        prompt: editForm.prompt,
        question_type: editForm.question_type,
        selection_granularity: editForm.selection_granularity,
        points: parseFloat(editForm.points) || 1.0,
        allow_multiple: editForm.allow_multiple,
        correct_block_ids: editForm.correct_block_ids,
      });
      // Update local questions state
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === activeQuestionId
            ? {
                ...q,
                prompt: editForm.prompt,
                question_type: editForm.question_type,
                selection_granularity: editForm.selection_granularity,
                points: parseFloat(editForm.points) || 1.0,
                allow_multiple: editForm.allow_multiple,
                correct_block_ids: editForm.correct_block_ids,
              }
            : q
        )
      );
    } catch (err) {
      console.error("Failed to save question:", err);
    } finally {
      setSaving(false);
    }
  }, [activeQuestionId, editForm, assignment]);

  // Delete a question
  const handleDelete = useCallback(async () => {
    if (!activeQuestionId || !assignment) return;
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    try {
      await api.deleteQuestion(assignment.id, activeQuestionId);
      setQuestions((prev) => prev.filter((q) => q.id !== activeQuestionId));
      setActiveQuestionId(null);
    } catch (err) {
      console.error("Failed to delete question:", err);
    }
  }, [activeQuestionId, assignment]);

  // Reorder question (move up or down)
  const handleReorder = useCallback(
    async (questionId, direction) => {
      const idx = questions.findIndex((q) => q.id === questionId);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= questions.length) return;

      const reordered = [...questions];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(newIdx, 0, moved);

      // Update order fields
      const updated = reordered.map((q, i) => ({ ...q, order: i }));
      setQuestions(updated);

      // Persist both affected questions
      try {
        await Promise.all([
          api.updateQuestion(assignment.id, updated[idx].id, {
            order: updated[idx].order,
          }),
          api.updateQuestion(assignment.id, updated[newIdx].id, {
            order: updated[newIdx].order,
          }),
        ]);
      } catch (err) {
        console.error("Failed to reorder:", err);
      }
    },
    [questions, assignment]
  );

  // Render overlay for PDF pages
  const selectionGranularity =
    activeQuestion?.selection_granularity || "sentence";
  const selectedBlockIds = activeQuestion?.correct_block_ids || [];
  const showHints =
    !!activeQuestionId && activeQuestion?.question_type === "region_select";

  const renderOverlay = useCallback(
    (pageIndex, dims) => (
      <BlockOverlay
        key={pageIndex}
        blocks={blocks}
        pageDimensions={dims}
        pageIndex={pageIndex}
        activeQuestionId={activeQuestionId}
        selectionGranularity={selectionGranularity}
        selectedBlockIds={selectedBlockIds}
        onBlockClick={handleBlockClick}
        showHints={showHints}
      />
    ),
    [
      blocks,
      activeQuestionId,
      selectionGranularity,
      selectedBlockIds,
      handleBlockClick,
      showHints,
    ]
  );

  // Sorted questions by order
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [questions]
  );

  if (loadError) {
    return <div className="loading">Error: {loadError}</div>;
  }

  if (!assignment) {
    return (
      <div className="loading">
        <div className="loading-inner">
          <FileText className="size-6 text-muted-foreground animate-pulse" />
          <span>Loading assignment...</span>
        </div>
      </div>
    );
  }

  const pdfUrl = api.getPdfUrl(assignment.pdf_id);

  return (
    <div className="reader-layout">
      {/* Top navigation bar */}
      <div className="reader-topbar">
        <div className="reader-topbar-left">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/instructor")}
            className="text-white/70 hover:text-white hover:bg-white/10"
            title="Back to instructor dashboard"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="reader-topbar-sep" />
          <span className="reader-topbar-title">{assignment.title}</span>
        </div>

        <div className="reader-topbar-center">
          <Badge
            variant="outline"
            className="qb-topbar-badge"
          >
            Question Builder
          </Badge>
        </div>

        <div className="reader-topbar-right">
          <Badge
            variant="outline"
            className="reader-deadline-badge"
          >
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Main content: PDF + Question panel */}
      <div className="reader-main with-sidebar">
        <div className="pdf-container qb-pdf-container">
          <PdfViewer
            pdfUrl={pdfUrl}
            renderOverlay={renderOverlay}
          />
          {/* Floating hint when a region_select question is active */}
          {activeQuestion?.question_type === "region_select" && (
            <div className="qb-pdf-hint">
              <MousePointerClick className="size-3.5" />
              Click regions to set correct answers
            </div>
          )}
        </div>

        {/* Question Builder Panel */}
        <div className="question-builder-panel">
          {/* Panel header */}
          <div className="qb-panel-header">
            <h3>Questions</h3>
            <Button
              size="sm"
              onClick={handleAddQuestion}
              className="qb-add-btn"
            >
              <Plus className="size-3.5 mr-1" />
              Add Question
            </Button>
          </div>

          {/* Question list */}
          <div className="qb-question-list">
            {sortedQuestions.length === 0 && (
              <div className="qb-empty-state">
                <Layers className="size-8 text-muted-foreground" />
                <p>No questions yet</p>
                <span>Click "Add Question" to get started</span>
              </div>
            )}

            {sortedQuestions.map((q, idx) => {
              const isActive = q.id === activeQuestionId;
              return (
                <div
                  key={q.id}
                  className={`qb-question-card ${isActive ? "active" : ""}`}
                  onClick={() => handleQuestionSelect(q.id)}
                >
                  {/* Card header (always visible) */}
                  <div className="qb-card-header">
                    <div className="qb-card-header-left">
                      <span className="question-number">Q{idx + 1}</span>
                      <span className="qb-card-prompt">
                        {q.prompt || "Untitled question"}
                      </span>
                    </div>
                    <div className="qb-card-badges">
                      <Badge variant="secondary" className="qb-type-badge">
                        {q.question_type === "region_select" ? (
                          <>
                            <MousePointerClick className="size-3 mr-0.5" />
                            Region
                          </>
                        ) : (
                          <>
                            <Type className="size-3 mr-0.5" />
                            Text
                          </>
                        )}
                      </Badge>
                      {q.question_type === "region_select" && (
                        <Badge variant="outline" className="qb-gran-badge">
                          {q.selection_granularity || "sentence"}
                        </Badge>
                      )}
                      <Badge variant="outline" className="qb-pts-badge">
                        {q.points ?? 1} pt{(q.points ?? 1) !== 1 ? "s" : ""}
                      </Badge>
                      {q.question_type === "region_select" && (
                        <Badge
                          variant="outline"
                          className={`qb-blocks-badge ${
                            (q.correct_block_ids?.length || 0) > 0
                              ? "has-blocks"
                              : ""
                          }`}
                        >
                          {q.correct_block_ids?.length || 0} blocks
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Expanded edit form (only when active) */}
                  {isActive && editForm && (
                    <div
                      className="qb-edit-form"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Prompt */}
                      <div className="qb-field">
                        <label className="qb-label">Prompt</label>
                        <Textarea
                          value={editForm.prompt}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              prompt: e.target.value,
                            }))
                          }
                          placeholder="Enter the question prompt..."
                          className="qb-textarea"
                          rows={3}
                        />
                      </div>

                      {/* Type + Granularity row */}
                      <div className="qb-field-row">
                        <div className="qb-field qb-field-half">
                          <label className="qb-label">Type</label>
                          <select
                            value={editForm.question_type}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                question_type: e.target.value,
                              }))
                            }
                            className="qb-select"
                          >
                            <option value="region_select">Region Select</option>
                            <option value="free_text">Free Text</option>
                          </select>
                        </div>

                        {editForm.question_type === "region_select" && (
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Granularity</label>
                            <select
                              value={editForm.selection_granularity}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  selection_granularity: e.target.value,
                                }))
                              }
                              className="qb-select"
                            >
                              <option value="word">Word</option>
                              <option value="sentence">Sentence</option>
                              <option value="paragraph">Paragraph</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Points + Allow multiple row */}
                      <div className="qb-field-row">
                        <div className="qb-field qb-field-half">
                          <label className="qb-label">Points</label>
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={editForm.points}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                points: e.target.value,
                              }))
                            }
                            className="qb-input"
                          />
                        </div>

                        {editForm.question_type === "region_select" && (
                          <div className="qb-field qb-field-half">
                            <label className="qb-label qb-checkbox-label">
                              <input
                                type="checkbox"
                                checked={editForm.allow_multiple}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    allow_multiple: e.target.checked,
                                  }))
                                }
                                className="qb-checkbox"
                              />
                              Allow multiple selections
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Correct blocks indicator */}
                      {editForm.question_type === "region_select" && (
                        <div className="qb-blocks-indicator">
                          <Hash className="size-3.5" />
                          <span>
                            {editForm.correct_block_ids?.length || 0} correct
                            answer block
                            {(editForm.correct_block_ids?.length || 0) !== 1
                              ? "s"
                              : ""}{" "}
                            selected
                          </span>
                          <span className="qb-blocks-hint">
                            Click regions on the PDF to toggle
                          </span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="qb-actions">
                        <div className="qb-actions-left">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReorder(q.id, -1)}
                            disabled={idx === 0}
                            title="Move up"
                            className="qb-reorder-btn"
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReorder(q.id, 1)}
                            disabled={idx === sortedQuestions.length - 1}
                            title="Move down"
                            className="qb-reorder-btn"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>
                        <div className="qb-actions-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDelete}
                            className="qb-delete-btn"
                          >
                            <Trash2 className="size-3.5 mr-1" />
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            className="qb-save-btn"
                          >
                            <Save className="size-3.5 mr-1" />
                            {saving ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
