-- Organizers sign up on their own portal and say which society or club they run.
-- Nullable: attendees and older accounts simply have none.
ALTER TABLE users ADD COLUMN organization text CHECK (organization IS NULL OR length(organization) BETWEEN 1 AND 120);
