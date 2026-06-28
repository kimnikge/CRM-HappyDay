import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			'$lib': path.resolve(__dirname, 'src/lib'),
			'$env/static/public': path.resolve(__dirname, 'src/__mocks__/env-public.ts'),
			'$env/dynamic/private': path.resolve(__dirname, 'src/__mocks__/env-private.ts'),
		},
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
