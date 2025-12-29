import { defineConfig } from "vite";
import { resolve } from "path";
import { minify } from "terser";

export default defineConfig({
	build: {
		lib: {
			entry: {
				mimic: resolve(__dirname, "src/mimic.js"),
				flash: resolve(__dirname, "src/flash.js"),
			},
			formats: ["es"],
		},
		minify: false,
		sourcemap: true,
		rollupOptions: {
			output: [
				{
					// 非圧縮版
					format: "es",
					entryFileNames: "[name].js",
				},
				{
					// 圧縮版
					format: "es",
					entryFileNames: "[name].min.js",
					plugins: [
						{
							name: "terser",
							async renderChunk(code) {
								const result = await minify(code, {
									sourceMap: true,
									compress: {
										passes: 2,
									},
									mangle: true,
								});
								return {
									code: result.code,
									map: result.map,
								};
							},
						},
					],
				},
			],
		},
	},
});
