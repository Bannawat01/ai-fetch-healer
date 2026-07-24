import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["cjs", "esm"],
	// Only the library entry needs type declarations; the CLI is an executable.
	dts: { entry: "src/index.ts" },
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	// node18 matches package.json engines. FileRuleStore's lazy
	// import("node:fs/promises") comes out of the tsup pipeline as bare
	// "fs/promises" - fine on Node >=18 and aliased by edge bundlers - but
	// both spellings stay external so nothing ever tries to bundle it.
	target: ["es2022", "node18"],
	external: ["node:fs/promises", "fs/promises"],
});
