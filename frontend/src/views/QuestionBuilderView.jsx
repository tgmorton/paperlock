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
  ListChecks,
} from "lucide-react";

export default function QuestionBuilderView() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  // Load assignment and blocks on mount
  useEffect(() => {
    async function load() {
      try {
        const a = await api.getAssignment(assignmentId);
        setAssignment(a);
        setQuestions(a.questions || []);
        setSections(a.sections || []);
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
        options: activeQuestion.options || [],
        correct_options: activeQuestion.correct_options || [],
        section_id: activeQuestion.section_id ?? "",
        guidance: activeQuestion.guidance || "",
        target_page: activeQuestion.target_page ?? "",
        sample_answer: activeQuestion.sample_answer || "",
        grading_mode: activeQuestion.grading_mode || "",
        accepted_answers: activeQuestion.accepted_answers || [],
        match_left: activeQuestion.match_left || [],
        match_right: activeQuestion.match_right || [],
        correct_matches: activeQuestion.correct_matches || [],
        cloze_text: activeQuestion.cloze_text || "",
        cloze_bank: activeQuestion.cloze_bank || [],
        cloze_answers: activeQuestion.cloze_answers || [],
        scale_min: activeQuestion.scale_min ?? 1,
        scale_max: activeQuestion.scale_max ?? 5,
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
      // Order = max existing + 1 so deletes don't cause colliding order values.
      const nextOrder = questions.reduce(
        (m, q) => Math.max(m, (q.order ?? 0) + 1),
        0
      );
      const newQ = await api.addQuestion(assignment.id, {
        prompt: "New question",
        question_type: "region_select",
        order: nextOrder,
        points: 1.0,
        selection_granularity: "sentence",
      });
      setQuestions((prev) => [...prev, newQ]);
      setActiveQuestionId(newQ.id);
    } catch (err) {
      console.error("Failed to add question:", err);
    }
  }, [assignment, questions]);

  // Save the current edit form
  const handleSave = useCallback(async () => {
    if (!activeQuestionId || !editForm || !assignment) return;
    setSaving(true);
    // NaN-aware so an intentional 0-point (ungraded) question stays 0.
    const parsedPoints = parseFloat(editForm.points);
    const points = Number.isNaN(parsedPoints) ? 1.0 : parsedPoints;
    // NOTE: handleSave deliberately does NOT own options/correct_options/
    // allow_multiple. Those are persisted only through applyMc (the MC editor
    // controls and the option-text onBlur). Otherwise a blur firing before a
    // mark-correct click would PUT a stale answer key from this closure after
    // its await and revert the instructor's selection.
    // Update local state optimistically BEFORE the network round-trip.
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === activeQuestionId
          ? {
              ...q,
              prompt: editForm.prompt,
              question_type: editForm.question_type,
              selection_granularity: editForm.selection_granularity,
              points,
              correct_block_ids: editForm.correct_block_ids,
            }
          : q
      )
    );
    try {
      await api.updateQuestion(assignment.id, activeQuestionId, {
        prompt: editForm.prompt,
        question_type: editForm.question_type,
        selection_granularity: editForm.selection_granularity,
        points,
        correct_block_ids: editForm.correct_block_ids,
      });
    } catch (err) {
      console.error("Failed to save question:", err);
    } finally {
      setSaving(false);
    }
  }, [activeQuestionId, editForm, assignment]);

  // Apply a full new edit-form state for multiple-choice structural changes
  // (options / correct answers / allow-multiple) and persist immediately.
  const applyMc = useCallback(
    async (newForm) => {
      if (!assignment || !activeQuestionId) return;
      setEditForm(newForm);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === activeQuestionId
            ? {
                ...q,
                question_type: newForm.question_type,
                options: newForm.options,
                correct_options: newForm.correct_options,
                allow_multiple: newForm.allow_multiple,
              }
            : q
        )
      );
      try {
        await api.updateQuestion(assignment.id, activeQuestionId, {
          options: newForm.options,
          correct_options: newForm.correct_options,
          allow_multiple: newForm.allow_multiple,
        });
      } catch (err) {
        console.error("Failed to save options:", err);
      }
    },
    [assignment, activeQuestionId]
  );

  // Immediately persist a partial patch of fields (used by the per-type editors
  // and common fields). Sends ONLY the patched fields so it can't overwrite
  // other fields from a stale snapshot.
  const applyPatch = useCallback(
    async (patch) => {
      if (!assignment || !activeQuestionId) return;
      setEditForm((f) => (f ? { ...f, ...patch } : f));
      setQuestions((prev) =>
        prev.map((q) => (q.id === activeQuestionId ? { ...q, ...patch } : q))
      );
      try {
        await api.updateQuestion(assignment.id, activeQuestionId, patch);
      } catch (err) {
        console.error("Failed to save question:", err);
      }
    },
    [assignment, activeQuestionId]
  );

  // --- Section management ---
  const handleAddSection = useCallback(async () => {
    if (!assignment) return;
    try {
      const nextOrder = sections.reduce((m, s) => Math.max(m, (s.order ?? 0) + 1), 0);
      const s = await api.createSection(assignment.id, {
        title: "New section",
        description: "",
        order: nextOrder,
      });
      setSections((prev) => [...prev, s]);
    } catch (err) {
      console.error("Failed to add section:", err);
    }
  }, [assignment, sections]);

  const handleUpdateSection = useCallback(
    async (sectionId, patch) => {
      if (!assignment) return;
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
      try {
        await api.updateSection(assignment.id, sectionId, patch);
      } catch (err) {
        console.error("Failed to update section:", err);
      }
    },
    [assignment]
  );

  const handleDeleteSection = useCallback(
    async (sectionId) => {
      if (!assignment) return;
      if (!window.confirm("Delete this section? Its questions become ungrouped.")) return;
      try {
        await api.deleteSection(assignment.id, sectionId);
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
        setQuestions((prev) =>
          prev.map((q) => (q.section_id === sectionId ? { ...q, section_id: null } : q))
        );
      } catch (err) {
        console.error("Failed to delete section:", err);
      }
    },
    [assignment]
  );

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
      // Operate on the display (sorted) order, not the raw array order.
      const ordered = [...questions].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const idx = ordered.findIndex((q) => q.id === questionId);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= ordered.length) return;

      const [moved] = ordered.splice(idx, 1);
      ordered.splice(newIdx, 0, moved);

      // Renormalize all order values to 0..n-1 and persist every question
      // whose order actually changed (local renormalization can shift more than
      // just the two that swapped, so persisting only those two would diverge).
      const prevOrder = new Map(questions.map((q) => [q.id, q.order ?? 0]));
      const updated = ordered.map((q, i) => ({ ...q, order: i }));
      setQuestions(updated);

      try {
        await Promise.all(
          updated
            .filter((q) => prevOrder.get(q.id) !== q.order)
            .map((q) =>
              api.updateQuestion(assignment.id, q.id, { order: q.order })
            )
        );
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
  const regionActive = activeQuestion?.question_type === "region_select";
  const showHints = !!activeQuestionId && regionActive;

  const renderOverlay = useCallback(
    (pageIndex, dims) => (
      <BlockOverlay
        key={pageIndex}
        blocks={blocks}
        pageDimensions={dims}
        pageIndex={pageIndex}
        // Only region-select questions select PDF text; for MC/free-text the
        // overlay must not capture clicks.
        activeQuestionId={regionActive ? activeQuestionId : null}
        selectionGranularity={selectionGranularity}
        selectedBlockIds={selectedBlockIds}
        onBlockClick={handleBlockClick}
        showHints={showHints}
      />
    ),
    [
      blocks,
      activeQuestionId,
      regionActive,
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

          {/* Section manager (collapsible) */}
          <div className="qb-sections">
            <button
              className="qb-sections-head"
              onClick={() => setSectionsOpen((o) => !o)}
            >
              <ChevronDown className={`size-4 qb-sec-chev ${sectionsOpen ? "" : "collapsed"}`} />
              <span className="qb-sections-label">Sections</span>
              <span className="qb-sections-count">{sections.length}</span>
            </button>
            {sectionsOpen && (
              <div className="qb-sections-body">
                {[...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
                  <div key={s.id} className="qb-section-card">
                    <div className="qb-section-card-head">
                      <Input
                        value={s.title}
                        onChange={(e) => setSections((prev) => prev.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))}
                        onBlur={() => handleUpdateSection(s.id, { title: s.title })}
                        placeholder="Section title"
                        className="qb-input"
                      />
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteSection(s.id)} title="Delete section">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={s.description || ""}
                      onChange={(e) => setSections((prev) => prev.map((x) => x.id === s.id ? { ...x, description: e.target.value } : x))}
                      onBlur={() => handleUpdateSection(s.id, { description: s.description })}
                      placeholder="Intro / instructions (markdown — # heading, **bold**, - list)"
                      className="qb-textarea"
                      rows={2}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddSection} className="qb-add-section-btn">
                  <Plus className="size-3.5 mr-1" /> Add section
                </Button>
              </div>
            )}
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
                        {{
                          region_select: "Region",
                          multiple_choice: "Choice",
                          short_answer: "Short",
                          matching: "Match",
                          cloze: "Cloze",
                          scale: "Scale",
                          free_text: "Text",
                        }[q.question_type] || q.question_type}
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
                      {q.question_type === "multiple_choice" && (
                        <Badge
                          variant="outline"
                          className={`qb-blocks-badge ${
                            (q.correct_options?.length || 0) > 0 ? "has-blocks" : ""
                          }`}
                        >
                          {q.options?.length || 0} options
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
                          onBlur={handleSave}
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
                            onChange={(e) => {
                              const newType = e.target.value;
                              // Any non-region type clears the region answer key
                              // so auto-grade never scores it against blocks.
                              const patch = { question_type: newType };
                              // Reset grading_mode to the new type's default so a
                              // leftover mode (e.g. scale's "completion") can't
                              // mis-grade the new type.
                              patch.grading_mode =
                                newType === "scale" ? "completion"
                                : newType === "free_text" ? "manual"
                                : "auto";
                              if (newType !== "region_select") {
                                patch.correct_block_ids = [];
                              }
                              if (newType !== "multiple_choice") {
                                patch.options = [];
                                patch.correct_options = [];
                              }
                              // Seed sensible defaults for the new type.
                              if (newType === "multiple_choice" && !(editForm.options || []).length) {
                                patch.allow_multiple = false;
                                patch.options = ["", ""];
                                patch.correct_options = [];
                              } else if (newType === "short_answer" && !(editForm.accepted_answers || []).length) {
                                patch.accepted_answers = [""];
                              } else if (newType === "matching" && !(editForm.match_left || []).length) {
                                patch.match_left = ["", ""];
                                patch.match_right = ["", ""];
                                patch.correct_matches = [];
                              } else if (newType === "cloze" && !(editForm.cloze_bank || []).length) {
                                patch.cloze_text = editForm.cloze_text || "Fill the {{0}} blank.";
                                patch.cloze_bank = [""];
                                patch.cloze_answers = [];
                              } else if (newType === "scale") {
                                patch.scale_min = editForm.scale_min ?? 1;
                                patch.scale_max = editForm.scale_max ?? 5;
                                patch.grading_mode = "completion";
                              }
                              setEditForm((f) => ({ ...f, ...patch }));
                              setQuestions((prev) =>
                                prev.map((qq) =>
                                  qq.id === activeQuestionId
                                    ? { ...qq, ...patch }
                                    : qq
                                )
                              );
                              api
                                .updateQuestion(assignment.id, activeQuestionId, patch)
                                .catch(() => {});
                            }}
                            className="qb-select"
                          >
                            <option value="region_select">Region Select</option>
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="short_answer">Short Answer</option>
                            <option value="matching">Matching</option>
                            <option value="cloze">Cloze (word bank)</option>
                            <option value="scale">Scale (1–N)</option>
                            <option value="free_text">Free Text</option>
                          </select>
                        </div>

                        {editForm.question_type === "region_select" && (
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Granularity</label>
                            <select
                              value={editForm.selection_granularity}
                              onChange={(e) => {
                                const newGran = e.target.value;
                                setEditForm((f) => ({
                                  ...f,
                                  selection_granularity: newGran,
                                  correct_block_ids: [],
                                }));
                                // Auto-save granularity change + clear blocks
                                setQuestions((prev) =>
                                  prev.map((qq) =>
                                    qq.id === activeQuestionId
                                      ? { ...qq, selection_granularity: newGran, correct_block_ids: [] }
                                      : qq
                                  )
                                );
                                api.updateQuestion(assignment.id, activeQuestionId, {
                                  selection_granularity: newGran,
                                  correct_block_ids: [],
                                });
                              }}
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
                            onBlur={handleSave}
                            className="qb-input"
                          />
                        </div>

                        {editForm.question_type === "region_select" && (
                          <div className="qb-field qb-field-half">
                            <label className="qb-label qb-checkbox-label">
                              <input
                                type="checkbox"
                                checked={editForm.allow_multiple}
                                onChange={(e) => {
                                  const val = e.target.checked;
                                  setEditForm((f) => ({ ...f, allow_multiple: val }));
                                  setQuestions((prev) =>
                                    prev.map((qq) =>
                                      qq.id === activeQuestionId
                                        ? { ...qq, allow_multiple: val }
                                        : qq
                                    )
                                  );
                                  api
                                    .updateQuestion(assignment.id, activeQuestionId, {
                                      allow_multiple: val,
                                    })
                                    .catch(() => {});
                                }}
                                className="qb-checkbox"
                              />
                              Allow multiple selections
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Multiple-choice options editor */}
                      {editForm.question_type === "multiple_choice" && (
                        <div className="qb-field">
                          <label className="qb-label">
                            Answer options —{" "}
                            {editForm.allow_multiple
                              ? "check all correct"
                              : "select the correct one"}
                          </label>
                          <div className="qb-mc-options">
                            {(editForm.options || []).map((opt, i) => (
                              <div key={i} className="qb-mc-row">
                                <input
                                  type={editForm.allow_multiple ? "checkbox" : "radio"}
                                  name="qb-correct"
                                  checked={(editForm.correct_options || []).includes(i)}
                                  onChange={() => {
                                    const cur = editForm.correct_options || [];
                                    const nc = editForm.allow_multiple
                                      ? cur.includes(i)
                                        ? cur.filter((x) => x !== i)
                                        : [...cur, i]
                                      : [i];
                                    applyMc({ ...editForm, correct_options: nc });
                                  }}
                                  title="Mark correct"
                                  className="qb-mc-correct"
                                />
                                <Input
                                  value={opt}
                                  onChange={(e) =>
                                    setEditForm((f) => ({
                                      ...f,
                                      options: f.options.map((o, idx) =>
                                        idx === i ? e.target.value : o
                                      ),
                                    }))
                                  }
                                  onBlur={() => applyMc({ ...editForm })}
                                  placeholder={`Option ${i + 1}`}
                                  className="qb-input"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    const options = editForm.options.filter(
                                      (_, idx) => idx !== i
                                    );
                                    const correct_options = (editForm.correct_options || [])
                                      .filter((x) => x !== i)
                                      .map((x) => (x > i ? x - 1 : x));
                                    applyMc({ ...editForm, options, correct_options });
                                  }}
                                  title="Remove option"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="qb-mc-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                applyMc({
                                  ...editForm,
                                  options: [...(editForm.options || []), ""],
                                })
                              }
                            >
                              <Plus className="size-3.5 mr-1" />
                              Add option
                            </Button>
                            <label className="qb-checkbox-label">
                              <input
                                type="checkbox"
                                checked={editForm.allow_multiple}
                                onChange={(e) => {
                                  const val = e.target.checked;
                                  const correct_options = val
                                    ? editForm.correct_options || []
                                    : (editForm.correct_options || []).slice(0, 1);
                                  applyMc({
                                    ...editForm,
                                    allow_multiple: val,
                                    correct_options,
                                  });
                                }}
                                className="qb-checkbox"
                              />
                              Allow multiple correct answers
                            </label>
                          </div>
                          {(() => {
                            const opts = editForm.options || [];
                            const correct = editForm.correct_options || [];
                            const warns = [];
                            if (opts.length < 2)
                              warns.push("Add at least two options.");
                            if (opts.some((o) => !o.trim()))
                              warns.push("Every option needs text.");
                            if (correct.length === 0)
                              warns.push("Mark the correct answer.");
                            if (!editForm.allow_multiple && correct.length > 1)
                              warns.push(
                                "Single-answer questions should have exactly one correct option."
                              );
                            if (warns.length === 0) return null;
                            return (
                              <div className="qb-mc-warning" role="alert">
                                {warns.map((w, i) => (
                                  <div key={i}>⚠ {w}</div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Correct blocks indicator */}
                      {editForm.question_type === "region_select" && (
                        <div className="qb-blocks-indicator">
                          <Hash className="size-3.5" />
                          <span>
                            {editForm.correct_block_ids?.length || 0} correct block{(editForm.correct_block_ids?.length || 0) !== 1 ? "s" : ""} selected
                          </span>
                          {(editForm.correct_block_ids?.length || 0) > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="qb-clear-btn"
                              onClick={() => {
                                setEditForm((f) => ({ ...f, correct_block_ids: [] }));
                                setQuestions((prev) =>
                                  prev.map((qq) =>
                                    qq.id === activeQuestionId
                                      ? { ...qq, correct_block_ids: [] }
                                      : qq
                                  )
                                );
                                api.updateQuestion(assignment.id, activeQuestionId, {
                                  correct_block_ids: [],
                                });
                              }}
                            >
                              Clear all
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Short answer editor */}
                      {editForm.question_type === "short_answer" && (
                        <div className="qb-field">
                          <label className="qb-label">Accepted answers (any match = full credit; case/number tolerant)</label>
                          {(editForm.accepted_answers || []).map((ans, i) => (
                            <div key={i} className="qb-mc-row">
                              <Input value={ans}
                                onChange={(e) => setEditForm((f) => ({ ...f, accepted_answers: f.accepted_answers.map((a, idx) => idx === i ? e.target.value : a) }))}
                                onBlur={() => applyPatch({ accepted_answers: editForm.accepted_answers })}
                                placeholder={`Acceptable answer ${i + 1}`} className="qb-input" />
                              <Button variant="ghost" size="icon-sm" title="Remove"
                                onClick={() => applyPatch({ accepted_answers: editForm.accepted_answers.filter((_, idx) => idx !== i) })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => applyPatch({ accepted_answers: [...(editForm.accepted_answers || []), ""] })}>
                            <Plus className="size-3.5 mr-1" />Add accepted answer
                          </Button>
                        </div>
                      )}

                      {/* Matching editor */}
                      {editForm.question_type === "matching" && (
                        <div className="qb-field">
                          <label className="qb-label">Right-side options</label>
                          {(editForm.match_right || []).map((r, i) => (
                            <div key={i} className="qb-mc-row">
                              <Input value={r}
                                onChange={(e) => setEditForm((f) => ({ ...f, match_right: f.match_right.map((x, idx) => idx === i ? e.target.value : x) }))}
                                onBlur={() => applyPatch({ match_right: editForm.match_right })}
                                placeholder={`Right option ${i + 1}`} className="qb-input" />
                              <Button variant="ghost" size="icon-sm" onClick={() => applyPatch({
                                match_right: editForm.match_right.filter((_, idx) => idx !== i),
                                // Remap correct_matches (right-index per left): drop refs to i, shift down refs > i.
                                correct_matches: (editForm.correct_matches || []).map((v) => v == null ? v : v === i ? null : v > i ? v - 1 : v),
                              })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => applyPatch({ match_right: [...(editForm.match_right || []), ""] })}>
                            <Plus className="size-3.5 mr-1" />Add right option
                          </Button>
                          <label className="qb-label" style={{ marginTop: 10 }}>Left items → correct right option</label>
                          {(editForm.match_left || []).map((left, i) => (
                            <div key={i} className="qb-mc-row">
                              <Input value={left}
                                onChange={(e) => setEditForm((f) => ({ ...f, match_left: f.match_left.map((x, idx) => idx === i ? e.target.value : x) }))}
                                onBlur={() => applyPatch({ match_left: editForm.match_left })}
                                placeholder={`Left ${i + 1}`} className="qb-input" />
                              <select className="qb-select" value={editForm.correct_matches?.[i] ?? ""}
                                onChange={(e) => { const cm = [...(editForm.correct_matches || [])]; cm[i] = e.target.value === "" ? null : parseInt(e.target.value); applyPatch({ correct_matches: cm }); }}>
                                <option value="">— match —</option>
                                {(editForm.match_right || []).map((r, j) => <option key={j} value={j}>{r || `Right ${j + 1}`}</option>)}
                              </select>
                              <Button variant="ghost" size="icon-sm" onClick={() => applyPatch({ match_left: editForm.match_left.filter((_, idx) => idx !== i), correct_matches: (editForm.correct_matches || []).filter((_, idx) => idx !== i) })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => applyPatch({ match_left: [...(editForm.match_left || []), ""], correct_matches: [...(editForm.correct_matches || []), null] })}>
                            <Plus className="size-3.5 mr-1" />Add left item
                          </Button>
                        </div>
                      )}

                      {/* Cloze editor */}
                      {editForm.question_type === "cloze" && (
                        <div className="qb-field">
                          <label className="qb-label">Cloze text — use {"{{0}}"}, {"{{1}}"}, … for blanks</label>
                          <Textarea value={editForm.cloze_text}
                            onChange={(e) => setEditForm((f) => ({ ...f, cloze_text: e.target.value }))}
                            onBlur={() => applyPatch({ cloze_text: editForm.cloze_text })}
                            className="qb-textarea" rows={3} placeholder="A {{0}} object rules out the {{1}} hypothesis." />
                          <label className="qb-label" style={{ marginTop: 10 }}>Word bank</label>
                          {(editForm.cloze_bank || []).map((w, i) => (
                            <div key={i} className="qb-mc-row">
                              <Input value={w}
                                onChange={(e) => setEditForm((f) => ({ ...f, cloze_bank: f.cloze_bank.map((x, idx) => idx === i ? e.target.value : x) }))}
                                onBlur={() => applyPatch({ cloze_bank: editForm.cloze_bank })}
                                placeholder={`Word ${i + 1}`} className="qb-input" />
                              <Button variant="ghost" size="icon-sm" onClick={() => applyPatch({ cloze_bank: editForm.cloze_bank.filter((_, idx) => idx !== i) })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => applyPatch({ cloze_bank: [...(editForm.cloze_bank || []), ""] })}>
                            <Plus className="size-3.5 mr-1" />Add bank word
                          </Button>
                          <label className="qb-label" style={{ marginTop: 10 }}>Correct word per blank</label>
                          {/* Index cloze_answers by the placeholder NUMBER ({{n}}), matching how
                              the reader stores the student's answer, so grading lines up even if
                              placeholders are out of order or non-contiguous. */}
                          {[...new Set([...(editForm.cloze_text || "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1])))].map((num) => (
                            <div key={num} className="qb-mc-row">
                              <span style={{ minWidth: 60, fontSize: "0.8rem" }}>Blank {num}</span>
                              <select className="qb-select" value={editForm.cloze_answers?.[num] ?? ""}
                                onChange={(e) => { const ca = [...(editForm.cloze_answers || [])]; ca[num] = e.target.value === "" ? null : parseInt(e.target.value); applyPatch({ cloze_answers: ca }); }}>
                                <option value="">— choose word —</option>
                                {(editForm.cloze_bank || []).map((w, j) => <option key={j} value={j}>{w || `Word ${j + 1}`}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Scale editor */}
                      {editForm.question_type === "scale" && (
                        <div className="qb-field-row">
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Min</label>
                            <Input type="number" value={editForm.scale_min}
                              onChange={(e) => setEditForm((f) => ({ ...f, scale_min: e.target.value }))}
                              onBlur={() => applyPatch({ scale_min: parseInt(editForm.scale_min) || 1 })} className="qb-input" />
                          </div>
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Max</label>
                            <Input type="number" value={editForm.scale_max}
                              onChange={(e) => setEditForm((f) => ({ ...f, scale_max: e.target.value }))}
                              onBlur={() => applyPatch({ scale_max: parseInt(editForm.scale_max) || 5 })} className="qb-input" />
                          </div>
                        </div>
                      )}

                      {/* Guidance & grading (secondary settings, all types) */}
                      <div className="qb-settings">
                        <div className="qb-settings-title">Guidance & grading</div>
                        <div className="qb-field-row">
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Section</label>
                            <select className="qb-select" value={editForm.section_id ?? ""}
                              onChange={(e) => applyPatch({ section_id: e.target.value === "" ? null : parseInt(e.target.value) })}>
                              <option value="">— none —</option>
                              {[...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </select>
                          </div>
                          <div className="qb-field qb-field-half">
                            <label className="qb-label">Jump to page</label>
                            <Input type="number" value={editForm.target_page}
                              onChange={(e) => setEditForm((f) => ({ ...f, target_page: e.target.value }))}
                              onBlur={() => applyPatch({ target_page: editForm.target_page === "" ? null : parseInt(editForm.target_page) })}
                              placeholder="PDF page #" className="qb-input" />
                          </div>
                        </div>
                        <div className="qb-field">
                          <label className="qb-label">Guidance ("where to look")</label>
                          <Input value={editForm.guidance}
                            onChange={(e) => setEditForm((f) => ({ ...f, guidance: e.target.value }))}
                            onBlur={() => applyPatch({ guidance: editForm.guidance })}
                            placeholder="e.g. Abstract, first sentence, p. 560" className="qb-input" />
                        </div>
                        <div className="qb-field">
                          <label className="qb-label">Sample answer (shown after submit)</label>
                          <Textarea value={editForm.sample_answer}
                            onChange={(e) => setEditForm((f) => ({ ...f, sample_answer: e.target.value }))}
                            onBlur={() => applyPatch({ sample_answer: editForm.sample_answer })}
                            className="qb-textarea" rows={2} placeholder="Optional model answer" />
                        </div>
                        {editForm.question_type === "free_text" && (
                          <div className="qb-field">
                            <label className="qb-label">Grading</label>
                            <select className="qb-select" value={editForm.grading_mode || "manual"}
                              onChange={(e) => applyPatch({ grading_mode: e.target.value })}>
                              <option value="manual">Manual (you grade it)</option>
                              <option value="completion">Completion credit (full points if answered)</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="qb-actions">
                        <div className="qb-actions-left">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReorder(q.id, -1)}
                            disabled={idx === 0}
                            title="Move up"
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReorder(q.id, 1)}
                            disabled={idx === sortedQuestions.length - 1}
                            title="Move down"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>
                        <div className="qb-actions-right">
                          <Button
                            variant="outline"
                            onClick={handleDelete}
                            className="qb-delete-btn"
                          >
                            <Trash2 className="size-3.5 mr-1.5" />
                            Delete
                          </Button>
                          <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="qb-save-btn"
                          >
                            <Save className="size-3.5 mr-1.5" />
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
