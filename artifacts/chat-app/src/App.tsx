import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Login from "@/pages/Login";
import Workspace from "@/pages/Workspace";

type AuthState = "loading" | "anonymous" | "authenticated";

function App() {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (cancelled) return;
        setAuth(res.authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (cancelled) return;
        setAuth("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (auth === "anonymous") {
    return <Login onAuthenticated={() => setAuth("authenticated")} />;
  }

  return <Workspace onLogout={() => setAuth("anonymous")} />;
}

export default App;
