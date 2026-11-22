-- Supabase only. Create the private test bucket without changing existing data.
BEGIN;
DO $$
DECLARE existing storage.buckets%ROWTYPE;
BEGIN
    SELECT * INTO existing FROM storage.buckets WHERE id='civictrack-issue-images';
    IF FOUND THEN
        IF existing.public IS DISTINCT FROM FALSE OR existing.file_size_limit IS DISTINCT FROM 5242880
           OR existing.allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg','image/png','image/gif','image/webp']::text[] THEN
            RAISE EXCEPTION 'Existing image bucket settings require operator review';
        END IF;
    ELSE
        INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
        VALUES ('civictrack-issue-images','civictrack-issue-images',FALSE,5242880,
                ARRAY['image/jpeg','image/png','image/gif','image/webp']);
    END IF;
END $$;
COMMIT;
