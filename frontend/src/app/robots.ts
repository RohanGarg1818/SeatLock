import type { MetadataRoute } from 'next';

const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
// Public pages may be indexed; the organizer portal, admin area and personal pages may not.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/', '/api/uploads/'], disallow: ['/organizer', '/admin', '/dashboard', '/me', '/api'] }, sitemap: `${site}/sitemap.xml` };
}
