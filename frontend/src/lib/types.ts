export type Role = 'participant' | 'organizer' | 'admin';
export interface User { id: string; name: string; email: string; role: Role; organization?: string }

export type RegState = 'NOT_OPEN' | 'OPEN' | 'SOLD_OUT' | 'CLOSED' | 'CANCELLED';
export type QuestionType = 'text' | 'long_text' | 'email' | 'phone' | 'number' | 'select' | 'checkbox';
export interface Question { id: string; type: QuestionType; label: string; required: boolean; maxLength?: number; options?: string[] }

export interface PublicEvent {
  id: string; slug: string; title: string; tagline: string; description_md?: string; venue: string;
  mode: 'offline' | 'online' | 'hybrid'; starts_at: string; ends_at: string;
  registration_opens_at: string; registration_closes_at: string | null; capacity: number; seats_left: number;
  banner_url: string | null; status: string; host?: string | null; registration_state: RegState;
  waitlist_count?: number; hold_minutes?: number; allowed_email_domains?: string[] | null; registration_questions?: Question[]; server_time?: string;
}
export interface MyWaitlist { position: number }
export interface MyBooking { id: string; status: 'HELD' | 'CONFIRMED'; hold_expires_at: string; hold_seconds_left: number }

export interface OrganizerEvent extends PublicEvent {
  organizer_id: string; created_at: string; updated_at: string;
  confirmed_count?: number; held_count?: number; checked_in_count?: number;
}
export interface Booking {
  id: string; event_id: string; status: 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'; hold_expires_at: string;
  answers: Record<string, unknown> | null; confirmed_at: string | null; checked_in_at: string | null; hold_seconds_left?: number;
  event_title?: string; event_slug?: string; event_starts_at?: string; event_ends_at?: string; event_venue?: string; event_status?: string;
}
export interface ApiErrorBody { error: { code: string; message: string; details?: { fields?: Record<string, string>; [k: string]: unknown } } }

export interface EventStats { waitlist?: number; held: number; confirmed: number; expired: number; cancelled: number; checked_in: number; capacity: number; seats_left: number; status: string; title: string }
export interface RegRow { id: string; status: string; answers: Record<string, unknown> | null; confirmed_at: string | null; checked_in_at: string | null; created_at: string; user_id: string; name: string; email: string }
export interface AuditEntry { id: string; action: string; details: Record<string, unknown> | null; created_at: string; actor_id: string | null; actor_name: string | null }
export interface StaffRow { user_id: string; name: string; email: string; role: string }
export interface AdminUser { id: string; name: string; email: string; role: Role; created_at: string }
export interface StaffEvent { id: string; slug: string; title: string; starts_at: string; venue: string; status: string }
export interface AdminStats { users: number; organizers: number; admins: number; events: number; live_events: number; draft_events: number; registrations: number; holds: number; checked_in: number; waitlisted: number }
export interface AdminEventRow { id: string; slug: string; title: string; status: string; starts_at: string; capacity: number; seats_left: number; organizer_name: string; organizer_email: string; confirmed_count: number; waitlist_count: number }

export interface IntegrityCheck { id: string; title: string; rule: string; expected: string | number; actual: string | number; ok: boolean; skipped?: boolean }
export interface IntegrityReport { event_id: string; ok: boolean; bookings_total: number; checks: IntegrityCheck[] }
export interface ChaosResult {
  options: Record<string, number | boolean>;
  event_id: string;
  requests_sent: number;
  response_codes: Record<string, number>;
  timeline: { step: string; detail: string; at_ms: number }[];
  end_state: { active: number; cancelled: number; expired: number; capacity: number };
  report: IntegrityReport;
  passed: boolean;
  elapsed_ms: number;
}
