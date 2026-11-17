"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const DashboardContext = createContext(null);

function csrf() {
  const item = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

export function when(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

export function DashboardProvider({ children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (showLoading = false) => {
    const shouldShowLoading = showLoading || !loadedRef.current;
    if (shouldShowLoading) setLoading(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load service state");
      setState(data);
      setError("");
      loadedRef.current = true;
    } catch (caught) {
      setError(caught.message || "Could not load service state");
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const post = useCallback(async (url, body, successMessage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Request failed");
      setNotice(data.message || successMessage || "Saved.");
      window.setTimeout(refresh, 500);
      return true;
    } catch (caught) {
      setError(caught.message || "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrf() } });
    } finally {
      window.location.assign("/login");
    }
  }, []);

  const value = useMemo(() => ({
    state, loading, busy, error, notice, refresh, post, logout, setError, setNotice,
  }), [state, loading, busy, error, notice, refresh, post, logout]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside DashboardProvider");
  return value;
}
