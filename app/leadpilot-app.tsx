"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { ChatGPTUser } from "./chatgpt-auth";
import { nextOrderStatuses, orderStatusAction } from "../lib/order-workflow";
import { customerOrderMessageTitle, isCustomerOrderDraft, whatsappMessageUrl } from "../lib/order-confirmation";
import type { BusinessProfile, PipelineStatus, ScoreBreakdown } from "../lib/types";
import { buildLeadPilotAnalytics, type LeadPilotAnalytics } from "../lib/analytics";

type LeadTemperature = "Hot" | "Warm" | "Cold";
type LeadStatus = "New" | "Contacted" | "Qualified" | "Offer Sent" | "Order Confirmed" | "Shipped" | "Delivered" | "Cancelled" | "Returned" | "Lost";

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
  updatedAt?: string;
  lastCustomerActivityAt?: string | null;
  replyChannel?: "facebook" | "whatsapp" | null;
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

type DraftRow = { id: string; draftType: string; message: string; subject: string | null; approvalStatus: string; sentAt: string | null };
type FollowUpRow = { id: string; sequenceStep: number; dueAt: string; status: string; cancelledReason: string | null };
type EventRow = { id: string; eventType: string; eventDataJson: string; createdBy: string; createdAt: string };
type OwnerNotification = { id: string; leadId: string; title: string; message: string; readAt: string | null; createdAt: string };

