// Cloudinary signed uploads: the API only SIGNS; the browser uploads the file straight to Cloudinary,
// so image bytes never pass through (or load) our server. The API secret never leaves the server.
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import { requireRole } from '../middleware/auth.js';

export default function uploadsRouter(ctx, { requireAuth }) {
  const r = Router();
  const { config } = ctx;

  r.post('/uploads/sign', requireAuth, requireRole('organizer', 'admin'), (req, res) => {
    if (!config.cloudinary) throw new AppError(404, 'FEATURE_DISABLED', 'Image uploads are not configured.');
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    const params = { folder: 'seatlock/banners', timestamp: Math.floor(Date.now() / 1000) };
    // Cloudinary signature = SHA-1 of "k1=v1&k2=v2" (keys sorted) immediately followed by the API secret.
    const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const signature = createHash('sha1').update(toSign + apiSecret).digest('hex');
    res.json({
      upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      api_key: apiKey,
      signature,
      ...params,
    });
  });
  return r;
}
