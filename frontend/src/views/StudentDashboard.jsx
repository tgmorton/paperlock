import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut,
  FileText,
  Clock,
  CheckCircle2,
  CircleDashed,
  Pencil,
} from "lucide-react";

function getAssignmentStatus(assignment) {
  // Derive status from assignment data
  if (assignment.is_submitted) return "submitted";
  if (assignment.has_started) return "in_progress";
  return "not_started";
}

function StatusBadge({ assignment }) {
  const status = getAssignmentStatus(assignment);

  if (status === "submitted") {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
        <CheckCircle2 className="size-3 mr-1" />
        Submitted
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
        <Pencil className="size-3 mr-1" />
        In Progress
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <CircleDashed className="size-3 mr-1" />
      Not Started
    </Badge>
  );
}

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.listAssignments().then(setAssignments);
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="flex items-center gap-3">
          <div className="dashboard-logo">
            <FileText className="size-5 text-[var(--pl-primary)]" />
          </div>
          <h1>PaperLock</h1>
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
        <h2 className="dashboard-section-title">Your Assignments</h2>
        {assignments.length === 0 ? (
          <div className="empty-state">
            <FileText className="size-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p>No assignments available yet.</p>
          </div>
        ) : (
          <div className="assignment-grid">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="assignment-card"
                onClick={() => navigate(`/read/${a.id}`)}
              >
                <div className="assignment-card-top">
                  <h3>{a.title}</h3>
                  <StatusBadge assignment={a} />
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
                  {a.available_until && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      Due: {new Date(a.available_until).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
