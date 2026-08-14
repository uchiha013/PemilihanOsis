ALTER TABLE students ADD COLUMN username TEXT;
ALTER TABLE students ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username ON students(username);