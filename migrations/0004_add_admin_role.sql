ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'super' CHECK(role IN ('super','bilik'));
