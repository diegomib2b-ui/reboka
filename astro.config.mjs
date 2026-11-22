import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// TODO: trocar pelo domínio definitivo quando for registrado
export default defineConfig({
  site: 'https://reboka.com.br',
  integrations: [react(), sitemap({ filter: (p) => !/\/(app|entrar|cadastro)\//.test(p) })],
});
