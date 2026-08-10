import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import abmLogo from "@/assets/abm-logo.png";

interface Props {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#FAF5E9" }}>

      {/* ABM Header */}
      <div style={{ marginBottom: "36px", textAlign: "center" }}>
        <img src={abmLogo} alt="A Brilliant Mind" style={{ height: "72px", objectFit: "contain", display: "block", margin: "0 auto" }} />
        {/* Color accent bar */}
        <div style={{ display: "flex", height: "3px", marginTop: "12px", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#7ECECE" }} />
          <div style={{ flex: 1, background: "#F09090" }} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: "360px", background: "#FFFFFF", border: "1px solid #EDE0C4", borderRadius: "12px", boxShadow: "0 2px 12px rgba(44,36,21,0.08)", padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}
      >
        <div>
          <div style={{ fontSize: "17px", fontWeight: 600, color: "#2C2415" }}>Welcome back</div>
          <div style={{ fontSize: "13px", color: "#9A8A72", marginTop: "3px" }}>Enter your password to continue.</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="password" style={{ fontSize: "13px", fontWeight: 500, color: "#2C2415" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ height: "40px", padding: "0 12px", borderRadius: "10px", border: "1.5px solid #D4C4A0", background: "#FFFDF5", fontSize: "14px", outline: "none", color: "#2C2415", fontFamily: "inherit", transition: "border-color 0.15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#C87C2A"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#D4C4A0"; }}
          />
        </div>

        {error && (
          <div style={{ fontSize: "13px", color: "#c0392b", padding: "8px 12px", background: "#fff5f5", border: "1px solid #f5c6c6", borderRadius: "8px" }} role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          style={{ height: "42px", borderRadius: "21px", background: "#C87C2A", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: loading || password.length === 0 ? "not-allowed" : "pointer", opacity: loading || password.length === 0 ? 0.55 : 1, transition: "opacity 0.15s", fontFamily: "inherit" }}
        >
          {loading ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
