-- Two roles: worker and admin. Nobody keeps the third label; the label itself leaves the
-- enum with the baseline. `users` has no append-only trigger, and no identity setting is
-- present here, so the identity guard (0038) lets the update through.
UPDATE users SET role = 'worker' WHERE role = 'foreman';
