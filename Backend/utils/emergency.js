const EMERGENCY_PATTERNS = [
    /\bchest pain\b/i,
    /\bcan(?:'?t|not) breathe\b/i,
    /\bdifficulty breathing\b/i,
    /\bshortness of breath\b/i,
    /\bsevere bleeding\b/i,
    /\bbleeding heavily\b/i,
    /\bstroke\b/i,
    /\bheart attack\b/i,
    /\bunconscious\b/i,
    /\bpassed out\b/i,
    /\bseizure\b/i,
    /\boverdose\b/i,
    /\bpoison(ed|ing)?\b/i,
    /\banaphyla(xis|ctic)\b/i,
    /\bsuicid(e|al)\b/i,
    /\bself[- ]harm\b/i,
    /\bkill myself\b/i,
    /\bend my life\b/i
];

export const isEmergencyMessage = (text) => (
    typeof text === "string" && EMERGENCY_PATTERNS.some((pattern) => pattern.test(text))
);

export const EMERGENCY_MESSAGE = `This sounds like it could be a medical emergency. Please stop using this chat and contact your local emergency services right now. In India, call 112 (or 108 for ambulance services). If you are with someone who is unconscious, not breathing, or bleeding heavily, call for emergency help immediately and follow the dispatcher's instructions.

I am a research prototype and cannot provide emergency care. Once the person is safe and has been seen by a qualified clinician, I can help explain general medical information.`;
