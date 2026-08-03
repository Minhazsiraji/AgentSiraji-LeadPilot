const quantityAndUnitPattern = /\b(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i;

const explicitOrderPatterns = [
  /\b(?:i\s+)?(?:want|need|would\s+like|like)\s+(?:to\s+)?(?:(?:order|buy|purchase|get|take)\s+)?(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:can|could|may)\s+i\s+(?:order|buy|purchase|get|take)\s+(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:please\s+)?(?:order|buy|purchase|get|take)\s+(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i,
  /\b(?:ami\s+)?(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\s+(?:order\s+(?:korte|korbo)|nite|kinte)\s+chai\b/i,
  /(?:অর্ডার|কিনতে|নিতে).*(?:চাই|চাইছি|করবো)/u,
];

const structuredOrderFactPatterns = [
  /(?:^|[\r\n.!?।]\s*)(?:customer\s+name|name|নাম)\s*[:=-]/iu,
  /(?:^|[\r\n.!?।]\s*)(?:phone|mobile|contact|whatsapp|ফোন|মোবাইল)\s*(?:number|no\.?|#)?\s*[:=-]\s*\+?\d/iu,
  /(?:^|[\r\n.!?।]\s*)(?:delivery\s+(?:address|location)|full\s+address|address|location|ঠিকানা)\s*[:=-]/iu,
  /\b(?:cash\s+on\s+delivery|cod)\b|ক্যাশ\s+অন\s+ডেলিভারি/iu,
];

export function hasExplicitOrderIntent(message: string) {
  if (!quantityAndUnitPattern.test(message)) return false;
  if (explicitOrderPatterns.some((pattern) => pattern.test(message))) return true;

  const structuredFactCount = structuredOrderFactPatterns
    .filter((pattern) => pattern.test(message))
    .length;
  return structuredFactCount >= 2;
}
