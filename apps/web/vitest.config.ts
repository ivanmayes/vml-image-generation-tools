/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';

export default defineConfig({
	plugins: [
		angular({
			tsconfig: resolve(__dirname, 'tsconfig.spec.json'),
			workspaceRoot: resolve(__dirname),
		}),
	],
	test: {
		globals: true,
		environment: 'happy-dom',
		include: ['src/**/*.spec.ts'],
		setupFiles: ['./src/test-setup.ts'],
		reporters: ['default'],
		maxWorkers: 1,
		isolate: false,
		server: {
			deps: {
				inline: ['@angular', 'rxjs', 'primeng'],
			},
		},
	},
});
