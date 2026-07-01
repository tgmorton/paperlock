import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import SessionExpiredModal from "./components/SessionExpiredModal";
import { ToastProvider } from "./components/Toast";
import LoginView from "./views/LoginView";
import StudentDashboard from "./views/StudentDashboard";
import ReaderView from "./views/ReaderView";
import InstructorView from "./views/InstructorView";
import GradingHome from "./views/GradingHome";
import GradingView from "./views/GradingView";
import QuestionBuilderView from "./views/QuestionBuilderView";
import BlockEditorView from "./views/BlockEditorView";
import "./App.css";

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  return children;
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role === "instructor") return <Navigate to="/instructor" />;
  if (user.role === "ta") return <Navigate to="/grading" />;
  return <Navigate to="/dashboard" />;
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <SessionExpiredModal />
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"}>
            <Routes>
              <Route path="/login" element={<LoginView />} />
            <Route path="/" element={<RoleRouter />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/read/:assignmentId"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <ReaderView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor"
              element={
                <ProtectedRoute allowedRoles={["instructor"]}>
                  <InstructorView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/assignment/:assignmentId/questions"
              element={
                <ProtectedRoute allowedRoles={["instructor"]}>
                  <QuestionBuilderView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/pdf/:pdfId/blocks"
              element={
                <ProtectedRoute allowedRoles={["instructor"]}>
                  <BlockEditorView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/grading"
              element={
                <ProtectedRoute allowedRoles={["instructor", "ta"]}>
                  <GradingHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/grading/:assignmentId"
              element={
                <ProtectedRoute allowedRoles={["instructor", "ta"]}>
                  <GradingView />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
