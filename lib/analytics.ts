export type AnalyticsLead = {
  id: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  serviceRequested: string | null;
  source: string;
  temperature: string;
  pipelineStatus: string;
  expectedValue: number;
  possibleSpam: boolean;
  doNotContact: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

export type AnalyticsEvent = {
  leadId: string;
  eventType: string;
  eventDataJson: string;
  createdAt: string;
};

export type LeadPilotAnalytics = {
  summary: {
    totalCaptured: number;
    legitimateLeads: number;
    hotLeads: number;
    warmLeads: number;
    convertedOrders: number;
    confirmedOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    returnedOrders: number;
    grossSalesValue: number;
    returnedValue: number;
    netSalesValue: number;
    generatedValue: number;
    pipelineValue: number;
    activeOrderValue: number;
    cancelledValue: number;
    averageOrderValue: number;
    conversionRate: number;
    deliveryRate: number;
    cancellationRate: number;
    returnRate: number;
    reorderDue: number;
    reorderDueSoon: number;
  };
  funnel: Array<{ label: string; value: number }>;
  weeklyTrend: Array<{ label: string; leads: number; deliveredValue: number }>;
  temperatures: Array<{ label: string; value: number }>;
  sources: Array<{
    source: string;
    leads: number;
    converted: number;
    delivered: number;
    returned: number;
    conversionRate: number;
    returnRate: number;
    grossSalesValue: number;
    returnedValue: number;
    netSalesValue: number;
    value: number;
  }>;
  reorderOpportunities: Array<{
    leadId: string;
    customerName: string;
    contact: string;
    serviceRequested: string;
    lastOrderValue: number;
    deliveredAt: string;
    reorderAt: string;
    daysOverdue: number;
    daysUntil: number;
  }>;
  insights: string[];
  reorderCycleDays: number;
};

const CLOSED_STATUSES = new Set(["Delivered", "Cancelled", "Returned", "Lost"]);
const CONVERTED_STATUSES = new Set(["Order Confirmed", "Shipped", "Delivered"]);

export function buildLeadPilotAnalytics(
  allLeads: AnalyticsLead[],
  events: AnalyticsEvent[],
  nowIso = new Date().toISOString(),
  reorderCycleDays = 30,
): LeadPilotAnalytics {
  const now = safeDate(nowIso);
  const legitimate = allLeads.filter((lead) => !lead.possibleSpam);
  const active = legitimate.filter((lead) => !CLOSED_STATUSES.has(lead.pipelineStatus) && !lead.doNotContact);
  const converted = legitimate.filter((lead) => CONVERTED_STATUSES.has(lead.pipelineStatus));
  const confirmed = legitimate.filter((lead) => lead.pipelineStatus === "Order Confirmed");
  const shipped = legitimate.filter((lead) => lead.pipelineStatus === "Shipped");
  const delivered = legitimate.filter((lead) => lead.pipelineStatus === "Delivered");
  const cancelled = legitimate.filter((lead) => lead.pipelineStatus === "Cancelled");
  const returned = legitimate.filter((lead) => lead.pipelineStatus === "Returned");
  const grossSalesValue = sumValue([...delivered, ...returned]);
  const returnedValue = sumValue(returned);
  const netSalesValue = Math.max(0, grossSalesValue - returnedValue);
  const generatedValue = netSalesValue;
  const cancelledValue = sumValue(cancelled);
  const deliveryDates = new Map(delivered.map((lead) => [lead.id, deliveredDateFor(lead, events)]));
  const reorderThreshold = reorderCycleDays * 86_400_000;

  const reorderOpportunities = delivered
    .map((lead) => {
      const deliveredAt = deliveryDates.get(lead.id) ?? safeDate(lead.updatedAt || lead.createdAt);
      const reorderAt = new Date(deliveredAt.getTime() + reorderThreshold);
      return {
        leadId: lead.id,
        customerName: lead.customerName,
        contact: lead.phone || lead.email || "No contact method",
        serviceRequested: lead.serviceRequested || "Order details unavailable",
        lastOrderValue: lead.expectedValue,
        deliveredAt: deliveredAt.toISOString(),
        reorderAt: reorderAt.toISOString(),
        daysOverdue: Math.max(0, Math.floor((now.getTime() - reorderAt.getTime()) / 86_400_000)),
        daysUntil: Math.max(0, Math.ceil((reorderAt.getTime() - now.getTime()) / 86_400_000)),
      };
    })
    .sort((a, b) => safeDate(a.reorderAt).getTime() - safeDate(b.reorderAt).getTime());

  const reorderDue = reorderOpportunities.filter((item) => safeDate(item.reorderAt).getTime() <= now.getTime()).length;
  const reorderDueSoon = reorderOpportunities.filter((item) => item.daysUntil > 0 && item.daysUntil <= 7).length;

  const sources = Array.from(new Set(legitimate.map((lead) => lead.source || "Unknown")))
    .map((source) => {
      const sourceLeads = legitimate.filter((lead) => (lead.source || "Unknown") === source);
      const sourceConverted = sourceLeads.filter((lead) => CONVERTED_STATUSES.has(lead.pipelineStatus));
      const sourceDelivered = sourceLeads.filter((lead) => lead.pipelineStatus === "Delivered");
      const sourceReturned = sourceLeads.filter((lead) => lead.pipelineStatus === "Returned");
      const sourceGrossSalesValue = sumValue([...sourceDelivered, ...sourceReturned]);
      const sourceReturnedValue = sumValue(sourceReturned);
      const sourceNetSalesValue = Math.max(0, sourceGrossSalesValue - sourceReturnedValue);
      return {
        source,
        leads: sourceLeads.length,
        converted: sourceConverted.length,
        delivered: sourceDelivered.length,
        returned: sourceReturned.length,
        conversionRate: percent(sourceConverted.length, sourceLeads.length),
        returnRate: percent(sourceReturned.length, sourceDelivered.length + sourceReturned.length),
        grossSalesValue: sourceGrossSalesValue,
        returnedValue: sourceReturnedValue,
        netSalesValue: sourceNetSalesValue,
        value: sourceNetSalesValue,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.netSalesValue - a.netSalesValue);

  const weeklyTrend = lastEightWeeks(now).map((week) => ({
    label: week.label,
    leads: legitimate.filter((lead) => inRange(safeDate(lead.createdAt), week.start, week.end)).length,
    deliveredValue: delivered
      .filter((lead) => inRange(deliveryDates.get(lead.id) ?? safeDate(lead.updatedAt || lead.createdAt), week.start, week.end))
      .reduce((sum, lead) => sum + lead.expectedValue, 0),
  }));

  const summary = {
    totalCaptured: allLeads.length,
    legitimateLeads: legitimate.length,
    hotLeads: legitimate.filter((lead) => lead.temperature === "Hot").length,
    warmLeads: legitimate.filter((lead) => lead.temperature === "Warm").length,
    convertedOrders: converted.length,
    confirmedOrders: confirmed.length,
    shippedOrders: shipped.length,
    deliveredOrders: delivered.length,
    cancelledOrders: cancelled.length,
    returnedOrders: returned.length,
    grossSalesValue,
    returnedValue,
    netSalesValue,
    generatedValue,
    pipelineValue: sumValue(active),
    activeOrderValue: sumValue([...confirmed, ...shipped]),
    cancelledValue,
    averageOrderValue: delivered.length ? generatedValue / delivered.length : 0,
    conversionRate: percent(converted.length, legitimate.length),
    deliveryRate: percent(delivered.length, converted.length),
    cancellationRate: percent(cancelled.length, converted.length + cancelled.length),
    returnRate: percent(returned.length, delivered.length + returned.length),
    reorderDue,
    reorderDueSoon,
  };

  const bestSource = sources.find((item) => item.leads > 0);
  const nextReorder = reorderOpportunities[0];
  const insights = [
    legitimate.length
      ? `${summary.conversionRate.toFixed(1)}% of legitimate leads are currently converted into confirmed, shipped, or delivered orders.`
      : "No legitimate leads have been captured yet.",
    grossSalesValue
      ? `${delivered.length + returned.length} completed deliver${delivered.length + returned.length === 1 ? "y" : "ies"} generated ${Math.round(grossSalesValue).toLocaleString("en-US")} in gross sales; after ${Math.round(returnedValue).toLocaleString("en-US")} in returns, net sales are ${Math.round(netSalesValue).toLocaleString("en-US")}.`
      : "No delivered sales value has been recorded yet.",
    confirmed.length || shipped.length
      ? `${confirmed.length + shipped.length} converted order${confirmed.length + shipped.length === 1 ? "" : "s"} remain active: ${confirmed.length} confirmed and ${shipped.length} in transit, worth ${Math.round(summary.activeOrderValue).toLocaleString("en-US")}.`
      : "No converted order is currently waiting for shipment or delivery.",
    cancelled.length || returned.length
      ? `${cancelled.length} cancelled and ${returned.length} returned order${cancelled.length + returned.length === 1 ? "" : "s"} are recorded; cancelled value is ${Math.round(cancelledValue).toLocaleString("en-US")} and the return rate is ${summary.returnRate.toFixed(1)}%.`
      : "No cancelled or returned orders are currently recorded.",
    reorderDue
      ? `${reorderDue} delivered customer${reorderDue === 1 ? " is" : "s are"} past the ${reorderCycleDays}-day reorder point and ready for owner-reviewed outreach.`
      : nextReorder
        ? `The next repeat-order contact is scheduled in ${nextReorder.daysUntil} day${nextReorder.daysUntil === 1 ? "" : "s"}; no customer is overdue.`
        : "Repeat-order timing will appear after the first delivered order.",
    bestSource
      ? `${bestSource.source} is the largest source with ${bestSource.leads} lead${bestSource.leads === 1 ? "" : "s"}, ${bestSource.delivered} kept deliver${bestSource.delivered === 1 ? "y" : "ies"}, and ${Math.round(bestSource.netSalesValue).toLocaleString("en-US")} in net sales.`
      : "Lead-source performance will appear after enquiries are captured.",
  ];

  return {
    summary,
    funnel: [
      { label: "Captured", value: legitimate.length },
      { label: "Hot + warm", value: legitimate.filter((lead) => ["Hot", "Warm"].includes(lead.temperature)).length },
      { label: "Converted", value: converted.length },
      { label: "Shipped", value: shipped.length + delivered.length },
      { label: "Delivered", value: delivered.length },
    ],
    weeklyTrend,
    temperatures: ["Hot", "Warm", "Cold"].map((label) => ({
      label,
      value: legitimate.filter((lead) => lead.temperature === label).length,
    })),
    sources,
    reorderOpportunities,
    insights,
    reorderCycleDays,
  };
}

function deliveredDateFor(lead: AnalyticsLead, events: AnalyticsEvent[]) {
  const matching = events
    .filter((event) => event.leadId === lead.id && event.eventType === "lead_updated")
    .find((event) => {
      try {
        const data = JSON.parse(event.eventDataJson) as { pipelineStatus?: unknown };
        return data.pipelineStatus === "Delivered";
      } catch {
        return false;
      }
    });
  return safeDate(matching?.createdAt || lead.updatedAt || lead.createdAt);
}

function lastEightWeeks(now: Date) {
  const currentStart = startOfWeek(now);
  return Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentStart.getTime() - (7 - index) * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    return {
      start,
      end,
      label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(start),
    };
  });
}

function startOfWeek(value: Date) {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function inRange(value: Date, start: Date, end: Date) {
  return value.getTime() >= start.getTime() && value.getTime() < end.getTime();
}

function sumValue(items: AnalyticsLead[]) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.expectedValue) || 0), 0);
}

function percent(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator) * 100 : 0;
}
