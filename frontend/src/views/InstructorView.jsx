import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Edit2,
  FileText,
  Upload,
  Users,
  Copy,
  Download,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAssignmentStatus(a) {
  if (!a.available_from && !a.available_until) return "Open";
  const now = new Date();
  if (a.available_from && new Date(a.available_from) > now) return "Upcoming";
  if (a.available_until && new Date(a.available_until) < now) return "Closed";
  return "Active";
}

function statusVariant(status) {
  switch (status) {
    case "Active":
      return "default";
    case "Upcoming":
      return "secondary";
    case "Closed":
      return "destructive";
    case "Open":
      return "outline";
    default:
      return "outline";
  }
}

function StatusIcon({ status }) {
  switch (status) {
    case "Active":
      return <CheckCircle className="size-3" />;
    case "Upcoming":
      return <Clock className="size-3" />;
    case "Closed":
      return <XCircle className="size-3" />;
    default:
      return null;
  }
}

function formatDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(str, len = 100) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback for insecure contexts
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

// ---------------------------------------------------------------------------
// Confirm Dialog (reusable)
// ---------------------------------------------------------------------------

function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, destructive }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: "0.85rem", color: "var(--pl-text-secondary)", lineHeight: 1.5 }}>
          {description}
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

export default function InstructorView() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("assignments");
  const [assignments, setAssignments] = useState([]);
  const [pdfs, setPdfs] = useState([]);

  const loadAssignments = useCallback(() => {
    api.listAssignments().then(setAssignments).catch(console.error);
  }, []);

  const loadPdfs = useCallback(() => {
    api.listPdfs().then(setPdfs).catch(console.error);
  }, []);

  useEffect(() => {
    loadAssignments();
    loadPdfs();
  }, [loadAssignments, loadPdfs]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>PaperLock -- Instructor</h1>
        <div className="user-info">
          <span>{user.name}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={tab === "assignments" ? "active" : ""}
          onClick={() => setTab("assignments")}
        >
          <FileText className="size-4" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
          Assignments
        </button>
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>
          <Upload className="size-4" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
          Upload PDF
        </button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          <Users className="size-4" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
          Students
        </button>
      </nav>

      <main>
        {tab === "assignments" && (
          <AssignmentTab
            assignments={assignments}
            setAssignments={setAssignments}
            pdfs={pdfs}
            refreshAssignments={loadAssignments}
          />
        )}
        {tab === "upload" && (
          <PdfUploadTab pdfs={pdfs} setPdfs={setPdfs} refreshPdfs={loadPdfs} />
        )}
        {tab === "users" && <UsersTab />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignments Tab
// ---------------------------------------------------------------------------

const emptyAssignmentForm = {
  title: "",
  description: "",
  pdf_id: "",
  available_from: "",
  available_until: "",
};

function AssignmentTab({ assignments, setAssignments, pdfs, refreshAssignments }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyAssignmentForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, title: "" });
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const importInputRef = useRef(null);

  const pdfMap = Object.fromEntries(pdfs.map((p) => [p.id, p]));

  // Export an assignment to a portable bundle file (PDF + blocks + questions
  // + answer keys) that can be imported on another PaperLock server.
  const handleExportBundle = async (a) => {
    setExportingId(a.id);
    try {
      const bundle = await api.exportAssignmentBundle(a.id);
      const safe = (a.title || "assignment").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safe}.paperlock.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ type: "success", message: `Exported "${a.title}" as a bundle.` });
    } catch (err) {
      toast({ type: "error", message: err.message || "Export failed" });
    } finally {
      setExportingId(null);
    }
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let bundle;
      try {
        bundle = JSON.parse(text);
      } catch {
        throw new Error("That file isn't a valid PaperLock bundle (not JSON).");
      }
      if (!bundle?.pdf_content_base64 || !Array.isArray(bundle?.questions)) {
        throw new Error("That file isn't a PaperLock assignment bundle.");
      }
      const created = await api.importAssignmentBundle(bundle);
      setAssignments((prev) => [...prev, created]);
      toast({
        type: "success",
        message: `Imported "${created.title}". Set its availability dates when ready.`,
      });
    } catch (err) {
      toast({ type: "error", message: err.message || "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleCreate = async () => {
    if (!form.title || !form.pdf_id) return;
    setSaving(true);
    try {
      const created = await api.createAssignment({
        title: form.title,
        description: form.description,
        pdf_id: parseInt(form.pdf_id),
        available_from: form.available_from ? new Date(form.available_from).toISOString() : null,
        available_until: form.available_until ? new Date(form.available_until).toISOString() : null,
      });
      setAssignments((prev) => [...prev, created]);
      setForm(emptyAssignmentForm);
      setCreateOpen(false);
      toast({ type: "success", message: "Assignment created." });
    } catch (err) {
      toast({ type: "error", message: err.message || "Could not create assignment" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!form.title || !editTarget) return;
    setSaving(true);
    try {
      // pdf_id is intentionally omitted — the PDF can't change after creation.
      const updated = await api.updateAssignment(editTarget.id, {
        title: form.title,
        description: form.description,
        available_from: form.available_from ? new Date(form.available_from).toISOString() : null,
        available_until: form.available_until ? new Date(form.available_until).toISOString() : null,
      });
      setAssignments((prev) => prev.map((a) => (a.id === editTarget.id ? { ...a, ...updated } : a)));
      setEditOpen(false);
      setEditTarget(null);
      setForm(emptyAssignmentForm);
      toast({ type: "success", message: "Assignment updated." });
    } catch (err) {
      toast({ type: "error", message: err.message || "Update failed" });
      refreshAssignments();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (a) => {
    setEditTarget(a);
    setForm({
      title: a.title || "",
      description: a.description || "",
      pdf_id: String(a.pdf_id || ""),
      available_from: toLocalDatetimeValue(a.available_from),
      available_until: toLocalDatetimeValue(a.available_until),
    });
    setEditOpen(true);
  };

  const handleDelete = async (id) => {
    // Optimistic removal
    const prev = assignments;
    setAssignments((a) => a.filter((x) => x.id !== id));
    try {
      await api.deleteAssignment(id);
      toast({ type: "success", message: "Assignment deleted." });
    } catch (err) {
      setAssignments(prev);
      toast({ type: "error", message: err.message || "Could not delete assignment" });
    }
  };

  const assignmentFields = (isEdit) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--pl-text-secondary)" }}>
        Title
        <Input
          value={form.title}
          onChange={(e) => updateField("title", e.target.value)}
          placeholder="e.g. Week 3 Reading"
          style={{ marginTop: 4 }}
        />
      </label>
      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--pl-text-secondary)" }}>
        Description
        <Textarea
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Optional description..."
          rows={2}
          style={{ marginTop: 4 }}
        />
      </label>
      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--pl-text-secondary)" }}>
        PDF
        <select
          value={form.pdf_id}
          onChange={(e) => updateField("pdf_id", e.target.value)}
          disabled={isEdit}
          style={{
            display: "block",
            width: "100%",
            marginTop: 4,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1.5px solid var(--pl-border)",
            background: isEdit ? "var(--pl-bg-sunken)" : "var(--pl-bg)",
            fontSize: "0.85rem",
            color: isEdit ? "var(--pl-text-secondary)" : "var(--pl-text)",
            cursor: isEdit ? "not-allowed" : "pointer",
          }}
        >
          <option value="">Select a PDF...</option>
          {pdfs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.original_name} ({p.page_count} pages)
            </option>
          ))}
        </select>
        {isEdit && (
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--pl-text-secondary)", marginTop: 4, display: "block" }}>
            The PDF can't be changed after creation (questions reference its text). Create a new assignment to use a different PDF.
          </span>
        )}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--pl-text-secondary)" }}>
          Available From
          <Input
            type="datetime-local"
            value={form.available_from}
            onChange={(e) => updateField("available_from", e.target.value)}
            style={{ marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--pl-text-secondary)" }}>
          Available Until
          <Input
            type="datetime-local"
            value={form.available_until}
            onChange={(e) => updateField("available_until", e.target.value)}
            style={{ marginTop: 4 }}
          />
        </label>
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <h2>Assignments</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            title="Import an assignment bundle exported from another PaperLock server"
          >
            <Upload className="size-4" /> {importing ? "Importing..." : "Import"}
          </Button>
          <Button
            onClick={() => {
              setForm(emptyAssignmentForm);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" /> New Assignment
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Assignment</DialogTitle>
          </DialogHeader>
          {assignmentFields(false)}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleCreate} disabled={saving || !form.title || !form.pdf_id}>
              {saving ? "Creating..." : "Create Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
          </DialogHeader>
          {assignmentFields(true)}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleEdit} disabled={saving || !form.title}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm((d) => ({ ...d, open }))}
        title="Delete Assignment"
        description={`Are you sure you want to delete "${deleteConfirm.title}"? This action cannot be undone.`}
        destructive
        onConfirm={() => handleDelete(deleteConfirm.id)}
      />

      {/* Cards */}
      <div className="assignment-grid">
        {assignments.length === 0 && (
          <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>
            No assignments yet. Create one to get started.
          </p>
        )}
        {assignments.map((a) => {
          const status = getAssignmentStatus(a);
          const pdf = pdfMap[a.pdf_id];
          return (
            <div key={a.id} className="assignment-card">
              <div className="assignment-card-top">
                <h3>{a.title}</h3>
                <Badge variant={statusVariant(status)}>
                  <StatusIcon status={status} />
                  {status}
                </Badge>
              </div>
              {a.description && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--pl-text-secondary)",
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {truncate(a.description)}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: "0.75rem",
                  color: "var(--pl-text-secondary)",
                  marginBottom: 12,
                }}
              >
                {pdf && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <FileText className="size-3" /> {pdf.original_name}
                  </span>
                )}
                <span>
                  {a.questions?.length || 0} question{(a.questions?.length || 0) !== 1 ? "s" : ""}
                </span>
                {a.available_from && (
                  <span>
                    <Clock className="size-3" style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }} />
                    {formatDate(a.available_from)} - {formatDate(a.available_until)}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/instructor/assignment/${a.id}/questions`)}
                >
                  <Edit2 className="size-3" /> Edit Questions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/grading/${a.id}`)}
                >
                  <CheckCircle className="size-3" /> Grade
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                  <Edit2 className="size-3" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBundle(a)}
                  disabled={exportingId === a.id}
                  title="Download a portable bundle to import on another server"
                >
                  <Download className="size-3" />{" "}
                  {exportingId === a.id ? "Exporting..." : "Export"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirm({ open: true, id: a.id, title: a.title })}
                >
                  <Trash2 className="size-3" /> Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload PDF Tab
