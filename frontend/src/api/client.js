const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("paperlock_token");
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event("session-expired"));
    }
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Request failed");
  }

  if (res.headers.get("content-type")?.includes("text/csv")) {
    return res.text();
  }
  return res.json();
}

export const api = {
  // Auth
  login: (pid, access_code) =>
    request("/auth/login", { method: "POST", body: { pid, access_code } }),
  me: () => request("/auth/me"),
  createUser: (data) =>
    request("/auth/users", { method: "POST", body: data }),
  batchCreateUsers: (students) =>
    request("/auth/users/batch", { method: "POST", body: { students } }),

  // PDF
  uploadPdf: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/pdf/upload", { method: "POST", body: form });
  },
  getPdfUrl: (pdfId) => {
    const token = localStorage.getItem("paperlock_token");
    return `${API_BASE}/pdf/${pdfId}/serve?token=${token}`;
  },
  getBlocks: (pdfId) => request(`/pdf/${pdfId}/blocks`),
  mergeBlocks: (blockIds) =>
    request("/pdf/blocks/merge", { method: "POST", body: blockIds }),
  updateBlockGroup: (blockId, groupId) =>
    request(`/pdf/blocks/${blockId}/group?group_id=${groupId}`, { method: "PATCH" }),

  // Assignments
  listAssignments: () => request("/assignments/"),
  getAssignment: (id) => request(`/assignments/${id}`),
  createAssignment: (data) =>
    request("/assignments/", { method: "POST", body: data }),
  addQuestion: (assignmentId, data) =>
    request(`/assignments/${assignmentId}/questions`, { method: "POST", body: data }),

  // Submissions
  startSubmission: (assignmentId) =>
    request(`/submissions/start/${assignmentId}`, { method: "POST" }),
  getSubmission: (id) => request(`/submissions/${id}`),
  saveAnswer: (submissionId, data) =>
    request(`/submissions/${submissionId}/answer`, { method: "PUT", body: data }),
  submit: (submissionId) =>
    request(`/submissions/${submissionId}/submit`, { method: "POST" }),

  // Annotations
  getAnnotations: (pdfId) => request(`/submissions/annotations/${pdfId}`),
  createAnnotation: (data) =>
    request("/submissions/annotations", { method: "POST", body: data }),
  deleteAnnotation: (id) =>
    request(`/submissions/annotations/${id}`, { method: "DELETE" }),

  // Grading
  listSubmissions: (assignmentId) =>
    request(`/grading/assignments/${assignmentId}/submissions`),
  gradeQuestion: (data) =>
    request("/grading/grade", { method: "POST", body: data }),
  autoGrade: (assignmentId) =>
    request(`/grading/auto-grade/${assignmentId}`, { method: "POST" }),
  exportCsv: (assignmentId) =>
    request(`/grading/export/${assignmentId}`),

  // PDF management
  listPdfs: () => request("/pdf/"),
  deletePdf: (id) => request(`/pdf/${id}`, { method: "DELETE" }),
  splitBlocks: (groupId) =>
    request("/pdf/blocks/split", { method: "POST", body: { group_id: groupId } }),

  // Assignment management
  updateAssignment: (id, data) =>
    request(`/assignments/${id}`, { method: "PUT", body: data }),
  deleteAssignment: (id) =>
    request(`/assignments/${id}`, { method: "DELETE" }),
  updateQuestion: (assignmentId, questionId, data) =>
    request(`/assignments/${assignmentId}/questions/${questionId}`, { method: "PUT", body: data }),
  deleteQuestion: (assignmentId, questionId) =>
    request(`/assignments/${assignmentId}/questions/${questionId}`, { method: "DELETE" }),

  // User management
  listUsers: (role) => request(`/auth/users${role ? `?role=${role}` : ""}`),
  updateUser: (id, data) =>
    request(`/auth/users/${id}`, { method: "PATCH", body: data }),
  deleteUser: (id) =>
    request(`/auth/users/${id}`, { method: "DELETE" }),
  resetUserCode: (id) =>
    request(`/auth/users/${id}/reset-code`, { method: "POST" }),
};
