-- Legacy upgrade path. Fresh installs already have invite_token from the first migration.
-- No-op when the column already exists and is populated / constrained.
select 1;