type WorkspacePayload = {
  business: { profile: BusinessProfile };
  leads: PreviewLead[];
  notifications: OwnerNotification[];
  analytics: LeadPilotAnalytics;
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

const navItems = ["Overview", "Leads", "Follow-ups", "Analytics", "Settings"];

export default function LeadPilotApp({ initialNow, user }: { initialNow: string; user: ChatGPTUser | null }) {
  const [activeNav, setActiveNav] = useState("Overview");
  const [activeTab, setActiveTab] = useState("Needs attention");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeNeedsSignIn, setNoticeNeedsSignIn] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [modal, setModal] = useState<"add" | "import" | "settings" | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => new Date(initialNow).getTime());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const previewLeads = useMemo(() => makePreviewLeads(new Date(initialNow).getTime()), [initialNow]);

  const refreshWorkspace = useCallback(async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json() as WorkspacePayload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load the workspace.");
      setWorkspace(result);
    } catch (error) {
      setNoticeNeedsSignIn(false);
      setNotice(error instanceof Error ? error.message : "Could not load the workspace.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshWorkspace(true), 0);
    return () => window.clearTimeout(timer);
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!user) return;
    const refreshVisibleWorkspace = () => {
      if (document.visibilityState === "visible") void refreshWorkspace();
    };
    const interval = window.setInterval(refreshVisibleWorkspace, 10_000);
    window.addEventListener("focus", refreshVisibleWorkspace);
    document.addEventListener("visibilitychange", refreshVisibleWorkspace);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleWorkspace);
      document.removeEventListener("visibilitychange", refreshVisibleWorkspace);
    };
  }, [refreshWorkspace, user]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setRelativeTimeNow(Date.now()), 0);
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notificationsOpen]);

  const leads = workspace?.leads ?? previewLeads;
  const notifications = workspace?.notifications ?? [];
  const unreadNotifications = notifications.filter((item) => !item.readAt);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const needsAttention = ["Reply Approval", "Confirmation Approval", "Customer Message Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState);
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
  const profile = workspace?.business.profile;
  const businessName = profile?.name ?? "StepFresh";
  const currency = profile?.currency ?? "BDT";
  const offeringLabel = profile?.offeringLabel ?? "Product / package";
  const pipelineStages = profile?.pipelineStages ?? ["New", "Contacted", "Order Confirmed", "Shipped", "Delivered", "Cancelled", "Returned"];
  const analytics = workspace?.analytics ?? buildLeadPilotAnalytics(previewLeads, [], initialNow);

  function requireWorkspace(action: string, callback?: () => void) {
    if (isDemo) {
      setNoticeNeedsSignIn(true);
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
    if (item === "Settings") requireWorkspace("Business settings", () => setModal("settings"));
  }

  async function openNotification(item: OwnerNotification) {
    setNotificationsOpen(false);
    setSelectedLeadId(item.leadId);
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setWorkspace((current) => current ? {
        ...current,
        notifications: current.notifications.map((notification) => notification.id === item.id ? { ...notification, readAt } : notification),
      } : current);
      try {
        await apiJson("/api/notifications/read", { method: "POST", body: JSON.stringify({ notificationId: item.id }) });
      } catch (error) {
        setNotice(errorMessage(error));
        void refreshWorkspace();
      }
    }
  }

  async function markAllNotificationsRead() {
    const readAt = new Date().toISOString();
    setWorkspace((current) => current ? {
      ...current,
      notifications: current.notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })),
    } : current);
    try {
      await apiJson("/api/notifications/read", { method: "POST", body: "{}" });
    } catch (error) {
      setNotice(errorMessage(error));
      void refreshWorkspace();
    }
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
        <div className="side-footer"><span className="business-avatar" aria-hidden="true">SF</span><span><strong>{businessName}</strong><small>{isDemo ? "StepFresh pilot" : "Owner workspace"}</small></span></div>
      </aside>

      <section className="workspace" id="top">
        <header className="utility-bar">
          <div><span className="presence-dot" aria-hidden="true" /><span>{loading ? "Preparing your workspace…" : isDemo ? "Live product demo" : `Signed in as ${displayName}`}</span></div>
          <div className="utility-actions">
            {!isDemo ? <div className="notification-wrap"><button aria-expanded={notificationsOpen} aria-label={`${unreadNotifications.length} unread lead notifications`} className="notification-button" onClick={() => setNotificationsOpen((open) => !open)} type="button">🔔{unreadNotifications.length ? <span>{unreadNotifications.length}</span> : null}</button>{notificationsOpen ? <div className="notification-panel"><div className="notification-heading"><strong>Lead notifications</strong>{unreadNotifications.length ? <button onClick={() => void markAllNotificationsRead()} type="button">Mark all read</button> : null}</div>{notifications.length ? notifications.slice(0, 10).map((item) => <button className={item.readAt ? "notification-item" : "notification-item is-unread"} key={item.id} onClick={() => void openNotification(item)} type="button"><strong>{item.title}</strong><span>{item.message}</span><small>{relativeTime(item.createdAt, relativeTimeNow)}</small></button>) : <p className="notification-empty">New website, Messenger, and WhatsApp enquiries will appear here.</p>}</div> : null}</div> : null}
            {!isDemo ? <Link className="text-link" href="/owner/facebook">Facebook setup</Link> : null}
            {!isDemo ? <Link className="text-link" href="/owner/whatsapp">WhatsApp setup</Link> : null}
            {isDemo ? <a className="text-link" href="/owner">Owner sign in</a> : <a className="text-link" href="/signout-with-chatgpt?return_to=/">Sign out</a>}
          </div>
        </header>

        <div className={activeNav === "Analytics" ? "page-content analytics-page-content" : "page-content"}>
          {activeNav === "Analytics" ? (
            <AnalyticsDashboard
              analytics={analytics}
              currency={currency}
              timezone={profile?.timezone ?? "Asia/Dhaka"}
              onOpenLead={(leadId) => requireWorkspace("Open reorder customer", () => setSelectedLeadId(leadId))}
            />
          ) : <>
          <section className="hero" aria-labelledby="dashboard-title">
            <div><p className="eyebrow">StepFresh · @stepfresh.bd</p><h1 id="dashboard-title">Every enquiry. Followed through.</h1><p className="hero-copy">Capture website, Messenger, and WhatsApp leads, identify ready buyers, prepare helpful replies, and track every order to delivery.</p></div>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => requireWorkspace("Add lead", () => setModal("add"))} type="button"><span aria-hidden="true">＋</span> Add lead</button>
              <button className="button button-secondary" onClick={() => requireWorkspace("CSV import", () => setModal("import"))} type="button"><span aria-hidden="true">↑</span> Import CSV</button>
              <Link className="button button-quiet" href="/enquire">Open enquiry form</Link>
            </div>
          </section>

          {notice ? <div className="notice" role="status"><span>{notice}</span>{noticeNeedsSignIn ? <a href="/owner">Sign in</a> : null}<button aria-label="Dismiss notice" onClick={() => setNotice(null)} type="button">×</button></div> : null}

          <section className="metrics" aria-label="Lead summary">
            <MetricCard label="New enquiries" value={String(metrics.newLeads)} detail={`${metrics.hotLeads} hot leads`} symbol="01" />
            <MetricCard className="metric-priority" label="Needs follow-up" value={String(metrics.followUpsDue)} detail={`${metrics.overdueFollowUps} overdue`} symbol="02" />
            <MetricCard label="Avg. response" value={metrics.averageResponseHours ? `${metrics.averageResponseHours.toFixed(1)}h` : "—"} detail="First recorded reply" symbol="03" />
            <MetricCard label="Expected value" value={formatMoney(metrics.expectedPipelineValue, currency)} detail={`${metrics.conversionRate.toFixed(1)}% conversion`} symbol="04" />
          </section>

          <section className="inbox-card" aria-labelledby="lead-inbox-title">
            <div className="inbox-header"><div><p className="eyebrow">Priority workspace</p><h2 id="lead-inbox-title">Lead inbox</h2></div><label className="search-field"><span className="sr-only">Search leads</span><span aria-hidden="true">⌕</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search leads…" type="search" value={query} /></label></div>
            <div className="tabs" role="tablist" aria-label="Lead filters">
              {["Needs attention", "All leads", ...pipelineStages.slice(0, 5)].map((tab) => <button aria-selected={activeTab === tab} className={activeTab === tab ? "tab is-active" : "tab"} key={tab} onClick={() => setActiveTab(tab)} role="tab" type="button">{tab}{tab === "Needs attention" ? <span>{leads.filter((lead) => ["Reply Approval", "Confirmation Approval", "Customer Message Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState)).length}</span> : null}</button>)}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Lead</th><th scope="col">{offeringLabel}</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Next step</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const attention = ["Reply Approval", "Confirmation Approval", "Customer Message Approval", "Needs Review", "Needs Reply", "Follow-up Due", "Spam"].includes(lead.attentionState);
                    return <tr className={attention ? "needs-attention" : ""} key={lead.id} onDoubleClick={() => requireWorkspace(`Open ${lead.customerName}`, () => setSelectedLeadId(lead.id))}>
                      <td><div className="person-cell"><span className={`avatar avatar-${lead.temperature.toLowerCase()}`}>{initials(lead.customerName)}</span><span><strong>{lead.customerName}</strong><small>{lead.email || lead.phone || "No contact method"}</small></span></div></td>
                      <td><strong>{lead.serviceRequested || "Not identified"}</strong><small>{lead.source}</small></td>
                      <td><span className={`score score-${lead.temperature.toLowerCase()}`}>{lead.leadScore}</span><small>{lead.temperature}</small></td>
                      <td><span className={`status status-${lead.pipelineStatus.toLowerCase().replace(" ", "-")}`}>{lead.pipelineStatus}</span></td>
                      <td><strong>{lead.attentionState}</strong><small className={attention ? "urgent-copy" : ""}>{relativeTime(lead.lastCustomerActivityAt ?? lead.updatedAt ?? lead.createdAt, relativeTimeNow)}</small></td>
                      <td><strong>{formatMoney(lead.expectedValue, currency)}</strong></td>
                      <td><button className="row-action" onClick={() => requireWorkspace(`Open ${lead.customerName}`, () => setSelectedLeadId(lead.id))} aria-label={`Open ${lead.customerName}`} type="button">•••</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filteredLeads.length === 0 ? <div className="empty-state"><strong>No leads match this view.</strong><span>Try another filter or search term.</span></div> : null}
            </div>
          </section>
          <footer className="product-footer"><span>AgentSiraji LeadPilot</span><span>Capture · Understand · Follow through</span></footer>
          </>}
        </div>
      </section>

      {modal === "add" ? <AddLeadModal onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {modal === "import" ? <ImportModal onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {modal === "settings" && workspace ? <SettingsModal profile={workspace.business.profile} onClose={() => setModal(null)} onComplete={async (message) => { setModal(null); setNotice(message); await refreshWorkspace(); }} /> : null}
      {selectedLead ? <LeadDrawer key={`${selectedLead.id}:${selectedLead.draft?.id ?? "none"}`} lead={selectedLead} currency={currency} offeringLabel={offeringLabel} timezone={profile.timezone} onClose={() => setSelectedLeadId(null)} onStatusChange={(status) => setWorkspace((current) => current ? {
        ...current,
        leads: current.leads.map((item) => item.id === selectedLead.id ? {
          ...item,
          pipelineStatus: status as LeadStatus,
          attentionState: status === "Order Confirmed" ? "Confirmation Approval" : ["Shipped", "Delivered", "Cancelled"].includes(status) ? "Customer Message Approval" : item.attentionState,
        } : item),
      } : current)} onChanged={(message) => { setNotice(message); void refreshWorkspace(); }} /> : null}
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

function LeadDrawer({ lead, currency, offeringLabel, timezone, onClose, onChanged, onStatusChange }: { lead: PreviewLead; currency: string; offeringLabel: string; timezone: string; onClose: () => void; onChanged: (message: string) => void; onStatusChange: (status: PipelineStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(lead.draft?.message ?? "");
  const [manualReply, setManualReply] = useState("");
  const analysis = parseJson<Record<string, unknown>>(lead.analysis?.extractedInformationJson, {});
  const missing = parseJson<string[]>(lead.analysis?.missingInformationJson, []);
  const score = parseJson<ScoreBreakdown>(lead.analysis?.scoreBreakdownJson, { serviceFit: 0, purchaseIntent: 0, urgency: 0, completeness: 0, engagement: 0, total: lead.leadScore });
  const nextStatuses = nextOrderStatuses(lead.pipelineStatus as PipelineStatus);
  const isCustomerOrderMessage = isCustomerOrderDraft(lead.draft?.draftType ?? "");
  const customerMessageTitle = customerOrderMessageTitle(lead.draft?.draftType ?? "");
  const whatsappUrl = isCustomerOrderMessage ? whatsappMessageUrl(lead.phone, draft) : null;
  const automaticChannel = lead.replyChannel
    ?? (lead.source === "Facebook Messenger"
      ? "facebook"
      : lead.source === "WhatsApp"
        ? "whatsapp"
        : null);
  const latestCustomerReply = latestCustomerReplyFromEvents(lead.events);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  async function action(
    url: string,
    init: RequestInit,
    success: string | ((result: Record<string, unknown>) => string),
  ) {
    setBusy(true); setError("");
    try {
      const result = await apiJson(url, init);
      onChanged(typeof success === "function" ? success(result) : success);
      setBusy(false);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
      return false;
    }
  }
  async function recordManualReply() {
    const recorded = await action(
      `/api/leads/${lead.id}/reply`,
      { method: "POST", body: JSON.stringify({ message: manualReply }) },
      "Customer reply recorded; pending follow-ups were cancelled.",
    );
    if (recorded) setManualReply("");
  }
  async function transitionStatus(status: PipelineStatus) {
    const previousStatus = lead.pipelineStatus as PipelineStatus;
    setBusy(true); setError(""); onStatusChange(status);
    try {
      await apiJson(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ pipelineStatus: status }) });
      onChanged(`Order moved to ${status}.`);
    } catch (caught) {
      onStatusChange(previousStatus);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
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
    <section aria-busy={busy} className="detail-section order-workflow"><div className="detail-section-heading"><div><p className="detail-label">Order workflow</p><h3>{lead.pipelineStatus}</h3></div><span className={`status status-${lead.pipelineStatus.toLowerCase().replace(" ", "-")}`}>{busy ? "Saving…" : nextStatuses.length ? "Action needed" : "Complete"}</span></div><div className="workflow-track">{["New", "Order Confirmed", "Shipped", "Delivered"].map((status) => <span className={status === lead.pipelineStatus ? "is-current" : ""} key={status}>{status}</span>)}</div>{nextStatuses.length ? <div className="inline-actions">{nextStatuses.map((status) => <button className={status === "Cancelled" ? "button button-quiet workflow-cancel" : "button button-primary"} disabled={busy} key={status} onClick={() => void transitionStatus(status)} type="button">{orderStatusAction(status)}</button>)}</div> : <p className="workflow-complete">{busy ? "Saving this status…" : "No further action is required for this order."}</p>}</section>
    <section className="detail-section"><div className="detail-section-heading"><div><p className="detail-label">LeadPilot analysis</p><h3>Transparent score</h3></div><span className={`score score-${lead.temperature.toLowerCase()}`}>{score.total}</span></div><div className="score-grid"><ScorePart label="Service fit" value={score.serviceFit} max={30} /><ScorePart label="Purchase intent" value={score.purchaseIntent} max={25} /><ScorePart label="Urgency" value={score.urgency} max={20} /><ScorePart label="Completeness" value={score.completeness} max={15} /><ScorePart label="Engagement" value={score.engagement} max={10} /></div><div className="analysis-meta"><span>Confidence: <strong>{lead.analysis?.confidence ?? "—"}</strong></span><span>Engine: <strong>{lead.analysis?.modelUsed ?? "—"}</strong></span></div>{missing.length ? <div className="missing-box"><strong>Missing information</strong><span>{missing.join(" · ")}</span></div> : null}<p className="recommendation">{lead.analysis?.recommendedNextAction || String(analysis.recommendedNextAction || "Review the lead.")}</p></section>
    <section className="detail-section"><p className="detail-label">Editable facts</p><form className="modal-form compact" onSubmit={save}><div className="form-grid"><Field defaultValue={lead.customerName} label="Customer name" name="customerName" required /><Field defaultValue={lead.email ?? ""} label="Email" name="email" type="email" /></div><div className="form-grid"><Field defaultValue={lead.phone ?? ""} label="Phone" name="phone" /><Field defaultValue={lead.serviceRequested ?? ""} label={offeringLabel} name="serviceRequested" /></div><div className="form-grid"><Field defaultValue={lead.location ?? ""} label="Delivery / service location" name="location" /><Field defaultValue={formatDateTime(lead.createdAt, timezone)} label="Order received (date & time)" name="receivedAt" readOnly /></div><div className="form-grid"><Field defaultValue={lead.preferredDate ?? ""} label="Customer requested date (optional)" name="preferredDate" type="date" /><Field defaultValue={String(lead.expectedValue)} label={`Expected value (${currency})`} min="0" name="expectedValue" type="number" /></div><input name="pipelineStatus" type="hidden" value={lead.pipelineStatus} /><label className="check-label"><input defaultChecked={lead.doNotContact} name="doNotContact" type="checkbox" /> Do not contact this customer</label><button className="button button-secondary" disabled={busy} type="submit">Save corrections</button></form></section>
    {lead.draft ? <section className={isCustomerOrderMessage ? "detail-section confirmation-section" : "detail-section"}><div className="detail-section-heading"><div><p className="detail-label">{isCustomerOrderMessage ? "Customer message" : "Reply draft"}</p><h3>{isCustomerOrderMessage ? customerMessageTitle : lead.draft.approvalStatus === "approved" ? "Approved response" : "Owner approval required"}</h3></div><span className={`approval-pill approval-${lead.draft.approvalStatus}`}>{lead.draft.approvalStatus === "approved" ? automaticChannel ? "sent" : "recorded" : automaticChannel ? "ready to send" : "ready to record"}</span></div>{isCustomerOrderMessage ? <p className="confirmation-note">Prepared automatically from verified order facts. Review it before sending.</p> : null}<textarea className="draft-editor" onChange={(event) => setDraft(event.target.value)} rows={isCustomerOrderMessage ? 13 : 10} value={draft} /><div className="inline-actions">{isCustomerOrderMessage && whatsappUrl && !automaticChannel && lead.draft.approvalStatus !== "approved" ? <a className="button button-whatsapp" href={whatsappUrl} rel="noreferrer" target="_blank">Open WhatsApp</a> : null}<button className="button button-quiet" onClick={() => void navigator.clipboard.writeText(draft)} type="button">{isCustomerOrderMessage ? "Copy message" : "Copy reply"}</button><button className="button button-primary" disabled={busy || lead.draft.approvalStatus === "approved" || lead.doNotContact || lead.possibleSpam} onClick={() => void action(`/api/leads/${lead.id}/approve`, { method: "POST", body: JSON.stringify({ message: draft }) }, (result) => result.delivery === "facebook" ? "Reply sent in Messenger and follow-up activated." : result.delivery === "whatsapp" ? "Reply sent in WhatsApp and follow-up activated." : isCustomerOrderMessage ? `${customerMessageTitle} recorded as sent.` : "Reply approved, contact recorded, and follow-up activated.")} type="button">{automaticChannel ? "Approve & send" : isCustomerOrderMessage ? "Mark as sent" : "Approve & record contact"}</button></div></section> : <section className="detail-section warning-section"><strong>No reply was created.</strong><span>This lead is spam, Do Not Contact, or needs manual review.</span></section>}
    <section className="detail-section customer-reply-section">
      <div className="detail-section-heading">
        <div><p className="detail-label">Customer reply</p><h3>{latestCustomerReply ? "Latest reply captured" : "Waiting for customer"}</h3></div>
        {latestCustomerReply ? <span className="approval-pill approval-approved">{latestCustomerReply.automatic ? "Captured automatically" : "Recorded manually"}</span> : null}
      </div>
      {latestCustomerReply ? <>
        <textarea aria-label="Latest customer reply" className="captured-reply" readOnly rows={4} value={latestCustomerReply.message} />
        <p className="captured-reply-meta">{latestCustomerReply.channel} · {formatDateTime(latestCustomerReply.receivedAt, timezone)}</p>
      </> : <p className="empty-reply-note">New Messenger or WhatsApp replies will appear here automatically and pending follow-ups will stop.</p>}
      <details className="manual-reply-entry">
        <summary>Record a reply manually</summary>
        <textarea onChange={(event) => setManualReply(event.target.value)} placeholder="Use this only if the reply arrived outside a connected channel." rows={4} value={manualReply} />
        <button className="button button-secondary" disabled={busy || !manualReply.trim()} onClick={() => void recordManualReply()} type="button">Record reply</button>
      </details>
    </section>
    <section className="detail-section"><div className="detail-section-heading"><div><p className="detail-label">Follow-up timeline</p><h3>{lead.followUps?.length ?? 0} task{lead.followUps?.length === 1 ? "" : "s"}</h3></div></div><div className="timeline">{lead.followUps?.map((task) => <div className="timeline-item" key={task.id}><span className={`timeline-dot timeline-${task.status}`} /><div><strong>Step {task.sequenceStep} · {task.status.replaceAll("_", " ")}</strong><small>{formatDateTime(task.dueAt, timezone)}{task.cancelledReason ? ` · ${task.cancelledReason}` : ""}</small></div>{["pending", "waiting_for_approval", "waiting_for_initial_reply"].includes(task.status) ? <div className="timeline-actions">{task.status === "pending" ? <button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}/draft`, { method: "POST", body: "{}" }, "Follow-up draft prepared for owner approval.")} type="button">Prepare draft</button> : null}<button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }, "Follow-up completed.")} type="button">Complete</button><button disabled={busy} onClick={() => void action(`/api/follow-ups/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }, "Follow-up cancelled.")} type="button">Cancel</button></div> : null}</div>)}</div></section>
    <section className="detail-section"><p className="detail-label">Activity history</p><div className="timeline">{lead.events?.map((event) => {
      const customerReply = customerReplyFromEvent(event);
      return <div className="timeline-item" key={event.id}><span className="timeline-dot" /><div><strong>{event.eventType.replaceAll("_", " ")}</strong>{customerReply ? <blockquote className="activity-message">{customerReply.message}</blockquote> : null}<small>{event.createdBy} · {formatDateTime(customerReply?.receivedAt ?? event.createdAt, timezone)}</small></div></div>;
    })}</div></section>
    <section className="danger-zone"><div><strong>Delete customer data</strong><span>Removes the lead, analysis, drafts, tasks, and history.</span></div><button disabled={busy} onClick={() => void remove()} type="button">Delete permanently</button></section>
  </div></aside></div>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="modal-title" aria-modal="true" className={wide ? "modal-card modal-wide" : "modal-card"} role="dialog"><header><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2></div><button aria-label="Close dialog" onClick={onClose} type="button">×</button></header>{children}</section></div>;
}

function Field(props: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; min?: string; step?: string; maxLength?: number; readOnly?: boolean }) {
  const { label, ...input } = props; return <label>{label}<input {...input} /></label>;
}

function ModalActions({ busy, error, onClose, submit }: { busy: boolean; error: string; onClose: () => void; submit: string }) {
  return <>{error ? <div className="form-result form-result-error" role="alert">{error}</div> : null}<div className="modal-actions"><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Working…" : submit}</button></div></>;
}

function MetricCard({ label, value, detail, symbol, className = "" }: { label: string; value: string; detail: string; symbol: string; className?: string }) {
  return <article className={`metric-card ${className}`}><span className="metric-symbol" aria-hidden="true">{symbol}</span><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></article>;
}

function AnalyticsDashboard({ analytics, currency, timezone, onOpenLead }: { analytics: LeadPilotAnalytics; currency: string; timezone: string; onOpenLead: (leadId: string) => void }) {
  const { summary } = analytics;
  const maxWeeklyLeads = Math.max(1, ...analytics.weeklyTrend.map((item) => item.leads));
  const maxWeeklyValue = Math.max(1, ...analytics.weeklyTrend.map((item) => item.deliveredValue));
  const maxFunnel = Math.max(1, ...analytics.funnel.map((item) => item.value));
  const totalTemperatures = Math.max(1, analytics.temperatures.reduce((sum, item) => sum + item.value, 0));
  return <>
    <section className="analytics-hero" aria-labelledby="analytics-title">
      <div><p className="eyebrow">Sales intelligence · All recorded data</p><h1 id="analytics-title">See what sells. Know who to call next.</h1><p>Every number is calculated from LeadPilot records. Gross sales, returns, and net sales are reconciled separately; pipeline value stays separate until delivery.</p></div>
      <div className="analytics-rule"><span>Reorder rule</span><strong>{analytics.reorderCycleDays} days</strong><small>Delivered customers become reorder opportunities after this default StepFresh usage cycle.</small></div>
    </section>

    <section className="analytics-kpis" aria-label="Complete sales summary">
      <AnalyticsKpi label="Total captured" value={String(summary.totalCaptured)} detail={`${summary.legitimateLeads} legitimate`} tone="navy" />
      <AnalyticsKpi label="Hot leads" value={String(summary.hotLeads)} detail="High buying intent" tone="hot" />
      <AnalyticsKpi label="Warm leads" value={String(summary.warmLeads)} detail="Needs nurturing" tone="warm" />
      <AnalyticsKpi label="Converted" value={String(summary.convertedOrders)} detail={`${summary.conversionRate.toFixed(1)}% of legitimate leads`} tone="mint" />
      <AnalyticsKpi label="Confirmed now" value={String(summary.confirmedOrders)} detail={`${formatMoney(summary.activeOrderValue, currency)} active order value`} tone="navy" />
      <AnalyticsKpi label="In transit" value={String(summary.shippedOrders)} detail="Shipped, not delivered yet" tone="blue" />
      <AnalyticsKpi label="Delivered" value={String(summary.deliveredOrders)} detail={`${summary.deliveryRate.toFixed(1)}% of converted orders`} tone="mint" />
      <AnalyticsKpi label="Gross sales" value={formatMoney(summary.grossSalesValue, currency)} detail="Completed deliveries before returns" tone="navy" />
      <AnalyticsKpi label="Returned value" value={formatMoney(summary.returnedValue, currency)} detail={`${summary.returnedOrders} returned · ${summary.returnRate.toFixed(1)}% return rate`} tone="danger" />
      <AnalyticsKpi label="Net sales after returns" value={formatMoney(summary.netSalesValue, currency)} detail={`Net AOV ${formatMoney(summary.averageOrderValue, currency)}`} tone="mint" />
      <AnalyticsKpi label="Cancelled" value={String(summary.cancelledOrders)} detail={`${formatMoney(summary.cancelledValue, currency)} cancelled value`} tone="danger" />
      <AnalyticsKpi label="Reorder due" value={String(summary.reorderDue)} detail={`${summary.reorderDueSoon} due within 7 days`} tone="purple" />
    </section>

    <section className="analytics-grid">
      <article className="analytics-panel analytics-trend-panel">
        <PanelHeading eyebrow="Last 8 weeks" title="Lead and delivered-value trend" note="Bars show captured leads; mint shows delivered value." />
        <div className="trend-chart" role="img" aria-label="Eight-week chart of captured leads and delivered sales value">
          {analytics.weeklyTrend.map((item) => <div className="trend-week" key={item.label}>
            <div className="trend-plot">
              <span className="trend-value" style={{ height: `${Math.max(item.deliveredValue ? 8 : 0, (item.deliveredValue / maxWeeklyValue) * 100)}%` }} title={`${formatMoney(item.deliveredValue, currency)} delivered`} />
              <span className="trend-leads" style={{ height: `${Math.max(item.leads ? 8 : 0, (item.leads / maxWeeklyLeads) * 100)}%` }} title={`${item.leads} leads`} />
            </div>
            <strong>{item.leads} lead{item.leads === 1 ? "" : "s"}</strong><em>{item.deliveredValue ? formatMoney(item.deliveredValue, currency) : "No delivered value"}</em><small>{item.label}</small>
          </div>)}
        </div>
        <div className="chart-legend"><span><i className="legend-leads" />Captured leads</span><span><i className="legend-value" />Delivered value</span></div>
      </article>

      <article className="analytics-panel">
        <PanelHeading eyebrow="Sales funnel" title="From enquiry to delivery" note="Current status view of legitimate leads." />
        <div className="funnel-chart">
          {analytics.funnel.map((item, index) => <div className="funnel-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.value / maxFunnel) * 100}%` }} /></div><strong>{item.value}</strong><small>{index ? percentageOf(item.value, analytics.funnel[0].value) : 100}%</small></div>)}
        </div>
      </article>

      <article className="analytics-panel">
        <PanelHeading eyebrow="Lead quality" title="Hot, warm and cold mix" note="Based on transparent LeadPilot scoring." />
        <div className="temperature-chart">
          <div className="temperature-bar">{analytics.temperatures.map((item) => <i className={`temperature-${item.label.toLowerCase()}`} key={item.label} style={{ width: `${(item.value / totalTemperatures) * 100}%` }} />)}</div>
          {analytics.temperatures.map((item) => <div className="temperature-row" key={item.label}><span><i className={`dot-${item.label.toLowerCase()}`} />{item.label}</span><strong>{item.value}</strong><small>{percentageOf(item.value, totalTemperatures)}%</small></div>)}
        </div>
        <div className="revenue-health">
          <div><span>Active pipeline</span><strong>{formatMoney(summary.pipelineValue, currency)}</strong></div>
          <div><span>Active orders</span><strong>{formatMoney(summary.activeOrderValue, currency)}</strong></div>
          <div><span>Return rate</span><strong>{summary.returnRate.toFixed(1)}%</strong></div>
        </div>
      </article>

      <article className="analytics-panel analytics-insights">
        <PanelHeading eyebrow="Automatic insights" title="What needs attention" note="Deterministic findings from the latest records." />
        <ol>{analytics.insights.map((insight, index) => <li key={insight}><span>{String(index + 1).padStart(2, "0")}</span><p>{insight}</p></li>)}</ol>
      </article>
    </section>

    <section className="analytics-panel analytics-table-panel">
      <PanelHeading eyebrow="Channel performance" title="Which source creates retained sales" note="Gross sales minus returned value equals net sales for every source." />
      <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Source</th><th>Leads</th><th>Converted</th><th>Kept deliveries</th><th>Returns</th><th>Return rate</th><th>Gross sales</th><th>Returned value</th><th>Net sales</th></tr></thead><tbody>{analytics.sources.map((item) => <tr key={item.source}><td><strong>{item.source}</strong></td><td>{item.leads}</td><td>{item.converted}</td><td>{item.delivered}</td><td>{item.returned}</td><td>{item.returnRate.toFixed(1)}%</td><td>{formatMoney(item.grossSalesValue, currency)}</td><td>{formatMoney(item.returnedValue, currency)}</td><td><strong>{formatMoney(item.netSalesValue, currency)}</strong></td></tr>)}</tbody></table>{analytics.sources.length === 0 ? <div className="analytics-empty">Source performance will appear after leads are captured.</div> : null}</div>
    </section>

    <section className="analytics-panel analytics-table-panel reorder-panel">
      <div className="reorder-heading"><PanelHeading eyebrow="Repeat sales" title="Repeat-order schedule" note={`Every delivered customer and the next owner-reviewed contact date using the ${analytics.reorderCycleDays}-day StepFresh cycle.`} /><span className="reorder-count">{summary.reorderDue} due · {summary.reorderDueSoon} soon</span></div>
      <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Customer</th><th>Last package</th><th>Last value</th><th>Delivered</th><th>Contact again</th><th>Status</th><th>Action</th></tr></thead><tbody>{analytics.reorderOpportunities.map((item) => <tr key={item.leadId}><td><strong>{item.customerName}</strong><small>{item.contact}</small></td><td>{item.serviceRequested}</td><td><strong>{formatMoney(item.lastOrderValue, currency)}</strong></td><td>{formatShortDate(item.deliveredAt, timezone)}</td><td>{formatShortDate(item.reorderAt, timezone)}</td><td><span className={item.daysUntil > 7 ? "reorder-planned" : item.daysUntil > 0 ? "reorder-soon" : "reorder-overdue"}>{item.daysOverdue ? `${item.daysOverdue}d overdue` : item.daysUntil ? `In ${item.daysUntil}d` : "Due today"}</span></td><td><button className="analytics-open-button" onClick={() => onOpenLead(item.leadId)} type="button">Open lead</button></td></tr>)}</tbody></table>{analytics.reorderOpportunities.length === 0 ? <div className="analytics-empty"><strong>No delivered customer yet.</strong><span>The repeat-order schedule begins automatically after the first delivery.</span></div> : null}</div>
    </section>
    <footer className="product-footer"><span>AgentSiraji LeadPilot Analytics</span><span>Captured · Converted · Delivered · Reordered</span></footer>
  </>;
}

function AnalyticsKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`analytics-kpi analytics-kpi-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PanelHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return <header className="panel-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div><small>{note}</small></header>;
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

function makePreviewLeads(now: number): PreviewLead[] {
  return [
    makePreview("nusrat-jahan", "Nusrat Jahan", "", "Ami 2 bottle order korte chai. Dhaka delivery, COD hobe?", "2 bottles — ৳800", "Facebook", 88, "Hot", "New", "Reply Approval", 800, 18, now),
    makePreview("rafi-ahmed", "Rafi Ahmed", "", "One bottle price koto and Chattogram e delivery time?", "1 bottle — ৳450", "Messenger", 74, "Hot", "Contacted", "Follow-up Due", 450, 240, now),
    {
      ...makePreview("sadia-rahman", "Sadia Rahman", "sadia@example.com", "I want 2 bottles. District: Dhaka. Thana/Upazila: Savar. Delivery address: House 12, Road 3, Savar. Payment: Cash on delivery.", "2 bottles — ৳800", "Facebook order form", 67, "Warm", "Order Confirmed", "Confirmation Approval", 800, 1_680, now),
      phone: "+8801712345678",
      location: "Savar, Dhaka",
      draft: {
        id: "demo-order-confirmation",
        draftType: "order_confirmation",
        subject: "StepFresh order confirmation",
        message: "প্রিয় Sadia Rahman,\n\nআপনার StepFresh অর্ডারটি নিশ্চিত করা হয়েছে ✅\n\nঅর্ডার: 2 bottles\nমোট: ৳800\nফোন: +8801712345678\nডেলিভারি এলাকা: Savar, Dhaka\nঠিকানা: House 12, Road 3, Savar\nপেমেন্ট: ক্যাশ অন ডেলিভারি\n\nপণ্য কুরিয়ারে দেওয়ার পর আমরা আপনাকে জানাব।\n\nধন্যবাদ,\nStepFresh",
        approvalStatus: "pending",
        sentAt: null,
      },
    },
    makePreview("tanvir-hasan", "Tanvir Hasan", "", "I need one bottle in Sylhet.", "1 bottle — ৳450", "Facebook", 72, "Hot", "Shipped", "In delivery", 450, 2_880, now),
    makePreview("mahiya-islam", "Mahiya Islam", "", "Received my two bottles, thank you.", "2 bottles — ৳800", "Messenger", 82, "Hot", "Delivered", "Complete", 800, 5_760, now),
  ];
}

function makePreview(id: string, customerName: string, email: string, originalMessage: string, serviceRequested: string, source: string, leadScore: number, temperature: LeadTemperature, pipelineStatus: LeadStatus, attentionState: string, expectedValue: number, minutesAgo: number, now: number): PreviewLead {
  const createdAt = new Date(now - minutesAgo * 60_000).toISOString();
  return { id, customerName, email, phone: null, originalMessage, serviceRequested, location: null, preferredDate: null, source, leadScore, temperature, pipelineStatus, attentionState, expectedValue, doNotContact: false, possibleSpam: false, createdAt, updatedAt: createdAt, lastCustomerActivityAt: createdAt };
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "LeadPilot could not complete that request."; }
function parseJson<T>(value: string | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function latestCustomerReplyFromEvents(events: EventRow[] | undefined) {
  const event = events?.find((item) => item.eventType === "customer_reply_recorded");
  return event ? customerReplyFromEvent(event) : null;
}
function customerReplyFromEvent(event: EventRow) {
  if (event.eventType !== "customer_reply_recorded") return null;
  const data = parseJson<{ message?: unknown; receivedAt?: unknown }>(event.eventDataJson, {});
  if (typeof data.message !== "string" || !data.message.trim()) return null;
  return {
    message: data.message.trim(),
    receivedAt: typeof data.receivedAt === "string" ? data.receivedAt : event.createdAt,
    createdBy: event.createdBy,
    automatic: ["Facebook Messenger", "WhatsApp"].includes(event.createdBy),
    channel: ["Facebook Messenger", "WhatsApp"].includes(event.createdBy)
      ? event.createdBy
      : `Manual · ${event.createdBy}`,
  };
}
function relativeTime(value: string, now: number) { const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000)); return minutes < 60 ? `${minutes} min ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
function formatDateTime(value: string, timezone = "UTC") { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
function formatShortDate(value: string, timezone = "UTC") { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: timezone }).format(new Date(value)); }
function formatMoney(value: number, currency: string) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); } catch { return `${currency} ${Math.round(value)}`; } }
function percentageOf(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
