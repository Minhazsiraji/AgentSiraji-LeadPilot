export type Level = "high" | "medium" | "low";
export type FitLevel = "supported" | "unsupported" | "unknown";
export type Temperature = "Hot" | "Warm" | "Cold";
export type PipelineStatus = "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";

export type BusinessProfile = {
  name: string;
  description: string;
  timezone: string;
  currency: string;
  services: string[];
  excludedServices: string[];
  serviceAreas: string[];
  businessHours: string;
  responseTone: string;
  qualificationFields: string[];
  followUpDays: number[];
  prohibitedClaims: string[];
};

export type LeadInput = {
  customerName: string;
  email?: string | null;
  phone?: string | null;
  message: string;
  source: string;
  submittedAt: string;
};

export type ScoreBreakdown = {
  serviceFit: number;
  purchaseIntent: number;
  urgency: number;
  completeness: number;
  engagement: number;
  total: number;
};

export type LeadAnalysis = {
  language: string;
  messageType: "sales_enquiry" | "support_request" | "job_application" | "vendor_message" | "spam" | "other";
  serviceRequested: string | null;
  location: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  preferredDate: string | null;
  preferredDateText: string | null;
  scopeDetails: string[];
  urgency: Level;
  urgencyReason: string;
  purchaseIntent: Level;
  purchaseIntentReason: string;
  serviceFit: FitLevel;
  locationFit: FitLevel;
  knownFacts: string[];
  missingInformation: string[];
  recommendedNextAction: string;
  suggestedQuestions: string[];
  possibleSpam: boolean;
  doNotContact: boolean;
  requiresHumanReview: boolean;
  confidence: Level;
  score: ScoreBreakdown;
  temperature: Temperature;
};

export type ReplyDraft = {
  subject: string | null;
  message: string;
  requestedInformation: string[];
  proposedNextAction: string;
  requiresHumanReview: boolean;
  reviewReason: string | null;
};
