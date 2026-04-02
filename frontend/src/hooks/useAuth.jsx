import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("paperlock_token");
    if (token) {
      api.me()
        .then(setUser)
        .catch(() => localStorage.removeItem("paperlock_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (pid, accessCode) => {
    const res = await api.login(pid, accessCode);
    localStorage.setItem("paperlock_token", res.token);
    setUser({ id: res.user_id, name: res.name, role: res.role, pid });
    return res;
  };

  const logout = () => {
    localStorage.removeItem("paperlock_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
