const quantityAndUnitPattern = /\b(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i;

const explicitOrderPatterns = [
  /\b(?:i\s+)?(?:want|need|would\s+like|like)\s+(?:to\s+)?(?:(?:order|buy|purchase|get|take)\s+)?(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:can|could|may)\s+i\s+(?:order|buy|purchase|get|take)\s+(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:please\s+)?(?:order|buy|purchase|get|take)\s+(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:ami\s+)?(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\s+(?:order\s+(?:korte|korbo)|nite|kinte)\s+chai\b/i,
  /(?:অর্ডার|কিনতে|নিতে).*(?:চাই|চাইছি|করবো)/u,
];

export function hasExplicitOrderIntent(message: string) {
  if (!quantityAndUnitPattern.test(message)) return false;
  return explicitOrderPatterns.some((pattern) => pattern.test(message));
}
