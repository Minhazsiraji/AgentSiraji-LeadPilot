"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { ChatGPTUser } from "./chatgpt-auth";
import type { BusinessProfile, ScoreBreakdown } from "../lib/types";

type LeadTemperature = "Hot" | "Warm" | "Cold";
type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";

type PreviewLead = {
  id: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  originalMessage: string;
  serviceRequested: string | null;
  location: string | null;
  preferredDate: string | null;
  source: string;
  leadScore: number;
  temperature: LeadTemperature;
  pipelineStatus: LeadStatus;
  attentionState: string;
  expectedValue: number;
  doNotContact: boolean;
  possibleSpam: boolean;
  createdAt: string;
  analysis?: AnalysisRow | null;
  draft?: DraftRow | null;
  followUps?: FollowUpRow[];
  events?: EventRow[];
};

type AnalysisRow = {
  confidence: string;
  modelUsed: string;
  recommendedNextAction: string;
  missingInformationJson: string;
  scoreBreakdownJson: string;
  extractedInformationJson: string;
};

type DraftRow = { id: string; message: string; subject: string | null; approvalStatus: string; sentAt: string | null };
type FollowUpRow = { id: string; sequenceStep: number; dueAt: string; status: string; cancelledReason: string | null };
type EventRow = { id: string; eventType: string; eventDataJson: string; createdBy: string; createdAt: string };

type WorkspacePayload = {
  business: { profile: BusinessProfile };
  leads: PreviewLead[];
  metrics: {
    newLeads: number;
    hotLeads: number;
    followUpsDue: number;
    overdueFollowUps: number;
    averageResponseHours: number;
    conversionRate: number;
    expectedPipelineValue: number;
  };
};

const previewLeads: PreviewLead[] = [
  makePreview("emma-collins", "Emma Collins", "emma@example.com", "I need deep cleaning for a three-bedroom apartment next Saturday. Please send the price.", "Deep cleaning", "Website", 88, "Hot", "New", "Reply Approval", 280, 18),
  makePreview("daniel-brooks", "Daniel Brooks", "daniel@example.com", "Looking for regular weekly cleaning in Camden for a two-bedroom flat.", "Regular cleaning", "Manual", 74, "Hot", "Contacted", "Follow-up Due", 560, 240),
  makePreview("sophie-carter", "Sophie Carter", "sophie@example.com", "Could I get a quote for end-of-tenancy cleaning in Hackney?", "End-of-tenancy cleaning", "CSV import", 67, "Warm", "Proposal Sent", "Waiting for Customer", 390, 1_680),
  makePreview("michael-reed", "Michael Reed", "michael@example.com", "We need a cleaner for our small office.", "Office cleaning", "Website", 51, "Warm", "Qualified", "Prepare Proposal", 720, 2_880),
  makePreview("olivia-harris", "Olivia Harris", "olivia@example.com", "Fortnightly cleaning for our flat.", "Regular cleaning", "Referral", 82, "Hot", "Won", "Complete", 480, 5_760),
];

const navItems = ["Overview", "Leads", "Follow-ups", "Analytics", "Settings"];

