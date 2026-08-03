"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type EmbeddedSignupConfig = {
  ready: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  featureType: "whatsapp_business_app_onboarding";
};

type ConnectionStatus = {
  configured: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectionMode: "coexistence" | "test" | null;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
  embeddedSignup: EmbeddedSignupConfig;
};

type EmbeddedSignupSession = {
  wabaId: string;
  phoneNumberId: string;
};

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
  status?: string;
};

type FacebookSdk = {
  init(config: {
    appId: string;
    autoLogAppEvents: boolean;
    cookie: boolean;
    version: string;
    xfbml: boolean;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const emptyStatus: ConnectionStatus = {
  configured: false,
  wabaId: null,
  phoneNumberId: null,
  displayPhoneNumber: null,
  verifiedName: null,
  connectionMode: null,
  tokenExpiresAt: null,
  updatedAt: null,
  embeddedSignup: {
    ready: false,
    appId: null,
    configId: null,
    graphVersion: "v26.0",
    featureType: "whatsapp_business_app_onboarding",
  },
};

export default function WhatsAppConnectionForm() {
  const [status, setStatus] = useState<ConnectionStatus>(emptyStatus);
  const [setupMode, setSetupMode] = useState<"test" | "coexistence">("test");
  const [verifyToken, setVerifyToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sessionRef = useRef<EmbeddedSignupSession | null>(null);
  const sessionWaiterRef = useRef<((session: EmbeddedSignupSession) => void) | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVerifyToken(createVerifyToken()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/integrations/whatsapp", { cache: "no-store" });
        const result = await response.json() as ConnectionStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not check the WhatsApp connection.");
        if (active) setStatus(result);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not check the WhatsApp connection.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!status.embeddedSignup.ready || !status.embeddedSignup.appId) return;
    let active = true;
    const initialize = () => {
      if (!active || !window.FB || !status.embeddedSignup.appId) return;
      window.FB.init({
        appId: status.embeddedSignup.appId,
        autoLogAppEvents: true,
        cookie: true,
        xfbml: false,
        version: status.embeddedSignup.graphVersion,
      });
      setSdkReady(true);
    };
    window.fbAsyncInit = initialize;
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      initialize();
    } else {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onerror = () => {
        if (active) setError("Meta's secure connection could not load. Check your connection and try again.");
      };
      document.head.appendChild(script);
    }
    return () => {
      active = false;
      if (window.fbAsyncInit === initialize) delete window.fbAsyncInit;
    };
  }, [
    status.embeddedSignup.appId,
    status.embeddedSignup.graphVersion,
    status.embeddedSignup.ready,
  ]);

  useEffect(() => {
    function captureEmbeddedSignup(event: MessageEvent) {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!isRecord(payload) || payload.type !== "WA_EMBEDDED_SIGNUP") return;
      if (!isRecord(payload.data)) return;
      if (payload.event === "CANCEL") {
        setBusy(false);
        setError("WhatsApp connection was cancelled. Your existing WhatsApp Business app was not changed.");
        return;
      }
      if (payload.event === "ERROR") {
        setBusy(false);
        setError("Meta could not complete WhatsApp connection. Review the Meta message and try again.");
        return;
      }
      if (!["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"].includes(String(payload.event))) return;
      const wabaId = normalizeMetaId(payload.data.waba_id);
      const phoneNumberId = normalizeMetaId(payload.data.phone_number_id);
      if (!wabaId || !phoneNumberId) {
        setBusy(false);
        setError("Meta finished without returning the WhatsApp account and phone. Start again.");
        return;
      }
      const session = { wabaId, phoneNumberId };
      sessionRef.current = session;
      sessionWaiterRef.current?.(session);
      sessionWaiterRef.current = null;
    }
    window.addEventListener("message", captureEmbeddedSignup);
    return () => window.removeEventListener("message", captureEmbeddedSignup);
  }, []);

  function waitForSession() {
    if (sessionRef.current) return Promise.resolve(sessionRef.current);
    return new Promise<EmbeddedSignupSession>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        sessionWaiterRef.current = null;
        reject(new Error("Meta did not return the selected WhatsApp number. Start the secure connection again."));
      }, 15_000);
      sessionWaiterRef.current = (session) => {
        window.clearTimeout(timeout);
        resolve(session);
      };
    });
  }

  function connect() {
    const sdk = window.FB;
    const config = status.embeddedSignup;
    if (!sdk || !sdkReady || !config.appId || !config.configId) {
      setError("The secure Meta connection is not ready yet. Refresh this page and try again.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    sessionRef.current = null;
    sdk.login((response) => {
      void (async () => {
        const code = response.authResponse?.code?.trim();
        if (!code) {
          throw new Error("Meta sign-in was closed or not authorized. Your WhatsApp Business app was not changed.");
        }
        const session = await waitForSession();
        const connectionResponse = await fetch("/api/integrations/whatsapp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code,
            wabaId: session.wabaId,
            phoneNumberId: session.phoneNumberId,
          }),
        });
        const result = await connectionResponse.json() as ConnectionStatus & { error?: string };
        if (!connectionResponse.ok) {
          throw new Error(result.error || "Could not connect WhatsApp.");
        }
        setStatus({ ...result, embeddedSignup: config });
        setMessage(`${result.verifiedName || "WhatsApp Business"} is connected. LeadPilot can now capture customer replies.`);
      })().catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not connect WhatsApp.");
      }).finally(() => setBusy(false));
    }, {
      config_id: config.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: config.featureType,
        sessionInfoVersion: "3",
      },
    });
  }

  async function connectTestNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const accessToken = values.get("accessToken");
    const wabaId = values.get("wabaId");
    const phoneNumberId = values.get("phoneNumberId");
    try {
      const response = await fetch("/api/integrations/whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken,
          wabaId,
          phoneNumberId,
          verifyToken,
        }),
      });
      const result = await response.json() as Omit<ConnectionStatus, "embeddedSignup"> & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Could not connect Meta's test number.");
      setStatus({ ...result, embeddedSignup: status.embeddedSignup });
      setMessage(
        `${result.verifiedName || "Meta test number"} is connected. Complete the webhook steps below, then send the first test message.`,
      );
      const tokenInput = form.querySelector<HTMLInputElement>('[name="accessToken"]');
      if (tokenInput) tokenInput.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect Meta's test number.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const prompt = status.connectionMode === "test"
      ? "Disconnect Meta's temporary WhatsApp test number from LeadPilot?"
      : "Disconnect WhatsApp Business from LeadPilot? Your WhatsApp Business phone app will remain active.";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/whatsapp", { method: "DELETE" });
      const result = await response.json() as Omit<ConnectionStatus, "embeddedSignup"> & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not disconnect WhatsApp.");
      setStatus({ ...result, embeddedSignup: status.embeddedSignup });
      setMessage(status.connectionMode === "test"
        ? "Meta's temporary test number is disconnected."
        : "WhatsApp Business is disconnected from LeadPilot. The phone app was not changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  const connectionReady = status.embeddedSignup.ready && sdkReady;
  const tokenExpiry = status.tokenExpiresAt
    ? new Date(status.tokenExpiresAt)
    : null;
  const webhookUrl = "https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/api/webhooks/whatsapp";

  return (
    <section className="integration-card" aria-busy={loading || busy}>
      <div className="integration-status">
        <span className={status.configured ? "connection-dot is-connected" : "connection-dot"} />
        <div>
          <strong>{loading ? "Checking connection…" : status.configured ? "Connected" : "Not connected"}</strong>
          <small>
            {status.configured
              ? `${status.connectionMode === "test" ? "Meta temporary test number" : "WhatsApp Business coexistence"} · ${status.verifiedName} · ${status.displayPhoneNumber}`
              : "Choose the temporary test number now or the verified StepFresh number later."}
          </small>
        </div>
      </div>

      <div className="integration-mode-switch" role="tablist" aria-label="WhatsApp connection method">
        <button
          aria-selected={setupMode === "test"}
          className={setupMode === "test" ? "is-active" : ""}
          onClick={() => setSetupMode("test")}
          role="tab"
          type="button"
        >
          <span>Available now</span>
          <strong>Meta test number</strong>
          <small>Test the full order flow without business verification.</small>
        </button>
        <button
          aria-selected={setupMode === "coexistence"}
          className={setupMode === "coexistence" ? "is-active" : ""}
          onClick={() => setSetupMode("coexistence")}
          role="tab"
          type="button"
        >
          <span>After verification</span>
          <strong>Existing StepFresh number</strong>
          <small>Keep the WhatsApp Business phone app through coexistence.</small>
        </button>
      </div>

      {message ? <p className="form-result form-result-success integration-result" role="status">{message}</p> : null}
      {error ? <p className="form-result form-result-error integration-result" role="alert">{error}</p> : null}

      {setupMode === "test" ? (
        <div className="test-number-panel" role="tabpanel">
          <div className="test-mode-banner">
            <div>
              <span>Recommended for this test</span>
              <strong>No effect on your StepFresh WhatsApp number</strong>
            </div>
            <p>Use the values shown in Meta App Dashboard → WhatsApp → API Setup. The temporary token is encrypted immediately and is never returned.</p>
          </div>

          <form onSubmit={connectTestNumber}>
            <label>
              Temporary access token
              <input
                autoComplete="off"
                maxLength={4000}
                minLength={40}
                name="accessToken"
                required
                spellCheck={false}
                type="password"
              />
              <small>Copy the full temporary token from Meta. It normally expires quickly, so use the current one.</small>
            </label>
            <div className="integration-field-grid">
              <label>
                Phone Number ID
                <input inputMode="numeric" maxLength={30} minLength={5} name="phoneNumberId" pattern="[0-9]+" required />
              </label>
              <label>
                WhatsApp Business Account ID
                <input inputMode="numeric" maxLength={30} minLength={5} name="wabaId" pattern="[0-9]+" required />
              </label>
            </div>
            <label>
              Webhook verification token
              <div className="copy-field">
                <input name="verifyToken" readOnly spellCheck={false} value={verifyToken} />
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(verifyToken);
                    setTokenCopied(true);
                  }}
                  type="button"
                >
                  {tokenCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <small>Copy this value now. You will paste the same value into Meta’s webhook configuration.</small>
            </label>
            <p className="integration-note">
              LeadPilot verifies the Meta app, permissions, test phone identity,
              WABA ownership, and webhook subscription before saving. No App
              Secret is requested because the existing server-side secret is reused.
            </p>
            <div className="integration-actions">
              <button className="button button-whatsapp-connect" disabled={busy || loading || !verifyToken} type="submit">
                {busy ? "Verifying with Meta…" : status.connectionMode === "test" ? "Refresh test connection" : "Verify & connect test number"}
              </button>
              {status.configured ? (
                <button className="button button-secondary" disabled={busy} onClick={() => void disconnect()} type="button">
                  Disconnect current connection
                </button>
              ) : null}
            </div>
          </form>

          {status.connectionMode === "test" ? (
            <div className="test-checklist">
              <div className="token-expiry">
                <strong>Temporary connection active</strong>
                <span>
                  {tokenExpiry
                    ? `Token expiry reported by Meta: ${tokenExpiry.toLocaleString()}. Refresh it from API Setup when it expires.`
                    : "Meta did not report an expiry time. Refresh the token if sending stops."}
                </span>
              </div>
              <h2>Finish the real-message test</h2>
              <ol className="integration-steps">
                <li><span>1</span><div><strong>Configure the WhatsApp webhook in Meta</strong><small>Callback URL: <code>{webhookUrl}</code></small></div></li>
                <li><span>2</span><div><strong>Paste the verification token</strong><small>Use the exact value copied from the field above, then subscribe to the <code>messages</code> field.</small></div></li>
                <li><span>3</span><div><strong>Add your own WhatsApp as a test recipient</strong><small>In API Setup, verify your number and send Meta’s first template message.</small></div></li>
                <li><span>4</span><div><strong>Reply with a StepFresh order</strong><small>LeadPilot should create the order automatically and prepare an owner-approved response.</small></div></li>
              </ol>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="embedded-signup-panel" role="tabpanel">
          <ol className="integration-steps">
            <li><span>1</span><div><strong>Complete AgentSiraji business verification</strong><small>Meta currently blocks coexistence until the Tech Provider checks are approved.</small></div></li>
            <li><span>2</span><div><strong>Select the existing WhatsApp Business number</strong><small>Choose the option to keep using the number in the WhatsApp Business app.</small></div></li>
            <li><span>3</span><div><strong>Finish connection</strong><small>LeadPilot verifies the number and subscribes its webhook automatically.</small></div></li>
          </ol>

          <div className="coexistence-safety">
            <strong>Your phone app stays active</strong>
            <p>Do not choose an option that says delete, remove, or migrate away from the WhatsApp Business app.</p>
          </div>

          {!loading && !status.embeddedSignup.ready ? (
            <p className="form-result form-result-error" role="alert">
              Meta Embedded Signup must be enabled for LeadPilot before the secure connection can open.
            </p>
          ) : null}

          <div className="integration-actions">
            <button
              className="button button-whatsapp-connect"
              disabled={busy || loading || !connectionReady}
              onClick={connect}
              type="button"
            >
              {busy ? "Connecting securely…" : status.connectionMode === "coexistence" ? "Reconnect WhatsApp Business" : "Connect WhatsApp Business"}
            </button>
            {status.configured ? (
              <button className="button button-secondary" disabled={busy} onClick={() => void disconnect()} type="button">
                Disconnect current connection
              </button>
            ) : null}
          </div>
          <p className="integration-note">
            Meta returns a one-time authorization code directly to LeadPilot. The
            business token is exchanged and encrypted on the server and is never
            shown in this page or stored in your browser.
          </p>
        </div>
      )}
    </section>
  );
}

function createVerifyToken() {
  if (typeof window === "undefined" || !window.crypto) return "";
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return `leadpilot-wa-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeMetaId(value: unknown) {
  if (typeof value === "string" && /^\d{5,30}$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
