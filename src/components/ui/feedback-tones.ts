import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  OctagonAlert,
} from "lucide-react";

type FeedbackTone = "danger" | "info" | "ok" | "success" | "warn" | "warning";
type NormalizedFeedbackTone = "danger" | "info" | "ok" | "warn";

const feedbackToneIcons: Record<NormalizedFeedbackTone, LucideIcon> = {
  danger: OctagonAlert,
  info: Info,
  ok: CheckCircle2,
  warn: AlertTriangle,
};

function normalizeFeedbackTone(tone: FeedbackTone): NormalizedFeedbackTone {
  if (tone === "success") {
    return "ok";
  }
  if (tone === "warning") {
    return "warn";
  }
  return tone;
}

function feedbackRole(tone: FeedbackTone): "alert" | "status" {
  const normalizedTone = normalizeFeedbackTone(tone);
  return normalizedTone === "danger" || normalizedTone === "warn"
    ? "alert"
    : "status";
}

function feedbackAriaLive(tone: FeedbackTone): "assertive" | "polite" {
  return feedbackRole(tone) === "alert" ? "assertive" : "polite";
}

export {
  feedbackAriaLive,
  feedbackRole,
  feedbackToneIcons,
  normalizeFeedbackTone,
};
export type { FeedbackTone, NormalizedFeedbackTone };
