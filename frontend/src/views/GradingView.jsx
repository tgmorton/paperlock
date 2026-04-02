import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  LogOut,
  Zap,
  Download,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";

export default function GradingView() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [assignment, setAssignment] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [subDetail, setSubDetail] = useState(null);
  const [grades, setGrades] = useState({});
  const [pdfBlocks, setPdfBlocks] = useState([]);

  useEffect(() => {
    async function load() {
      const a = await api.getAssignment(assignmentId);
      setAssignment(a);
      api.listSubmissions(assignmentId).then(setSubmissions);
      // Load PDF blocks to resolve IDs to text
      if (a.pdf_id) {
        const blocks = await api.getBlocks(a.pdf_id);
        setPdfBlocks(blocks);
      }
    }
    load();
  }, [assignmentId]);

  // Build a lookup map from block ID to block data
  const blockMap = useMemo(() => {
    const map = new Map();
    for (const b of pdfBlocks) {
      map.set(b.id, b);
    }
    return map;
  }, [pdfBlocks]);

  // Resolve block IDs to readable text
  const resolveBlockText = (blockIds) => {
    if (!blockIds || blockIds.length === 0) return null;
    const resolved = blockIds
      .map((id) => blockMap.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.page_number !== b.page_number) return a.page_number - b.page_number;
        return (a.block_order ?? 0) - (b.block_order ?? 0);
      });
    if (resolved.length === 0) return `[Block IDs: ${blockIds.join(", ")}]`;
    return resolved.map((b) => b.text).join(" ");
  };

  const loadSubmission = async (subId) => {
    setSelectedSub(subId);
    const detail = await api.getSubmission(subId);
    setSubDetail(detail);
  };

  const handleGrade = async (questionId, score, comments) => {
    await api.gradeQuestion({
      submission_id: selectedSub,
      question_id: questionId,
      score: parseFloat(score),
      comments,
    });
    setGrades((prev) => ({
      ...prev,
      [`${selectedSub}_${questionId}`]: { score, comments },
    }));
  };

  const handleAutoGrade = async () => {
    const result = await api.autoGrade(assignmentId);
    alert(`Auto-graded ${result.graded} answers`);
    api.listSubmissions(assignmentId).then(setSubmissions);
  };

  const handleExport = async () => {
    const csv = await api.exportCsv(assignmentId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grades_assignment_${assignmentId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!assignment)
    return (
      <div className="loading">
        <div className="loading-inner">
          <FileText className="size-6 text-muted-foreground animate-pulse" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(-1)}
            title="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1>Grading: {assignment.title}</h1>
        </div>
        <div className="user-info">
          <span>{user.name}</span>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="size-3.5" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="grading-actions">
        <Button
          onClick={handleAutoGrade}
          className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Zap className="size-4" />
          Auto-Grade Region Questions
        </Button>
        <Button
          onClick={handleExport}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Download className="size-4" />
          Export CSV for Canvas
        </Button>
      </div>

      <div className="grading-layout">
        <div className="submission-list">
          <h3>Submissions ({submissions.length})</h3>
          {submissions.map((s) => (
            <div
              key={s.id}
              className={`submission-row ${
                selectedSub === s.id ? "active" : ""
              }`}
              onClick={() => loadSubmission(s.id)}
            >
              <span className="student-name">{s.student_name}</span>
              <span className="student-pid">{s.student_pid}</span>
              {s.is_submitted ? (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">
                  <CheckCircle2 className="size-3 mr-0.5" />
                  Submitted
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs">
                  <Clock className="size-3 mr-0.5" />
                  In Progress
                </Badge>
              )}
              <span className="score">
                {s.total_score !== null
                  ? `${s.total_score}/${s.max_score}`
                  : `${s.graded_count}/${s.question_count} graded`}
              </span>
            </div>
          ))}
        </div>

        <div className="grading-detail">
          {subDetail ? (
            <div>
              <h3>Answers</h3>
              {assignment.questions.map((q) => {
                const answer = subDetail.answers.find(
                  (a) => a.question_id === q.id
                );
                const gradeKey = `${selectedSub}_${q.id}`;
                const existingGrade = grades[gradeKey];

                return (
                  <div key={q.id} className="grade-item">
                    <div className="grade-question">
                      <Badge variant="secondary" className="text-xs mr-2">
                        Q{q.order + 1}
                      </Badge>
                      {q.prompt}
                      <span className="points">({q.points} pts)</span>
                    </div>
                    <div className="grade-answer">
                      {q.question_type === "free_text" ? (
                        <p className="free-text-answer">
                          {answer?.free_text || "(no answer)"}
                        </p>
                      ) : (
                        <div>
                          {answer?.selected_block_ids?.length ? (
                            <>
                              <p className="grade-answer-label">
                                Selected {answer.selected_block_ids.length} region(s):
                              </p>
                              <p className="grade-answer-text">
                                "{resolveBlockText(answer.selected_block_ids)}"
                              </p>
                            </>
                          ) : (
                            <p className="grade-answer-empty">(no selection)</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grade-input">
                      <input
                        type="number"
                        min="0"
                        max={q.points}
                        step="0.5"
                        placeholder="Score"
                        defaultValue={existingGrade?.score ?? ""}
                        onBlur={(e) =>
                          handleGrade(q.id, e.target.value, "")
                        }
                      />
                      <span>/ {q.points}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <FileText className="size-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p>Select a submission to grade</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
