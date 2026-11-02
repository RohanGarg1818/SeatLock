// One error-handling approach for the whole API:
//   * code throws AppError(status, CODE, message) for expected failures
//   * the error middleware turns it into { error: { code, message, details? } }
//   * anything else becomes a generic 500 (details go to the log, never to the client)

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Map known Postgres constraint violations to meaningful client errors.
const CONSTRAINT_MESSAGES = {
  users_email_key: [409, 'EMAIL_TAKEN', 'An account with this email already exists.'],
  events_slug_key: [409, 'SLUG_TAKEN', 'That URL slug is already in use.'],
  bookings_one_active_per_user: [409, 'ALREADY_REGISTERED', 'You already have an active booking for this event.'],
  bookings_user_idem_key: [409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used.'],
  events_seats_range: [409, 'CAPACITY_CONFLICT', 'Capacity cannot go below the number of seats already taken.'],
  events_time_order: [422, 'VALIDATION_FAILED', 'The event must end after it starts.'],
  events_registration_window: [422, 'VALIDATION_FAILED', 'Registration must close after it opens.'],
};

export function translatePgError(err) {
  if (err.code === '23505' || err.code === '23514') {
    const hit = CONSTRAINT_MESSAGES[err.constraint];
    if (hit) return new AppError(hit[0], hit[1], hit[2]);
    return new AppError(err.code === '23505' ? 409 : 422, err.code === '23505' ? 'CONFLICT' : 'CONSTRAINT_VIOLATION',
      'The request conflicts with existing data.');
  }
  if (err.code === '22P02' || err.code === '22003') return new AppError(400, 'BAD_REQUEST', 'Malformed or out-of-range value.');
  if (err.code === '40P01' || err.code === '40001') {
    return new AppError(503, 'TRY_AGAIN', 'The server was busy. Please retry.');
  }
  return null;
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
}

export function errorHandler(ctx) {
  // Express recognises error middleware by its 4 parameters.
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    let appErr = err instanceof AppError ? err : null;

    if (!appErr && err.type === 'entity.parse.failed') appErr = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
    if (!appErr && err.type === 'entity.too.large') appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');
    if (!appErr && typeof err.code === 'string') appErr = translatePgError(err);

    if (!appErr) {
      ctx.log.error('unhandled error', { err: err.message, stack: err.stack, path: req.path });
      appErr = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
    }
    const body = { error: { code: appErr.code, message: appErr.message } };
    if (appErr.details !== undefined) body.error.details = appErr.details;
    if (appErr.headers) for (const [k, v] of Object.entries(appErr.headers)) res.set(k, v);
    res.status(appErr.status).json(body);
  };
}
