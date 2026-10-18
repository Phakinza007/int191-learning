import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
 site: 'https://phakinza007.github.io',
 base: '/int191-learning',
 trailingSlash: 'always',
 output: 'static',
 integrations: [react()],
 vite: { worker: { format: 'es' } },
});
