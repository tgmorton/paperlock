import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export default function InstructorView() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("assignments"); // "assignments" | "upload" | "users"
  const [assignments, setAssignments] = useState([]);
  const [pdfs, setPdfs] = useState([]);

  useEffect(() => {
    api.listAssignments().then(setAssignments);
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>PaperLock — Instructor</h1>
        <div className="user-info">
          <span>{user.name}</span>
          <button onClick={logout}>Sign Out</button>
        </div>
      </header>

      <nav className="tab-nav">
        <button className={tab === "assignments" ? "active" : ""} onClick={() => setTab("assignments")}>
          Assignments
        </button>
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>
          Upload PDF
        </button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          Students
        </button>
      </nav>

      <main>
        {tab === "upload" && <PdfUpload onUploaded={(pdf) => setPdfs((p) => [...p, pdf])} />}
        {tab === "assignments" && <AssignmentManager assignments={assignments} />}
        {tab === "users" && <UserManager />}
      </main>
    </div>
  );
}

function PdfUpload({ onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const pdf = await api.uploadPdf(file);
      setResult(pdf);
      onUploaded(pdf);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-section">
      <h2>Upload a Paper</h2>
      <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} />
      {uploading && <p>Processing PDF and extracting text blocks...</p>}
      {result && (
        <div className="upload-result">
          <p>Uploaded: {result.original_name}</p>
          <p>{result.page_count} pages, text blocks extracted</p>
          <p>PDF ID: {result.id} — use this when creating assignments</p>
        </div>
      )}
    </div>
  );
}

function AssignmentManager({ assignments }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", pdf_id: "" });

  const handleCreate = async () => {
    if (!form.title || !form.pdf_id) return;
    try {
      await api.createAssignment({
        title: form.title,
        description: form.description,
        pdf_id: parseInt(form.pdf_id),
      });
      setShowCreate(false);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2>Assignments</h2>
        <button onClick={() => setShowCreate(!showCreate)}>+ New Assignment</button>
      </div>

      {showCreate && (
        <div className="create-form">
          <input
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            placeholder="PDF ID"
            type="number"
            value={form.pdf_id}
            onChange={(e) => setForm({ ...form, pdf_id: e.target.value })}
          />
          <button onClick={handleCreate}>Create</button>
        </div>
      )}

      <div className="assignment-grid">
        {assignments.map((a) => (
          <div key={a.id} className="assignment-card">
            <h3>{a.title}</h3>
            <p>{a.questions.length} questions</p>
            <a href={`/instructor/assignment/${a.id}`}>Edit Questions</a>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserManager() {
  const [form, setForm] = useState({ pid: "", name: "", role: "student" });
  const [created, setCreated] = useState([]);

  const handleCreate = async () => {
    if (!form.pid || !form.name) return;
    try {
      const user = await api.createUser(form);
      setCreated((prev) => [...prev, user]);
      setForm({ pid: "", name: "", role: "student" });
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h2>Add Users</h2>
      <div className="create-form">
        <input
          placeholder="PID (e.g., A12345678)"
          value={form.pid}
          onChange={(e) => setForm({ ...form, pid: e.target.value })}
        />
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="student">Student</option>
          <option value="ta">TA</option>
          <option value="instructor">Instructor</option>
        </select>
        <button onClick={handleCreate}>Add User</button>
      </div>

      {created.length > 0 && (
        <div className="created-users">
          <h3>Created Users</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>PID</th><th>Role</th><th>Access Code</th></tr>
            </thead>
            <tbody>
              {created.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.pid}</td>
                  <td>{u.role}</td>
                  <td><code>{u.access_code}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
