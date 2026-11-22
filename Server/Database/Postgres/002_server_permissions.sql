-- Run once as the database owner after 001_schema.sql, in an isolated test project.
-- This role cannot log in until an operator privately configures LOGIN/password.
-- Never use the database owner or a Supabase browser key in the Express settings.
BEGIN;
CREATE ROLE civictrack_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA civictrack TO civictrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA civictrack TO civictrack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA civictrack TO civictrack_app;

-- Employee approval remains an operator action. The server can only consume it.
REVOKE INSERT, UPDATE, DELETE ON civictrack.authorised_employees FROM civictrack_app;
GRANT UPDATE (is_registered) ON civictrack.authorised_employees TO civictrack_app;

DO $$
DECLARE table_name text;
BEGIN
    FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'civictrack' LOOP
        EXECUTE format(
            'CREATE POLICY server_access ON civictrack.%I FOR ALL TO civictrack_app USING (true) WITH CHECK (true)',
            table_name
        );
    END LOOP;
END $$;
ALTER ROLE civictrack_app SET statement_timeout = '15s';
ALTER ROLE civictrack_app SET idle_in_transaction_session_timeout = '15s';
COMMIT;
