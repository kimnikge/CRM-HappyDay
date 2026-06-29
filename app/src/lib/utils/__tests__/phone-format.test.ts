/**
 * Tests for phone formatting utilities.
 */
import { describe, it, expect } from "vitest";
import { rawToFormatted, cleanPhone } from "$lib/utils/phone-format";

describe("rawToFormatted", () => {
	// ---- Russian +7 format ----
	it("formats empty to empty", () => {
		expect(rawToFormatted("")).toBe("");
	});

	it("formats + only", () => {
		expect(rawToFormatted("+")).toBe("+");
	});

	it('formats +7 prefix', () => {
		expect(rawToFormatted("+7")).toBe("+7");
	});

	it('formats partial: +7 (9', () => {
		expect(rawToFormatted("+79")).toBe("+7 (9");
	});

	it('formats partial: +7 (999', () => {
		expect(rawToFormatted("+7999")).toBe("+7 (999");
	});

	it('formats partial: +7 (999) 1', () => {
		expect(rawToFormatted("+79991")).toBe("+7 (999) 1");
	});

	it('formats partial: +7 (999) 123', () => {
		expect(rawToFormatted("+7999123")).toBe("+7 (999) 123");
	});

	it('formats partial: +7 (999) 123-4', () => {
		expect(rawToFormatted("+79991234")).toBe("+7 (999) 123-4");
	});

	it('formats full: +7 (999) 123-45', () => {
		expect(rawToFormatted("+799912345")).toBe("+7 (999) 123-45");
	});

	it('formats full: +7 (999) 123-45-67', () => {
		expect(rawToFormatted("+79991234567")).toBe("+7 (999) 123-45-67");
	});

	it('caps at 10 digits after 7', () => {
		expect(rawToFormatted("+799912345678")).toBe("+7 (999) 123-45-67");
		expect(rawToFormatted("+79991234567890")).toBe("+7 (999) 123-45-67");
	});

	// ---- Digits without + (raw input) ----
	it("formats digits starting with 7 without +", () => {
		expect(rawToFormatted("79991234567")).toBe("+7 (999) 123-45-67");
	});

	it("formats digits not starting with 7 as-is", () => {
		expect(rawToFormatted("9991234567")).toBe("9991234567");
	});

	// ---- International ----
	it("formats international: +44", () => {
		expect(rawToFormatted("+44")).toBe("+44");
	});

	it("formats international: +447700900123", () => {
		expect(rawToFormatted("+447700900123")).toBe("+447700900123");
	});

	it("formats international with many digits", () => {
		expect(rawToFormatted("+8613800138000")).toBe("+8613800138000");
	});

	// ---- Edge cases ----
	it("handles just digit 7", () => {
		expect(rawToFormatted("7")).toBe("+7");
	});

	it("handles + with no digits", () => {
		expect(rawToFormatted("+")).toBe("+");
	});

	it("handles empty string", () => {
		expect(rawToFormatted("")).toBe("");
	});
});

describe("cleanPhone", () => {
	it("strips letters", () => {
		expect(cleanPhone("+7abc999")).toBe("+7999");
	});

	it("strips spaces and formatting", () => {
		expect(cleanPhone("+7 (999) 123-45-67")).toBe("+79991234567");
	});

	it("handles input without +", () => {
		expect(cleanPhone("9991234567")).toBe("9991234567");
	});

	it("strips all non-digit non-plus chars", () => {
		expect(cleanPhone("Зврпит+7abc")).toBe("+7");
	});

	it("preserves + and digits only", () => {
		expect(cleanPhone("+7 (999) abc 123")).toBe("+7999123");
	});

	it("handles empty string", () => {
		expect(cleanPhone("")).toBe("");
	});
});
