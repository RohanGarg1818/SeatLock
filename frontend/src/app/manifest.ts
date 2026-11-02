import type { MetadataRoute } from 'next';

// Lets people add the site to their phone's home screen, where it opens like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SeatLock', short_name: 'SeatLock', description: 'Campus event registration where no seat is ever sold twice.',
    start_url: '/', display: 'standalone', background_color: '#ebe5e3', theme_color: '#0f7d45',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
