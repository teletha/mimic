import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: {
				mimic: resolve(__dirname, "src/mimic.js"),
				flash: resolve(__dirname, "src/flash.js"),
			},
			formats: ["es"],
		},
		minify: "terser",
		sourcemap: true,
	},
});
