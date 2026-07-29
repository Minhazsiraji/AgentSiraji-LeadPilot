import type { PipelineStatus } from "./types";

const ORDER_TRANSITIONS: Partial<Record<PipelineStatus, PipelineStatus[]>> = {
  New: ["Order Confirmed", "Cancelled"],
  Contacted: ["Order Confirmed", "Cancelled"],
  "Order Confirmed": ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Cancelled"],
  Delivered: ["Returned"],
  Cancelled: [],
  Returned: [],
};

export function nextOrderStatuses(current: PipelineStatus): PipelineStatus[] {
  return ORDER_TRANSITIONS[current] ?? [];
}

export function isValidOrderTransition(current: PipelineStatus, next: PipelineStatus) {
  return current === next || nextOrderStatuses(current).includes(next);
}

export function orderStatusAction(status: PipelineStatus) {
  const labels: Partial<Record<PipelineStatus, string>> = {
    "Order Confirmed": "Confirm order",
    Shipped: "Mark shipped",
    Delivered: "Mark delivered",
    Cancelled: "Cancel order",
    Returned: "Mark returned",
  };
  return labels[status] ?? `Move to ${status}`;
}
