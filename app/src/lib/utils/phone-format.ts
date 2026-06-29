/**
 * Phone formatting utilities.
 * Formats raw digits into +7 (XXX) XXX-XX-XX for Russian numbers,
 * free international format otherwise.
 */

/** Convert raw digits (with optional +) to formatted phone string */
export function rawToFormatted(raw: string): string {
	const hasPlus = raw.startsWith("+");
	const digits = raw.replace(/\D/g, "");

	if (digits.length === 0) return hasPlus ? "+" : "";

	if (digits.startsWith("7")) {
		const d = digits.slice(1);
		if (d.length === 0) return "+7";
		if (d.length <= 3) return `+7 (${d}`;
		if (d.length <= 6) return `+7 (${d.slice(0, 3)}) ${d.slice(3)}`;
		if (d.length <= 8) return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
		if (d.length <= 10) return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
		return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
	}

	if (hasPlus) return `+${digits}`;
	return digits;
}

/** Strip all non-digit/non-+ chars, keep one leading + */
export function cleanPhone(value: string): string {
	const clean = value.replace(/[^+\d]/g, "");
	const plus = clean.startsWith("+") ? "+" : "";
	const digits = clean.replace(/\D/g, "");
	return plus + digits;
}
