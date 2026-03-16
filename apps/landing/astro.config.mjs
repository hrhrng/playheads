import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://playheads.ai',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
    tailwind(),
    sitemap(),
  ],
});
