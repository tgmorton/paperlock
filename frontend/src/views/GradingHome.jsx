import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { Button } from "@/components/ui/button";
import { LogOut, FileText, ClipboardCheck, ChevronRight } from "lucide-react";

export default function GradingHome() {
  const [assignments, setAssignments] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    api
      .listAssignments()
      .then(setAssignments)
      .catch((err) => {
        setAssignments([]);
        toast({ type: "error", message: err.message || "Failed to load assignments" });
      });
  }, [toast]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <div className="dashboard-logo">
            <ClipboardCheck className="size-5 text-[var(--pl-primary)]" />
          </div>
          <h1>Grading</h1>
        </div>
        <div className="user-info">
          <span>{user.name}</span>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="size-3.5" />
            Sign Out
          </Button>
        </div>
      </header>
      <main>
        <h2 className="dashboard-section-title">Select an assignment to grade</h2>
        {assignments === null ? (
          <div className="empty-state">
            <FileText className="size-8 text-muted-foreground mx-auto mb-3 opacity-40 animate-pulse" />
            <p>Loading assignments…</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <FileText className="size-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p>No assignments to grade yet.</p>
          </div>
        ) : (
          <div className="assignment-grid">
            {assignments.map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className="assignment-card"
                onClick={() => navigate(`/grading/${a.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/grading/${a.id}`);
                  }
                }}
              >
                <div className="assignment-card-top">
                  <h3>{a.title}</h3>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
                {a.description && (
                  <p className="assignment-description">{a.description}</p>
                )}
                <div className="assignment-meta">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5" />
                    {a.questions.length} question
                    {a.questions.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
