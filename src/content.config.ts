import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const ajuda = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ajuda' }),
  schema: z.object({ titulo: z.string(), descricao: z.string(), categoria: z.string(), ordem: z.number() }),
});

export const collections = { ajuda };