// ---------------------------------------------------------------------------

function PdfUploadTab({ pdfs, setPdfs, refreshPdfs }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // { type: "success" | "error", message }
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: "" });

  const handleUpload = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus({ type: "error", message: "Please select a PDF file." });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      const pdf = await api.uploadPdf(file);
      setPdfs((prev) => [...prev, pdf]);
      // No extractable text layer (e.g. a scanned/image-only PDF) means
      // students will have nothing to select — warn the instructor loudly.
      if (pdf.has_text === false || pdf.block_count === 0) {
        setUploadStatus({
          type: "warning",
          message: `Uploaded "${pdf.original_name}" (${pdf.page_count} pages), but NO selectable text was found. This looks like a scanned/image PDF — region-select questions won't work. Use a text-based PDF.`,
        });
      } else {
        setUploadStatus({
          type: "success",
          message: `Uploaded "${pdf.original_name}" — ${pdf.page_count} pages, ${pdf.block_count} text blocks extracted.`,
        });
      }
    } catch (err) {
      setUploadStatus({ type: "error", message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  };

  const handleDeletePdf = async (id) => {
    const prev = pdfs;
    setPdfs((p) => p.filter((x) => x.id !== id));
    try {
      await api.deletePdf(id);
      toast({ type: "success", message: "PDF deleted." });
    } catch (err) {
      setPdfs(prev);
      toast({ type: "error", message: err.message || "Could not delete PDF" });
    }
  };

  return (
    <div>
      {/* Drag-and-drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: "48px 24px",
          border: `2px dashed ${dragActive ? "var(--pl-primary)" : "var(--pl-border)"}`,
          borderRadius: "var(--radius-lg)",
          background: dragActive ? "var(--pl-primary-soft)" : "var(--pl-bg-raised)",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s ease",
          marginBottom: 24,
        }}
      >
        <Upload
          className="size-10"
          style={{
            margin: "0 auto 12px",
            color: dragActive ? "var(--pl-primary)" : "var(--pl-text-secondary)",
          }}
        />
        <p style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 4 }}>
          {uploading ? "Processing PDF and extracting text blocks..." : "Drop a PDF here, or click to browse"}
        </p>
        <p style={{ fontSize: "0.8rem", color: "var(--pl-text-secondary)" }}>
          PDF files only
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={onFileChange}
          style={{ display: "none" }}
          disabled={uploading}
        />
      </div>

      {/* Upload status */}
      {uploadStatus && (
        <div
          className={`upload-result upload-result-${uploadStatus.type}`}
          style={{ marginBottom: 24 }}
        >
          <p>{uploadStatus.message}</p>
        </div>
      )}

      {/* PDF Table */}
      <div className="section-header">
        <h2>Uploaded PDFs</h2>
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm((d) => ({ ...d, open }))}
        title="Delete PDF"
        description={`Are you sure you want to delete "${deleteConfirm.name}"? This will also remove associated text blocks.`}
        destructive
        onConfirm={() => handleDeletePdf(deleteConfirm.id)}
      />

      {pdfs.length === 0 ? (
        <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>
          No PDFs uploaded yet.
        </p>
      ) : (
        <div className="created-users">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Pages</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pdfs.map((p) => (
                <tr key={p.id}>
                  <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText className="size-4" style={{ color: "var(--pl-primary)", flexShrink: 0 }} />
                    {p.original_name}
                  </td>
                  <td>{p.page_count}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--pl-text-secondary)" }}>
                    {p.created_at ? formatDate(p.created_at) : "--"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/instructor/pdf/${p.id}/blocks`)}
                      >
                        <Edit2 className="size-3" /> Edit Blocks
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setDeleteConfirm({ open: true, id: p.id, name: p.original_name })
                        }
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Tab (Students + TAs)
// ---------------------------------------------------------------------------

function UsersTab() {
  const [students, setStudents] = useState([]);
  const [tas, setTas] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingTas, setLoadingTas] = useState(true);

  const loadStudents = useCallback(() => {
    setLoadingStudents(true);
    api
      .listUsers("student")
      .then(setStudents)
      .catch(console.error)
      .finally(() => setLoadingStudents(false));
  }, []);

  const loadTas = useCallback(() => {
    setLoadingTas(true);
    api
      .listUsers("ta")
      .then(setTas)
      .catch(console.error)
      .finally(() => setLoadingTas(false));
  }, []);

  useEffect(() => {
    loadStudents();
    loadTas();
  }, [loadStudents, loadTas]);

  return (
    <div>
      <CsvImportSection onImported={loadStudents} />
      <StudentTable
        students={students}
        setStudents={setStudents}
        loading={loadingStudents}
        refreshStudents={loadStudents}
      />
      <ExportCodesButton students={students} />
      <hr style={{ border: "none", borderTop: "1px solid var(--pl-border)", margin: "32px 0" }} />
      <TaSection tas={tas} setTas={setTas} loading={loadingTas} refreshTas={loadTas} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

function CsvImportSection({ onImported }) {
  const [parsedStudents, setParsedStudents] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const parseCsv = (text) => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];

    // Parse header
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const studentIdx = headers.findIndex((h) => /^student$/i.test(h));
    const sisUserIdx = headers.findIndex((h) => /^sis user id$/i.test(h));
    const idIdx = headers.findIndex((h) => /^id$/i.test(h));
    const pidIdx = sisUserIdx >= 0 ? sisUserIdx : idIdx;

    if (studentIdx < 0 || pidIdx < 0) return [];

    const result = [];
    for (let i = 1; i < lines.length; i++) {
      // Handle CSV values that might contain commas inside quotes
      const values = [];
      let current = "";
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      values.push(current.trim());

      const name = (values[studentIdx] || "").replace(/^"|"$/g, "").trim();
      const pid = (values[pidIdx] || "").replace(/^"|"$/g, "").trim();
      if (name && pid) {
        result.push({ name, pid });
      }
    }
    return result;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCsv(ev.target.result);
      setParsedStudents(parsed.length > 0 ? parsed : null);
      if (parsed.length === 0) {
        setImportResult({
          type: "error",
          message: "Could not parse students from CSV. Check that headers include 'Student' and 'SIS User ID' or 'ID'.",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!parsedStudents?.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.batchCreateUsers(
        parsedStudents.map((s) => ({ pid: s.pid, name: s.name, role: "student" }))
      );
      const created = Array.isArray(result) ? result.length : result.created || 0;
      const skipped = parsedStudents.length - created;
      setImportResult({
        type: "success",
        message: `Imported ${created} student${created !== 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ""}.`,
      });
      setParsedStudents(null);
      onImported();
    } catch (err) {
      setImportResult({ type: "error", message: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-header">
        <h2>Import from Canvas CSV</h2>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" /> Choose CSV File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <span style={{ fontSize: "0.8rem", color: "var(--pl-text-secondary)" }}>
          Export your gradebook from Canvas and upload here
        </span>
      </div>

      {parsedStudents && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: "0.85rem", marginBottom: 8, fontWeight: 600 }}>
            Preview: {parsedStudents.length} students found
          </p>
          <div
            style={{
              maxHeight: 200,
              overflow: "auto",
              border: "1px solid var(--pl-border)",
              borderRadius: "var(--radius-sm)",
              marginBottom: 12,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: "6px 12px",
                      textAlign: "left",
                      background: "var(--pl-bg-sunken)",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "6px 12px",
                      textAlign: "left",
                      background: "var(--pl-bg-sunken)",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    PID
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsedStudents.slice(0, 20).map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 12px", borderTop: "1px solid var(--pl-border)" }}>
                      {s.name}
                    </td>
                    <td style={{ padding: "4px 12px", borderTop: "1px solid var(--pl-border)" }}>
                      {s.pid}
                    </td>
                  </tr>
                ))}
                {parsedStudents.length > 20 && (
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: "4px 12px",
                        borderTop: "1px solid var(--pl-border)",
                        color: "var(--pl-text-secondary)",
                        fontStyle: "italic",
                      }}
                    >
                      ...and {parsedStudents.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Button onClick={handleImport} disabled={importing}>
            {importing ? "Importing..." : `Import ${parsedStudents.length} Students`}
          </Button>
        </div>
      )}

      {importResult && (
        <div className={`upload-result upload-result-${importResult.type}`}>
          <p>{importResult.message}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Table
// ---------------------------------------------------------------------------

function StudentTable({ students, setStudents, loading, refreshStudents }) {
  const { toast } = useToast();
  const [addForm, setAddForm] = useState({ pid: "", name: "" });
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: "" });
  const [resetConfirm, setResetConfirm] = useState({ open: false, id: null, name: "" });

  const handleAdd = async () => {
    if (!addForm.pid || !addForm.name) return;
    setAdding(true);
    try {
      const user = await api.createUser({ pid: addForm.pid, name: addForm.name, role: "student" });
      setStudents((prev) => [...prev, user]);
      setAddForm({ pid: "", name: "" });
      toast({ type: "success", message: `Added ${user.name}.` });
    } catch (err) {
      toast({ type: "error", message: err.message || "Could not add student" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    const prev = students;
    setStudents((s) => s.filter((x) => x.id !== id));
    try {
      await api.deleteUser(id);
      toast({ type: "success", message: "Student removed." });
    } catch (err) {
      setStudents(prev);
      toast({ type: "error", message: err.message || "Could not remove student" });
    }
  };

  const handleResetCode = async (id) => {
    try {
      const updated = await api.resetUserCode(id);
      setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
      toast({ type: "success", message: "Access code regenerated." });
    } catch (err) {
      toast({ type: "error", message: err.message || "Could not reset code" });
    }
  };

  const handleCopy = (code, id) => {
    copyToClipboard(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2>Students</h2>
        <Badge variant="secondary">{students.length}</Badge>
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm((d) => ({ ...d, open }))}
        title="Delete Student"
        description={`Remove "${deleteConfirm.name}" from the course? This cannot be undone.`}
        destructive
        onConfirm={() => handleDelete(deleteConfirm.id)}
      />

      <ConfirmDialog
        open={resetConfirm.open}
        onOpenChange={(open) => setResetConfirm((d) => ({ ...d, open }))}
        title="Reset Access Code"
        description={`Generate a new access code for "${resetConfirm.name}"? Their old code will stop working.`}
        onConfirm={() => handleResetCode(resetConfirm.id)}
      />

      {loading ? (
        <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>Loading students...</p>
      ) : students.length === 0 ? (
        <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>
          No students yet. Import from Canvas or add individually below.
        </p>
      ) : (
        <div className="created-users">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PID</th>
                <th>Access Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <code style={{ fontSize: "0.8rem" }}>{s.pid}</code>
                  </td>
                  <td>
                    <code
                      style={{
                        background: "var(--pl-primary-soft)",
                        color: "var(--pl-primary)",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {s.access_code}
                    </code>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCopy(s.access_code, s.id)}
                        title="Copy access code"
                      >
                        {copiedId === s.id ? <CheckCircle className="size-3.5" /> : <Copy className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setResetConfirm({ open: true, id: s.id, name: s.name })}
                        title="Reset access code"
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteConfirm({ open: true, id: s.id, name: s.name })}
                        title="Delete student"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add individual student */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid var(--pl-border)",
        }}
      >
        <Input
          placeholder="PID (e.g., A12345678)"
          value={addForm.pid}
          onChange={(e) => setAddForm((f) => ({ ...f, pid: e.target.value }))}
          style={{ maxWidth: 200 }}
        />
        <Input
          placeholder="Name"
          value={addForm.name}
          onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
          style={{ maxWidth: 240 }}
        />
        <Button
          variant="outline"
          onClick={handleAdd}
          disabled={adding || !addForm.pid || !addForm.name}
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export Codes Button
// ---------------------------------------------------------------------------

function ExportCodesButton({ students }) {
  const handleExport = () => {
    if (students.length === 0) return;
    const loginUrl = `${window.location.origin}${import.meta.env.BASE_URL}login`;
    const rows = [
      "Name,PID,Access Code,Login URL",
      ...students.map(
        (s) => `"${s.name}","${s.pid}","${s.access_code}","${loginUrl}"`
      ),
    ];
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "paperlock_access_codes.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <Button variant="outline" onClick={handleExport} disabled={students.length === 0}>
        <Download className="size-4" /> Export Codes CSV
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TA Section
// ---------------------------------------------------------------------------

function TaSection({ tas, setTas, loading, refreshTas }) {
  const { toast } = useToast();
  const [addForm, setAddForm] = useState({ pid: "", name: "" });
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: "" });

  const handleAdd = async () => {
    if (!addForm.pid || !addForm.name) return;
    setAdding(true);
    try {
      const user = await api.createUser({ pid: addForm.pid, name: addForm.name, role: "ta" });
      setTas((prev) => [...prev, user]);
      setAddForm({ pid: "", name: "" });
      toast({ type: "success", message: `Added ${user.name}.` });
    } catch (err) {
      toast({ type: "error", message: err.message || "Could not add TA" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    const prev = tas;
    setTas((t) => t.filter((x) => x.id !== id));
    try {
      await api.deleteUser(id);
      toast({ type: "success", message: "TA removed." });
    } catch (err) {
      setTas(prev);
      toast({ type: "error", message: err.message || "Could not remove TA" });
    }
  };

  const handleCopy = (code, id) => {
    copyToClipboard(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <div className="section-header">
        <h2>Teaching Assistants</h2>
        <Badge variant="secondary">{tas.length}</Badge>
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm((d) => ({ ...d, open }))}
        title="Delete TA"
        description={`Remove "${deleteConfirm.name}"? This cannot be undone.`}
        destructive
        onConfirm={() => handleDelete(deleteConfirm.id)}
      />

      {loading ? (
        <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>Loading TAs...</p>
      ) : tas.length > 0 ? (
        <div className="created-users">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PID</th>
                <th>Access Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tas.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <code style={{ fontSize: "0.8rem" }}>{t.pid}</code>
                  </td>
                  <td>
                    <code
                      style={{
                        background: "var(--pl-primary-soft)",
                        color: "var(--pl-primary)",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {t.access_code}
                    </code>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCopy(t.access_code, t.id)}
                        title="Copy access code"
                      >
                        {copiedId === t.id ? <CheckCircle className="size-3.5" /> : <Copy className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteConfirm({ open: true, id: t.id, name: t.name })}
                        title="Delete TA"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--pl-text-secondary)", fontSize: "0.85rem" }}>No TAs added yet.</p>
      )}

      {/* Add TA form */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid var(--pl-border)",
        }}
      >
        <Input
          placeholder="PID"
          value={addForm.pid}
          onChange={(e) => setAddForm((f) => ({ ...f, pid: e.target.value }))}
          style={{ maxWidth: 200 }}
        />
        <Input
          placeholder="Name"
          value={addForm.name}
          onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
          style={{ maxWidth: 240 }}
        />
        <Button
          variant="outline"
          onClick={handleAdd}
          disabled={adding || !addForm.pid || !addForm.name}
        >
          <Plus className="size-4" /> Add TA
        </Button>
      </div>
    </div>
  );
}
