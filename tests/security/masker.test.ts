import { describe, expect, it } from "vitest";
import { Masker, maskPayload } from "../../src/security/masker";

describe("Masker", () => {
	it("masks default sensitive keys and never leaks their values", () => {
		const masker = new Masker();
		const payload = {
			email: "user@example.com",
			username: "coach.ra47",
			password: "hunter2",
			token: "abc123",
			phone: "0812345678",
			credit_card: "4111111111111111",
			bank_account: "1234567890",
			api_key: "sk-live-secret",
		};

		const masked = masker.mask(payload) as Record<string, unknown>;

		for (const value of Object.values(masked)) {
			expect(typeof value).toBe("string");
			for (const rawValue of Object.values(payload)) {
				expect(value).not.toBe(rawValue);
			}
		}

		expect(masked.email).toBe("masked_email");
		expect(masked.phone).toBe("masked_phone");
		expect(masked.username).toBe("masked_identity");
		expect(masked.password).toBe("masked_password");
		expect(masked.token).toBe("masked_token");
		expect(masked.api_key).toBe("masked_token");
		expect(masked.credit_card).toBe("masked_credit_card");
		expect(masked.bank_account).toBe("masked_financial");
	});

	it("masks nested objects recursively without leaking nested values", () => {
		const masker = new Masker();
		const payload = {
			user: {
				profile: {
					email: "nested@example.com",
					name: "Coach",
				},
			},
		};

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.user.profile.email).toBe("masked_email");
		expect(masked.user.profile.name).toBe("string");
		expect(JSON.stringify(masked)).not.toContain("nested@example.com");
	});

	it("masks arrays by sampling only the first element's shape", () => {
		const masker = new Masker();
		const payload = {
			users: [{ email: "a@example.com" }, { email: "b@example.com" }],
		};

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.users).toHaveLength(1);
		expect(masked.users[0].email).toBe("masked_email");
	});

	it("handles empty arrays and null values without throwing", () => {
		const masker = new Masker();
		const payload = { tags: [], deletedAt: null };

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.tags).toEqual([]);
		expect(masked.deletedAt).toBe("null");
	});

	it("reduces non-sensitive scalars to their type name only", () => {
		const masker = new Masker();
		const payload = { age: 30, isActive: true, name: "Coach" };

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.age).toBe("number");
		expect(masked.isActive).toBe("boolean");
		expect(masked.name).toBe("string");
	});

	it("supports custom sensitive keys via additionalSensitiveKeys", () => {
		const masker = new Masker({
			additionalSensitiveKeys: ["customer_id", "internal_secret"],
		});
		const payload = { customer_id: "cus_12345", internal_secret: "s3cr3t" };

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.customer_id).not.toBe("cus_12345");
		expect(masked.internal_secret).not.toBe("s3cr3t");
	});

	it("uses a custom maskingString for all sensitive keys when provided", () => {
		const masker = new Masker({ maskingString: "[PROTECTED_DATA]" });
		const payload = { email: "x@example.com", password: "pw" };

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked.email).toBe("[PROTECTED_DATA]");
		expect(masked.password).toBe("[PROTECTED_DATA]");
	});

	it("detects sensitive keys case-insensitively and with separators", () => {
		const masker = new Masker();
		const payload = { "User-Email": "x@example.com", "Account-Password": "pw" };

		const masked = masker.mask(payload) as Record<string, unknown>;

		expect(masked["User-Email"]).toBe("masked_email");
		expect(masked["Account-Password"]).toBe("masked_password");
	});

	it("exports a working default-instance maskPayload helper", () => {
		const masked = maskPayload({ email: "x@example.com", age: 1 }) as Record<
			string,
			unknown
		>;

		expect(masked.email).toBe("masked_email");
		expect(masked.age).toBe("number");
	});
});
