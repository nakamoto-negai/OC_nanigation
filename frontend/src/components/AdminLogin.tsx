import React, { useState } from "react";
import { api } from "../api/client";

interface Props {
  onLogin: (token: string) => void;
}

export const AdminLogin: React.FC<Props> = ({ onLogin }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await api.admin.login(password);
      localStorage.setItem("admin_token", token);
      onLogin(token);
    } catch {
      setError("パスワードが違います");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <h1 className="admin-login-title">管理者ログイン</h1>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <input
            type="password"
            className="admin-login-input"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="admin-login-error">{error}</p>}
          <button className="admin-login-btn" type="submit" disabled={loading || !password}>
            {loading ? "確認中…" : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
};
