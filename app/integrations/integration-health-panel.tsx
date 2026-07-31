"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  IntegrationCheck,
  IntegrationHealthPayload,
  IntegrationState,
  SmokeTestPayload,
} from "../../lib/integration-health";
import styles from "./integration-health.module.css";

type LoadState = "idle" | "loading" | "error";

export default function IntegrationHealthPanel() {
  const [health, setHealth] = useState<IntegrationHealthPayload | null>(null);
  const [smoke, setSmoke] = useState<SmokeTestPayload | null>(null);
  const [healthState, setHealthState] = useState<LoadState>("idle");
  const [smokeState, setSmokeState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [manualDone, setManualDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("leadpilot-deployment-smoke-checks");
      if (stored) setManualDone(JSON.parse(stored) as Record<string, boolean>);
    } catch {
      // Local completion state is optional.
    }
    void refreshHealth();
  }, []);

  async function refreshHealth() {
    setHealthState("loading");
    setError("");
    try {
      const response = await fetch("/api/integrations/health", { cache: "no-store" });
      const result = await response.json() as IntegrationHealthPayload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Integration health could not be loaded.");
      setHealth(result);
      setHealthState("idle");
    } catch (caught) {
      setHealthState("error");
      setError(caught instanceof Error ? caught.message : "Integration health could not be loaded.");
    }
  }

  async function runSmokeTest() {
    setSmokeState("loading");
    setError("");
    try {
      const response = await fetch("/api/integrations/smoke-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as SmokeTestPayload & { error?: string };
      if (!response.ok) throw new Error(result.error || "The smoke test could not run.");
      setSmoke(result);
      setSmokeState("idle");
      await refreshHealth();
    } catch (caught) {
      setSmokeState("error");
      setError(caught instanceof Error ? caught.message : "The smoke test could not run.");
    }
  }

  function toggleManual(id: string) {
    setManualDone((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem("leadpilot-deployment-smoke-checks", JSON.stringify(next));
      } catch {
        // The checklist still works in memory when storage is unavailable.
      }
      return next;
    });
  }

  const manualProgress = useMemo(() => {
    const items = smoke?.manualChecks ?? [];
    return {
      done: items.filter((item) => manualDone[item.id]).length,
      total: items.length,
    };
  }, [manualDone, smoke]);

  return (
    <div className={styles.panel}>
      <section className={styles.summary}>
        <div>
          <p className={styles.kicker}>Owner-only setup center</p>
          <h1>Integration health</h1>
          <p>
            Confirm what is ready, what still needs runtime configuration, and what must be tested manually after deployment.
            Secret values are never displayed.
          </p>
        </div>
        <div className={styles.summaryActions}>
          <button disabled={healthState === "loading"} onClick={() => void refreshHealth()} type="button">
            {healthState === "loading" ? "Checking…" : "Refresh health"}
          </button>
          <button className={styles.primary} disabled={smokeState === "loading"} onClick={() => void runSmokeTest()} type="button">
            {smokeState === "loading" ? "Running…" : "Run safe smoke test"}
          </button>
        </div>
      </section>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {health ? (
        <section className={styles.overview} aria-label="Integration readiness summary">
          <StatusBadge state={health.overall} label={overallLabel(health.overall)} />
          <span><strong>{health.readyCount}</strong> ready</span>
          <span><strong>{health.needsConfigurationCount}</strong> need configuration</span>
          <span><strong>{health.unavailableCount}</strong> unavailable</span>
          <small>Checked {formatDate(health.checkedAt)}</small>
        </section>
      ) : null}

      <section className={styles.grid} aria-label="Integration checks">
        {health?.checks.map((check) => <IntegrationCard check={check} key={check.id} />)}
        {!health && healthState !== "error" ? <p className={styles.loading}>Loading integration health…</p> : null}
      </section>

      <section className={styles.smokeSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Non-destructive verification</p>
            <h2>Deployment smoke test</h2>
            <p>The automated portion reads configuration and database state only. It does not create leads or send messages.</p>
          </div>
          {smoke ? <strong className={smoke.failed ? styles.failedScore : styles.passedScore}>{smoke.passed}/{smoke.checks.length} passed</strong> : null}
        </div>

        {smoke ? (
          <>
            <div className={styles.testList}>
              {smoke.checks.map((check) => (
                <div className={check.passed ? styles.testPassed : styles.testFailed} key={check.id}>
                  <span aria-hidden="true">{check.passed ? "✓" : "!"}</span>
                  <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                </div>
              ))}
            </div>

            <div className={styles.manualHeader}>
              <div><h3>Manual live checks</h3><p>Complete these only after the new Site deployment is published.</p></div>
              <strong>{manualProgress.done}/{manualProgress.total}</strong>
            </div>
            <div className={styles.manualList}>
              {smoke.manualChecks.map((item) => (
                <article className={manualDone[item.id] ? styles.manualDone : styles.manualItem} key={item.id}>
                  <label>
                    <input checked={Boolean(manualDone[item.id])} onChange={() => toggleManual(item.id)} type="checkbox" />
                    <span>{item.label}</span>
                  </label>
                  <div className={styles.inlineActions}>
                    {item.path ? <a href={item.path} rel="noreferrer" target="_blank">Open test page</a> : null}
                    {item.testMessage ? <button onClick={() => void navigator.clipboard.writeText(item.testMessage || "")} type="button">Copy test message</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptySmoke}>
            <p>Run the safe smoke test after deployment to generate the automatic results and live checklist.</p>
          </div>
        )}
      </section>

      <section className={styles.safety}>
        <strong>Safety guarantees</strong>
        <span>No secrets returned</span>
        <span>No customer records created</span>
        <span>No Messenger or WhatsApp messages sent</span>
      </section>
    </div>
  );
}

function IntegrationCard({ check }: { check: IntegrationCheck }) {
  const configured = Object.entries(check.configured ?? {});
  return (
    <article className={styles.card}>
      <div className={styles.cardHeading}>
        <div><p className={styles.cardLabel}>{check.label}</p><h2>{check.summary}</h2></div>
        <StatusBadge state={check.state} label={stateLabel(check.state)} />
      </div>
      {check.endpoint ? <code>{check.endpoint}</code> : null}
      {configured.length ? (
        <div className={styles.flags}>
          {configured.map(([name, value]) => <span className={value ? styles.flagReady : styles.flagMissing} key={name}>{friendlyName(name)}: {value ? "set" : "missing"}</span>)}
        </div>
      ) : null}
      {check.lastActivityAt ? <small className={styles.activity}>Latest stored activity: {formatDate(check.lastActivityAt)}</small> : null}
      {check.notes?.map((note) => <p className={styles.note} key={note}>{note}</p>)}
    </article>
  );
}

function StatusBadge({ state, label }: { state: IntegrationState; label: string }) {
  const className = state === "ready" ? styles.ready : state === "needs_configuration" ? styles.warning : styles.unavailable;
  return <span className={className}>{label}</span>;
}

function friendlyName(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()).trim();
}

function stateLabel(state: IntegrationState) {
  if (state === "ready") return "Ready";
  if (state === "needs_configuration") return "Needs configuration";
  return "Unavailable";
}

function overallLabel(state: IntegrationState) {
  if (state === "ready") return "All configured";
  if (state === "needs_configuration") return "Core ready · setup remains";
  return "Core unavailable";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
