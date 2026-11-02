// Registration questions: organizers define them, participants answer them.
// The answers schema is BUILT AT RUNTIME from the event's questions, so the server (not the browser)
// decides what a valid answer is.
import { z } from 'zod';

export const QUESTION_TYPES = ['text', 'long_text', 'email', 'phone', 'number', 'select', 'checkbox'];
export const MAX_QUESTIONS = 15;

const base = {
  id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'id must be lowercase letters, digits or _ (max 32), starting with a letter'),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(5000).optional(),
};

const questionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('text') }),
  z.object({ ...base, type: z.literal('long_text') }),
  z.object({ ...base, type: z.literal('email') }),
  z.object({ ...base, type: z.literal('phone') }),
  z.object({ ...base, type: z.literal('number') }),
  z.object({ ...base, type: z.literal('checkbox') }),
  z.object({ ...base, type: z.literal('select'), options: z.array(z.string().trim().min(1).max(100)).min(1).max(30) }),
]);

export const questionsSchema = z.array(questionSchema).max(MAX_QUESTIONS, `At most ${MAX_QUESTIONS} questions`)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, 'Question ids must be unique');

function answerSchemaFor(q) {
  let s;
  switch (q.type) {
    case 'text': s = z.string().trim().max(q.maxLength ?? 200); break;
    case 'long_text': s = z.string().trim().max(q.maxLength ?? 2000); break;
    case 'email': s = z.string().trim().toLowerCase().max(q.maxLength ?? 254).pipe(z.email()); break;
    case 'phone': s = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'); break;
    case 'number': s = z.number().finite(); break;
    case 'select': s = z.enum(q.options, { error: 'Choose one of the listed options' }); break;
    case 'checkbox': s = z.boolean(); break;
  }
  if (q.required) {
    if (q.type === 'checkbox') s = s.refine((v) => v === true, 'This box must be ticked');
    if (q.type === 'text' || q.type === 'long_text') s = s.refine((v) => v.length > 0, 'This question is required');
  }
  return q.required ? s : s.optional();
}

/** Returns { ok: true, answers } or { ok: false, fields: { questionId: message } }. */
export function validateAnswers(questions, rawAnswers) {
  if (rawAnswers === null || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return { ok: false, fields: { _: 'answers must be an object keyed by question id' } };
  }
  const cleaned = { ...rawAnswers };
  for (const q of questions) {
    // An empty optional field is the same as "not answered".
    if (!q.required && (cleaned[q.id] === '' || cleaned[q.id] === null)) delete cleaned[q.id];
  }
  const shape = Object.fromEntries(questions.map((q) => [q.id, answerSchemaFor(q)]));
  // .strict(): an answer to a question that does not exist is rejected, not silently stored.
  const result = z.object(shape).strict().safeParse(cleaned);
  if (result.success) return { ok: true, answers: result.data };
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[0] ?? '_';
    fields[key] ??= issue.message;
  }
  // A required question with no answer at all gets one clear message, whatever its type.
  for (const q of questions) if (q.required && cleaned[q.id] === undefined) fields[q.id] = 'This question is required';
  return { ok: false, fields };
}

/**
 * Once bookings exist, existing answers must stay valid, so the question list may only GROW with
 * optional questions. Returns an error message or null.
 */
export function checkQuestionEditAllowed(oldQs, newQs) {
  const byId = new Map(newQs.map((q) => [q.id, q]));
  for (const o of oldQs) {
    const n = byId.get(o.id);
    if (!n) return `Question "${o.label}" cannot be removed because people have already registered.`;
    if (n.type !== o.type) return `Question "${o.label}" cannot change type after registrations exist.`;
    if (n.required && !o.required) return `Question "${o.label}" cannot become required after registrations exist.`;
    if (o.type === 'select' && !o.options.every((x) => n.options.includes(x))) {
      return `Options of "${o.label}" cannot be removed after registrations exist.`;
    }
    if (o.maxLength && n.maxLength && n.maxLength < o.maxLength) return `maxLength of "${o.label}" cannot shrink after registrations exist.`;
  }
  const oldIds = new Set(oldQs.map((q) => q.id));
  for (const n of newQs) {
    if (!oldIds.has(n.id) && n.required) return `New question "${n.label}" must be optional after registrations exist.`;
  }
  return null;
}

/** For the gate screen: the answers a person gave, as [{label, value}] in the order of the event's questions. */
export function labelAnswers(questions, answers) {
  if (!answers) return [];
  return questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').map((q) => ({
    label: q.label,
    value: q.type === 'checkbox' ? (answers[q.id] ? 'Yes' : 'No') : String(answers[q.id]),
  }));
}