export default function LeadPilotApp({ user }: { user: ChatGPTUser | null }) {
  const [activeNav, setActiveNav] = useState("Overview");
  const [activeTab, setActiveTab] = useState("Needs attention");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [modal, setModal] = useState<"add" | "import" | "settings" | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const refreshWorkspace = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json() as WorkspacePayload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load the workspace.");
      setWorkspace(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load the workspace.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshWorkspace]);

  const leads = workspace?.leads ?? previewLeads;
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const needsAttention = ["Reply Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState);
      const matchesTab =
        activeTab === "All leads" ||
        (activeTab === "Needs attention" && needsAttention) ||
        lead.pipelineStatus === activeTab;
      const matchesQuery = !normalizedQuery || [lead.customerName, lead.email, lead.phone, lead.serviceRequested, lead.source, lead.pipelineStatus, lead.attentionState].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesTab && matchesQuery;
    });
  }, [activeTab, leads, query]);

  const isDemo = !user;
  const displayName = user?.displayName.split(" ")[0] ?? "Demo owner";
  const metrics = workspace?.metrics ?? { newLeads: 12, hotLeads: 5, followUpsDue: 5, overdueFollowUps: 2, averageResponseHours: 0.4, conversionRate: 22, expectedPipelineValue: 2430 };
  const businessName = workspace?.business.profile.name ?? "BrightHome Cleaning";

  function requireWorkspace(action: string, callback?: () => void) {
    if (isDemo) {
      setNotice(`${action} is available after signing in to the owner workspace.`);
      return;
    }
    callback?.();
  }

  function navigate(item: string) {
    setActiveNav(item);
    if (item === "Overview") setActiveTab("Needs attention");
    if (item === "Leads") setActiveTab("All leads");
    if (item === "Follow-ups") setActiveTab("Needs attention");
    if (item === "Analytics") setNotice(`Conversion is ${metrics.conversionRate.toFixed(1)}% across legitimate leads; active pipeline value is ${formatMoney(metrics.expectedPipelineValue, workspace?.business.profile.currency ?? "GBP")}.`);
    if (item === "Settings") requireWorkspace("Business settings", () => setModal("settings"));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="AgentSiraji LeadPilot home"><span>AgentSiraji</span><strong>LeadPilot</strong></a>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button className={activeNav === item ? "nav-item is-active" : "nav-item"} key={item} onClick={() => navigate(item)} type="button">
              <span className="nav-mark" aria-hidden="true" />{item}
            </button>
          ))}
        </nav>
        <div className="side-footer"><span className="business-avatar" aria-hidden="true">BH</span><span><strong>{businessName}</strong><small>{isDemo ? "Portfolio demo" : "Owner workspace"}</small></span></div>
      </aside>

      <section className="workspace" id="top">
        <header className="utility-bar">
          <div><span className="presence-dot" aria-hidden="true" /><span>{loading ? "Preparing your workspace…" : isDemo ? "Live product demo" : `Signed in as ${displayName}`}</span></div>
          {isDemo ? <a className="text-link" href="/owner">Owner sign in</a> : <a className="text-link" href="/signout-with-chatgpt?return_to=/">Sign out</a>}
        </header>

        <div className="page-content">
          <section className="hero" aria-labelledby="dashboard-title">
            <div><p className="eyebrow">Wednesday · July 22</p><h1 id="dashboard-title">Every enquiry. Followed through.</h1><p className="hero-copy">Keep new cleaning enquiries moving, respond with confidence, and win more work.</p></div>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => requireWorkspace("Add lead", () => setModal("add"))} type="button"><span aria-hidden="true">＋</span> Add lead</button>
              <button className="button button-secondary" onClick={() => requireWorkspace("CSV import", () => setModal("import"))} type="button"><span aria-hidden="true">↑</span> Import CSV</button>
              <Link className="button button-quiet" href="/enquire">Open enquiry form</Link>
            </div>
          </section>

          {notice ? <div className="notice" role="status"><span>{notice}</span>{isDemo ? <a href="/owner">Sign in</a> : null}<button aria-label="Dismiss notice" onClick={() => setNotice(null)} type="button">×</button></div> : null}

          <section className="metrics" aria-label="Lead summary">
            <MetricCard label="New enquiries" value={String(metrics.newLeads)} detail={`${metrics.hotLeads} hot leads`} symbol="01" />
            <MetricCard className="metric-priority" label="Needs follow-up" value={String(metrics.followUpsDue)} detail={`${metrics.overdueFollowUps} overdue`} symbol="02" />
            <MetricCard label="Avg. response" value={metrics.averageResponseHours ? `${metrics.averageResponseHours.toFixed(1)}h` : "—"} detail="First recorded reply" symbol="03" />
            <MetricCard label="Expected value" value={formatMoney(metrics.expectedPipelineValue, workspace?.business.profile.currency ?? "GBP")} detail={`${metrics.conversionRate.toFixed(1)}% conversion`} symbol="04" />
          </section>

          <section className="inbox-card" aria-labelledby="lead-inbox-title">
            <div className="inbox-header"><div><p className="eyebrow">Priority workspace</p><h2 id="lead-inbox-title">Lead inbox</h2></div><label className="search-field"><span className="sr-only">Search leads</span><span aria-hidden="true">⌕</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search leads…" type="search" value={query} /></label></div>
            <div className="tabs" role="tablist" aria-label="Lead filters">
              {["Needs attention", "All leads", "New", "Proposal Sent", "Won"].map((tab) => <button aria-selected={activeTab === tab} className={activeTab === tab ? "tab is-active" : "tab"} key={tab} onClick={() => setActiveTab(tab)} role="tab" type="button">{tab}{tab === "Needs attention" ? <span>{leads.filter((lead) => ["Reply Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState)).length}</span> : null}</button>)}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Lead</th><th scope="col">Service</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Next step</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const attention = ["Reply Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState);
                    return <tr className={attention ? "needs-attention" : ""} key={lead.id} onDoubleClick={() => requireWorkspace(`Open ${lead.customerName}`, () => setSelectedLeadId(lead.id))}>
                      <td><div className="person-cell"><span className={`avatar avatar-${lead.temperature.toLowerCase()}`}>{initials(lead.customerName)}</span><span><strong>{lead.customerName}</strong><small>{lead.email || lead.phone || "No contact method"}</small></span></div></td>
                      <td><strong>{lead.serviceRequested || "Not identified"}</strong><small>{lead.source}</small></td>
                      <td><span className={`score score-${lead.temperature.toLowerCase()}`}>{lead.leadScore}</span><small>{lead.temperature}</small></td>
                      <td><span className={`status status-${lead.pipelineStatus.toLowerCase().replace(" ", "-")}`}>{lead.pipelineStatus}</span></td>
                      <td><strong>{lead.attentionState}</strong><small className={attention ? "urgent-copy" : ""}>{relativeTime(lead.createdAt)}</small></td>
                      <td><strong>{formatMoney(lead.expectedValue, workspace?.business.profile.currency ?? "GBP")}</strong></td>
                      <td><button className="row-action" onClick={() => requireWorkspace(`Open ${lead.customerName}`, () => setSelectedLeadId(lead.id))} aria-label={`Open ${lead.customerName}`} type="button">•••</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filteredLeads.length === 0 ? <div className="empty-state"><strong>No leads match this view.</strong><span>Try another filter or search term.</span></div> : null}
            </div>
          </section>
          <footer className="product-footer"><span>AgentSiraji LeadPilot</span><span>Capture · Understand · Follow through</span></footer>
        </div>
      </section>

      {modal === "add" ? <AddLeadModal onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {modal === "import" ? <ImportModal onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {modal === "settings" && workspace ? <SettingsModal profile={workspace.business.profile} onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {selectedLead ? <LeadDrawer lead={selectedLead} currency={workspace?.business.profile.currency ?? "GBP"} onClose={() => setSelectedLeadId(null)} onChanged={async (message) => { setNotice(message); await refreshWorkspace(); }} /> : null}
    </main>
  );
}

function AddLeadModal({ onClose, onComplete }: { onClose: () => void; onComplete: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await apiJson("/api/leads", { method: "POST", body: JSON.stringify({ ...payload, expectedValue: Number(payload.expectedValue || 0) }) });
      await onComplete(result.duplicate ? "Possible duplicate found; the existing lead was kept." : "Lead captured, analysed, scored, and prepared for review.");
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }
  return <Modal title="Add a new lead" eyebrow="Manual capture" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><Field label="Customer name *" name="customerName" required /><Field label="Source" name="source" defaultValue="Manual" /></div><div className="form-grid"><Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" /></div><label>Original enquiry *<textarea name="message" required rows={5} placeholder="Paste the customer’s exact message…" /></label><Field label="Expected value" name="expectedValue" min="0" step="1" type="number" /><ModalActions busy={busy} error={error} onClose={onClose} submit="Analyse lead" /></form></Modal>;
}

function ImportModal({ onClose, onComplete }: { onClose: () => void; onComplete: (message: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) { setError("Choose a CSV file first."); return; }
    setBusy(true); setError("");
    try {
      const result = await apiJson("/api/leads/import", { method: "POST", body: JSON.stringify({ csvText: await file.text() }) });
      const rejected = Array.isArray(result.errors) ? result.errors.length : 0;
      await onComplete(`Imported ${result.created} lead${result.created === 1 ? "" : "s"}; ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped${rejected ? `; ${rejected} row${rejected === 1 ? "" : "s"} need correction` : ""}.`);
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }
  return <Modal title="Import leads from CSV" eyebrow="Validated batch capture" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="csv-guide"><strong>Required columns</strong><code>customer_name,email,phone,message,source</code><p>Customer name and message are required. Maximum 250 rows per import. Quoted commas are supported.</p></div><label>CSV file *<input accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label><ModalActions busy={busy} error={error} onClose={onClose} submit="Validate and import" /></form></Modal>;
}

function SettingsModal({ profile, onClose, onComplete }: { profile: BusinessProfile; onClose: () => void; onComplete: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const list = (key: string) => String(values[key] || "").split(",").map((item) => item.trim()).filter(Boolean);
    try {
      await apiJson("/api/settings", { method: "PATCH", body: JSON.stringify({ name: values.name, description: values.description, timezone: values.timezone, currency: values.currency, businessHours: values.businessHours, responseTone: values.responseTone, services: list("services"), excludedServices: list("excludedServices"), serviceAreas: list("serviceAreas"), prohibitedClaims: String(values.prohibitedClaims || "").split("\n").map((item) => item.trim()).filter(Boolean), followUpDays: list("followUpDays").map(Number) }) });
      await onComplete("Business rules saved. New leads will use the updated service and follow-up policy.");
    } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }
  return <Modal title="Business settings" eyebrow="AI guardrails" onClose={onClose} wide><form className="modal-form" onSubmit={submit}><div className="form-grid"><Field defaultValue={profile.name} label="Business name" name="name" required /><Field defaultValue={profile.currency} label="Currency" maxLength={3} name="currency" required /></div><label>Business description<textarea defaultValue={profile.description} name="description" rows={3} /></label><div className="form-grid"><Field defaultValue={profile.timezone} label="Timezone" name="timezone" /><Field defaultValue={profile.businessHours} label="Opening hours" name="businessHours" /></div><Field defaultValue={profile.responseTone} label="Response tone" name="responseTone" /><label>Services offered, comma separated<textarea defaultValue={profile.services.join(", ")} name="services" rows={3} /></label><label>Services not offered, comma separated<textarea defaultValue={profile.excludedServices.join(", ")} name="excludedServices" rows={2} /></label><Field defaultValue={profile.serviceAreas.join(", ")} label="Service areas, comma separated" name="serviceAreas" /><Field defaultValue={profile.followUpDays.join(", ")} label="Follow-up days" name="followUpDays" /><label>Prohibited claims, one per line<textarea defaultValue={profile.prohibitedClaims.join("\n")} name="prohibitedClaims" rows={3} /></label><ModalActions busy={busy} error={error} onClose={onClose} submit="Save guardrails" /></form></Modal>;
}

function LeadDrawer({ lead, currency, onClose, onChanged }: { lead: PreviewLead; currency: string; onClose: () => void; onChanged: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(lead.draft?.message ?? "");
  const [reply, setReply] = useState("");
  const analysis = parseJson<Record<string, unknown>>(lead.analysis?.extractedInformationJson, {});
  const missing = parseJson<string[]>(lead.analysis?.missingInformationJson, []);
  const score = parseJson<ScoreBreakdown>(lead.analysis?.scoreBreakdownJson, { serviceFit: 0, purchaseIntent: 0, urgency: 0, completeness: 0, engagement: 0, total: lead.leadScore });
  async function action(url: string, init: RequestInit, success: string) {
    setBusy(true); setError("");
    try { await apiJson(url, init); await onChanged(success); setBusy(false); } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await action(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ customerName: values.customerName, email: values.email || null, phone: values.phone || null, serviceRequested: values.serviceRequested || null, location: values.location || null, preferredDate: values.preferredDate || null, expectedValue: Number(values.expectedValue || 0), pipelineStatus: values.pipelineStatus, doNotContact: values.doNotContact === "on" }) }, "Lead fields, score, and workflow status updated.");
  }
  async function remove() {
    if (!window.confirm(`Permanently delete ${lead.customerName} and all related history?`)) return;
    await action(`/api/leads/${lead.id}`, { method: "DELETE" }, "Customer data deleted."); onClose();
  }
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside aria-labelledby="lead-detail-title" aria-modal="true" className="lead-drawer" role="dialog"><header className="drawer-header"><div><p className="eyebrow">{lead.temperature} · {lead.leadScore}/100</p><h2 id="lead-detail-title">{lead.customerName}</h2><p>{lead.attentionState}</p></div><button aria-label="Close lead details" onClick={onClose} type="button">×</button></header><div className="drawer-scroll">
    {error ? <div className="form-result form-result-error" role="alert">{error}</div> : null}
    <section className="detail-section"><p className="detail-label">Original enquiry</p><blockquote>{lead.originalMessage}</blockquote></section>
    <section className="detail-section"><div className="detail-section-heading"><div><p className="detail-label">LeadPilot analysis</p><h3>Transparent score</h3></div><span className={`score score-${lead.temperature.toLowerCase()}`}>{score.total}</span></div><div className="score-grid"><ScorePart label="Service fit" value={score.serviceFit} max={30} /><ScorePart label="Purchase intent" value={score.purchaseIntent} max={25} /><ScorePart label="Urgency" value={score.urgency} max={20} /><ScorePart label="Completeness" value={score.completeness} max={15} /><ScorePart label="Engagement" value={score.engagement} max={10} /></div><div className="analysis-meta"><span>Confidence: <strong>{lead.analysis?.confidence ?? "—"}</strong></span><span>Engine: <strong>{lead.analysis?.modelUsed ?? "—"}</strong></span></div>{missing.length ? <div className="missing-box"><strong>Missing information</strong><span>{missing.join(" · ")}</span></div> : null}<p className="recommendation">{lead.analysis?.recommendedNextAction || String(analysis.recommendedNextAction || "Review the lead.")}</p></section>
    <section className="detail-section"><p className="detail-label">Editable facts</p><form className="modal-form compact" onSubmit={save}><div className="form-grid"><Field defaultValue={lead.customerName} label="Customer name" name="customerName" required /><Field defaultValue={lead.email ?? ""} label="Email" name="email" type="email" /></div><div className="form-grid"><Field defaultValue={lead.phone ?? ""} label="Phone" name="phone" /><Field defaultValue={lead.serviceRequested ?? ""} label="Service" name="serviceRequested" /></div><div className="form-grid"><Field defaultValue={lead.location ?? ""} label="Location" name="location" /><Field defaultValue={lead.preferredDate ?? ""} label="Preferred date" name="preferredDate" type="date" /></div><div className="form-grid"><Field defaultValue={String(lead.expectedValue)} label={`Expected value (${currency})`} min="0" name="expectedValue" type="number" /><label>Pipeline status<select defaultValue={lead.pipelineStatus} name="pipelineStatus">{["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"].map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="check-label"><input defaultChecked={lead.doNotContact} name="doNotContact" type="checkbox" /> Do not contact this customer</label><button className="button button-secondary" disabled={busy} type="submit">Save corrections</button></form></section>
    {lead.draft ? <section className="detail-section"><div className="detail-section-heading"><div><p className="detail-label">Reply draft</p><h3>{lead.draft.approvalStatus === "approved" ? "Approved response" : "Owner approval required"}</h3></div><span className={`approval-pill approval-${lead.draft.approvalStatus}`}>{lead.draft.approvalStatus}</span></div><textarea className="draft-editor" onChange={(event) => setDraft(event.target.value)} rows={10} value={draft} /><div className="inline-actions"><button className="button button-primary" disabled={busy || lead.draft.approvalStatus === "approved" || lead.doNotContact || lead.possibleSpam} onClick={() => void action(`/api/leads/${lead.id}/approve`, { method: "POST", body: JSON.stringify({ message: draft }) }, "Reply approved, contact recorded, and follow-up activated.")} type="button">Approve & record contact</button><button className="button button-quiet" onClick={() => void navigator.clipboard.writeText(draft)} type="button">Copy reply</button></div></section> : <section className="detail-section warning-section"><strong>No reply was created.</strong><span>This lead is spam, Do Not Contact, or needs manual review.</span></section>}
    <section className="detail-section"><p className="detail-label">Customer replied?</p><textarea onChange={(event) => setReply(event.target.value)} placeholder="Paste the customer’s latest reply. Pending follow-ups will stop immediately." rows={4} value={reply} /><button className="button button-secondary" disabled={busy || !reply.trim()} onClick={() => void action(`/api/leads/${lead.id}/reply`, { method: "POST", body: JSON.stringify({ message: reply }) }, "Customer reply recorded; pending follow-ups were cancelled.")} type="button">Record reply</button></section>
    <section className="detail-section"><div className="detail-section-heading"><div><p className="detail-label">Follow-up timeline</p><h3>{lead.followUps?.length ?? 0} task{lead.followUps?.length === 1 ? "" : "s"}</h3></div></div><div className="timeline">{lead.followUps?.map((task) => <div className="timeline-item" key={task.id}><span className={`timeline-dot timeline-${task.status}`} /><div><strong>Step {task.sequenceStep} · {task.status.replaceAll("_", " ")}</strong><small>{formatDateTime(task.dueAt)}{task.cancelledReason ? ` · ${task.cancelledReason}` : ""}</small></div>{["pending", "waiting_for_approval", "waiting_for_initial_reply"].includes(task.status) ? <div className="timeline-actions">{task.status === "pending" ? <button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}/draft`, { method: "POST", body: "{}" }, "Follow-up draft prepared for owner approval.")} type="button">Prepare draft</button> : null}<button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }, "Follow-up completed.")} type="button">Complete</button><button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }, "Follow-up cancelled.")} type="button">Cancel</button></div> : null}</div>)}</div></section>
    <section className="detail-section"><p className="detail-label">Activity history</p><div className="timeline">{lead.events?.map((event) => <div className="timeline-item" key={event.id}><span className="timeline-dot" /><div><strong>{event.eventType.replaceAll("_", " ")}</strong><small>{event.createdBy} · {formatDateTime(event.createdAt)}</small></div></div>)}</div></section>
    <section className="danger-zone"><div><strong>Delete customer data</strong><span>Removes the lead, analysis, drafts, tasks, and history.</span></div><button disabled={busy} onClick={() => void remove()} type="button">Delete permanently</button></section>
  </div></aside></div>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="modal-title" aria-modal="true" className={wide ? "modal-card modal-wide" : "modal-card"} role="dialog"><header><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2></div><button aria-label="Close dialog" onClick={onClose} type="button">×</button></header>{children}</section></div>;
}

function Field(props: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; min?: string; step?: string; maxLength?: number }) {
  const { label, ...input } = props; return <label>{label}<input {...input} /></label>;
}

function ModalActions({ busy, error, onClose, submit }: { busy: boolean; error: string; onClose: () => void; submit: string }) {
  return <>{error ? <div className="form-result form-result-error" role="alert">{error}</div> : null}<div className="modal-actions"><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Working…" : submit}</button></div></>;
}

function MetricCard({ label, value, detail, symbol, className = "" }: { label: string; value: string; detail: string; symbol: string; className?: string }) {
  return <article className={`metric-card ${className}`}><span className="metric-symbol" aria-hidden="true">{symbol}</span><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></article>;
}

function ScorePart({ label, value, max }: { label: string; value: number; max: number }) {
  return <div><span>{label}</span><strong>{value}<small>/{max}</small></strong><div><i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div></div>;
}

async function apiJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const result = await response.json() as Record<string, string | number | boolean | null | unknown[]>;
  if (!response.ok) throw new Error(String(result.error || "LeadPilot could not complete that request."));
  return result;
}

function makePreview(id: string, customerName: string, email: string, originalMessage: string, serviceRequested: string, source: string, leadScore: number, temperature: LeadTemperature, pipelineStatus: LeadStatus, attentionState: string, expectedValue: number, minutesAgo: number): PreviewLead {
  return { id, customerName, email, phone: null, originalMessage, serviceRequested, location: null, preferredDate: null, source, leadScore, temperature, pipelineStatus, attentionState, expectedValue, doNotContact: false, possibleSpam: false, createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() };
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "LeadPilot could not complete that request."; }
function parseJson<T>(value: string | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 60 ? `${minutes} min ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
function formatMoney(value: number, currency: string) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); } catch { return `${currency} ${Math.round(value)}`; } }
