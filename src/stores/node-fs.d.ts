/**
 * Minimal ambient typing for the lazy `import("node:fs/promises")` in
 * FileRuleStore. The project deliberately ships without `@types/node` so
 * Node globals cannot silently leak into runtime-agnostic code; this file
 * declares only the three functions FileRuleStore actually calls.
 */
declare module "node:fs/promises" {
	export function readFile(path: string, encoding: "utf8"): Promise<string>;
	export function writeFile(
		path: string,
		data: string,
		encoding: "utf8",
	): Promise<void>;
	export function rename(oldPath: string, newPath: string): Promise<void>;
}
