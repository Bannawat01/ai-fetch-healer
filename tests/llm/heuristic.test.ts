import { describe, expect, it } from "vitest";
import { HeuristicHealer } from "../../src/llm/heuristic";

describe("HeuristicHealer", () => {
	const healer = new HeuristicHealer();

	it("renames a camelCase payload key to the snake_case the API asked for", async () => {
		const result = await healer.heal(
			{ fullName: "string", email: "masked_email" },
			'422 Unprocessable Entity: field "full_name" is required',
		);

		expect(result.rule).toEqual({
			action: "MAP_FIELDS",
			mapping: { fullName: "full_name" },
			suggestion: expect.any(String),
		});
	});

	it("renames snake_case to the camelCase the API asked for", async () => {
		const result = await healer.heal(
			{ user_id: "number" },
			"400 Bad Request: unknown field user_id; did you mean userId?",
		);

		expect(result.rule.mapping).toEqual({ user_id: "userId" });
	});

	it("handles multiple mismatched fields at once", async () => {
		const result = await healer.heal(
			{ firstName: "string", lastName: "string" },
			"missing required: first_name, last_name",
		);

		expect(result.rule.mapping).toEqual({
			firstName: "first_name",
			lastName: "last_name",
		});
	});

	it("throws when no error-mentioned field matches a payload key", async () => {
		await expect(
			healer.heal({ fullName: "string" }, "500 Internal Server Error"),
		).rejects.toThrow(/no deterministic field-casing fix/);
	});

	it("does not rename when the API used the exact same spelling", async () => {
		await expect(
			healer.heal(
				{ email: "masked_email" },
				'400: "email" has an invalid format',
			),
		).rejects.toThrow(/no deterministic field-casing fix/);
	});

	it("does not rename to a target that already exists in the payload", async () => {
		// Both spellings already present - the mismatch isn't casing, so skip.
		await expect(
			healer.heal(
				{ fullName: "string", full_name: "string" },
				"full_name is required",
			),
		).rejects.toThrow(/no deterministic field-casing fix/);
	});

	it("throws on a non-object schema instead of guessing", async () => {
		await expect(
			healer.heal(["a", "b"] as unknown as never, "full_name required"),
		).rejects.toThrow(/no deterministic field-casing fix/);
	});
});
