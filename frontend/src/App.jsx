import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import SessionExpiredModal from "./components/SessionExpiredModal";
import LoginView from "./views/LoginView";
import StudentDashboard from "./views/StudentDashboard";
import ReaderView from "./views/ReaderView";
import InstructorView from "./views/InstructorView";
import GradingView from "./views/GradingView";
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
      <AuthProvider>
        <SessionExpiredModal />
        <BrowserRouter>
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
              path="/grading/:assignmentId"
              element={
                <ProtectedRoute allowedRoles={["instructor", "ta"]}>
                  <GradingView />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
