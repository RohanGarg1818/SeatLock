// Poster images, two ways:
//  1. Cloudinary signed uploads (when configured): the API only SIGNS; the browser uploads the file straight to Cloudinary,
//     so image bytes never pass through our server. The API secret never leaves the server.
//  2. Direct upload (always available): POST /uploads/local stores the image in Postgres and returns /api/uploads/<id>,
//     served back by GET /uploads/:id. Only JPEG, PNG, WebP and GIF are accepted (checked by their first bytes, never SVG).
import { Router } from 'express';
import express from 'express';
import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';

const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/;

function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length > 12 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif';
  return null;
}

export default function uploadsRouter(ctx, { requireOrganizer }) {
  const r = Router();
  const { config, pool } = ctx;

  r.post('/uploads/sign', requireOrganizer, (req, res) => {
    if (!config.cloudinary) throw new AppError(404, 'FEATURE_DISABLED', 'Image uploads are not configured.');
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    const params = { folder: 'seatlock/posters', timestamp: Math.floor(Date.now() / 1000) };
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

  r.post('/uploads/local', requireOrganizer, express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length === 0) throw new AppError(400, 'VALIDATION', 'Send the image file as the request body.');
    const type = sniff(body);
    if (!type) throw new AppError(400, 'VALIDATION', 'Choose a JPG, PNG, WebP or GIF image.');
    const { rows } = await pool.query('INSERT INTO poster_images (content_type, data, created_by) VALUES ($1, $2, $3) RETURNING id', [type, body, req.user?.id ?? null]);
    res.status(201).json({ url: `/api/uploads/${rows[0].id}` });
  });

  r.get('/uploads/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'Image not found.');
    const { rows } = await pool.query('SELECT content_type, data FROM poster_images WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Image not found.');
    res.set('Content-Type', rows[0].content_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // an id never changes its bytes
    res.send(rows[0].data);
  });
  return r;
}
