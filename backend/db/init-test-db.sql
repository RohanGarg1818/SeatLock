-- Runs once when the docker Postgres volume is first created: a separate database for `npm test`.
CREATE DATABASE seatlock_test OWNER seatlock;
