import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, LogIn } from "lucide-react";

export default function LoginView() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [pid, setPid] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  if (user) {
    navigate("/");
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(pid, code);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Lock className="size-5" />
          </div>
        </div>
        <h1>PaperLock</h1>
        <p className="login-subtitle">Guided Paper Reading</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="pid" className="login-label">Student PID</label>
            <Input
              id="pid"
              type="text"
              placeholder="e.g., A12345678"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              required
              className="login-input"
            />
          </div>
          <div className="login-field">
            <label htmlFor="code" className="login-label">Access Code</label>
            <Input
              id="code"
              type="text"
              placeholder="Enter your access code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="login-input"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <Button
            type="submit"
            className="w-full gap-2 mt-1"
            size="lg"
            disabled={loading}
          >
            <LogIn className="size-4" />
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
