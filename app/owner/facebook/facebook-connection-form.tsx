"use client";

import { FormEvent, useEffect, useState } from "react";

type ConnectionStatus = {
  configured: boolean;
  pageId: string | null;
  pageName: string | null;
  updatedAt: string | null;
};

const emptyStatus: ConnectionStatus = {
  configured: false,
  pageId: null,
  pageName: null,
  updatedAt: null,
};

export default function FacebookConnectionForm() {
  const [status, setStatus] = useState<ConnectionStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/integrations/facebook", { cache: "no-store" });
        const result = await response.json() as ConnectionStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not check the Facebook connection.");
        if (active) setStatus(result);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not check the Facebook connection.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const appSecret = values.get("appSecret");
    const pageAccessToken = values.get("pageAccessToken");
    form.reset();
    try {
      const response = await fetch("/api/integrations/facebook", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appSecret,
          pageAccessToken,
        }),
      });
      const result = await response.json() as ConnectionStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not connect Facebook.");
      setStatus(result);
      setMessage(`${result.pageName || "Facebook Page"} is securely connected.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect Facebook.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Facebook Messenger from LeadPilot?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/facebook", { method: "DELETE" });
      const result = await response.json() as ConnectionStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not disconnect Facebook.");
      setStatus(result);
      setMessage("Facebook Messenger is disconnected.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect Facebook.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="integration-card" aria-busy={loading || busy}>
      <div className="integration-status">
        <span className={status.configured ? "connection-dot is-connected" : "connection-dot"} />
        <div>
          <strong>{loading ? "Checking connection…" : status.configured ? "Connected" : "Not connected"}</strong>
          <small>
            {status.configured
              ? `${status.pageName} · Page ID ${status.pageId}`
              : "Your secrets stay private and are not returned after saving."}
          </small>
        </div>
      </div>

      <form onSubmit={connect}>
        <label>
          Meta App Secret
          <input
            autoComplete="off"
            minLength={32}
            maxLength={32}
            name="appSecret"
            required
            spellCheck={false}
            type="password"
          />
        </label>
        <label>
          StepFresh Page Access Token
          <input
            autoComplete="off"
            minLength={40}
            maxLength={2000}
            name="pageAccessToken"
            required
            spellCheck={false}
            type="password"
          />
        </label>
        <p className="integration-note">
          LeadPilot verifies the Meta app, token type, StepFresh Page identity,
          and pages_messaging permission before saving.
          Neither value is written to chat, browser storage, logs, or GitHub.
        </p>
        {message ? <p className="form-result form-result-success" role="status">{message}</p> : null}
        {error ? <p className="form-result form-result-error" role="alert">{error}</p> : null}
        <div className="integration-actions">
          <button className="button button-primary" disabled={busy || loading} type="submit">
            {busy ? "Checking with Meta…" : status.configured ? "Replace connection" : "Connect StepFresh"}
          </button>
          {status.configured ? (
            <button className="button button-secondary" disabled={busy} onClick={() => void disconnect()} type="button">
              Disconnect
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
