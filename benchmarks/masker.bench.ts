import { bench, describe } from "vitest";
import { Masker } from "../src/security/masker";

const masker = new Masker();

const flatPayload = {
	email: "user@example.com",
	username: "coach.ra47",
	password: "hunter2",
	age: 30,
	isActive: true,
	name: "Coach",
};

const nestedPayload = {
	user: {
		profile: {
			email: "nested@example.com",
			phone: "0812345678",
			address: {
				street: "123 Main St",
				city: "Bangkok",
				zip: "10110",
			},
		},
		preferences: {
			newsletter: true,
			theme: "dark",
		},
	},
	orders: [
		{ id: 1, amount: 100, credit_card: "4111111111111111" },
		{ id: 2, amount: 200, credit_card: "4111111111111112" },
	],
};

describe("Masker.mask() - the hot path (runs on every healable response)", () => {
	bench("flat payload, 6 keys", () => {
		masker.mask(flatPayload);
	});

	bench("nested payload, 3 levels deep + array", () => {
		masker.mask(nestedPayload);
	});
});
