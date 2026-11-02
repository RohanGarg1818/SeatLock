import type { MetadataRoute } from 'next';
import { publicFetch } from '@/lib/server';
import type { PublicEvent } from '@/lib/types';

const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await publicFetch<{ events: PublicEvent[] }>('/public/events', 300);
  return [
    { url: site, changeFrequency: 'daily', priority: 1 },
    ...(data?.events ?? []).map((e) => ({ url: `${site}/e/${e.slug}`, changeFrequency: 'hourly' as const, priority: 0.8 })),
  ];
}
