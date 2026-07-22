import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'build',
		emptyOutDir: true,
	},
	css: {
		preprocessorOptions: {
			scss: {
				// The stylesheet still uses legacy @import and lighten()/darken();
				// those compile fine, we just silence the deprecation noise.
				silenceDeprecations: ['legacy-js-api', 'import', 'color-functions', 'global-builtin'],
			},
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: './src/test-setup.js',
		include: ['src/**/*.test.{js,jsx}'],
	},
});
