SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE TABLE "public"."app_admins" (
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_admins_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."app_admins"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."event_private_details" (
  "event_id"            uuid NOT NULL,
  "author_id"           uuid NOT NULL,
  "private_description" text,
  CONSTRAINT "event_private_details_pkey" PRIMARY KEY (event_id),
  CONSTRAINT "event_private_details_private_description_check" CHECK ((char_length(private_description) <= 2000))
);

ALTER TABLE "public"."event_private_details"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."event_types" (
  "code"       text    NOT NULL,
  "label"      text    NOT NULL,
  "color"      text    NOT NULL,
  "is_active"  boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "event_types_color_check" CHECK ((color ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT "event_types_pkey" PRIMARY KEY (code)
);

ALTER TABLE "public"."event_types"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."events" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_date"      date                     NOT NULL,
  "event_type_code" text                     NOT NULL,
  "show_nickname"   boolean                  NOT NULL DEFAULT false,
  "status"          text                     NOT NULL DEFAULT 'published'::text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "events_event_date_check" CHECK (isfinite(event_date)),
  CONSTRAINT "events_pkey" PRIMARY KEY (id),
  CONSTRAINT "events_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'hidden'::text])))
);

ALTER TABLE "public"."events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."livestream_days" (
  "stream_date" date                     NOT NULL,
  "created_by"  uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "livestream_days_pkey" PRIMARY KEY (stream_date),
  CONSTRAINT "livestream_days_stream_date_check" CHECK (isfinite(stream_date))
);

ALTER TABLE "public"."livestream_days"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_event (
  p_event_date          date,
  p_event_type_code     text,
  p_private_description text    DEFAULT NULL::text,
  p_show_nickname       boolean DEFAULT false
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_event_id uuid;
    v_description text := NULLIF(btrim(p_private_description), '');
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_event_date IS NULL OR NOT isfinite(p_event_date) THEN
        RAISE EXCEPTION 'A valid event date is required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.event_types AS event_type
        WHERE event_type.code = p_event_type_code
          AND event_type.is_active = true
    ) THEN
        RAISE EXCEPTION 'Select an active event type.';
    END IF;

    IF char_length(v_description) > 2000 THEN
        RAISE EXCEPTION 'Description must not exceed 2000 characters.';
    END IF;

    INSERT INTO public.events (
        event_date,
        event_type_code,
        show_nickname
    )
    VALUES (
        p_event_date,
        p_event_type_code,
        COALESCE(p_show_nickname, false)
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.event_private_details (
        event_id,
        author_id,
        private_description
    )
    VALUES (
        v_event_id,
        v_user_id,
        v_description
    );

    RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_event (
  p_event_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_streamer boolean;
    v_deleted_count integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_streamer := public.is_admin();

    DELETE FROM public.events AS event
    WHERE event.id = p_event_id
      AND (
          v_is_streamer
          OR EXISTS (
              SELECT 1
              FROM public.event_private_details AS details
              WHERE details.event_id = event.id
                AND details.author_id = v_user_id
          )
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        RAISE EXCEPTION
            'Event not found or you do not have permission to delete it.';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_calendar_events (
  p_start_date  date,
  p_end_date    date,
  p_stream_mode boolean DEFAULT false
)
  RETURNS TABLE (
    id                  uuid,
    event_date          date,
    event_type_code     text,
    event_type_label    text,
    event_type_color    text,
    show_nickname       boolean,
    author_nickname     text,
    private_description text,
    is_owner            boolean,
    status              text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_streamer boolean := false;
    v_stream_mode boolean := COALESCE(p_stream_mode, false);
BEGIN
    IF v_user_id IS NOT NULL THEN
        v_is_streamer := public.is_admin();
    END IF;

    IF p_start_date IS NULL
       OR p_end_date IS NULL
       OR NOT isfinite(p_start_date)
       OR NOT isfinite(p_end_date)
       OR p_end_date <= p_start_date THEN
        RAISE EXCEPTION 'A valid date range is required.';
    END IF;

    IF p_end_date - p_start_date > 366 THEN
        RAISE EXCEPTION 'Date range must not exceed 366 days.';
    END IF;

    RETURN QUERY
    SELECT
        event.id,
        event.event_date,
        event.event_type_code,
        event_type.label,
        event_type.color,
        event.show_nickname,

        CASE
            WHEN event.show_nickname
                 OR (
                     NOT v_stream_mode
                     AND (
                         details.author_id = v_user_id
                         OR v_is_streamer
                     )
                 )
            THEN COALESCE(
                NULLIF(usr.raw_user_meta_data ->> 'name', ''),
                'Viewer'
            )
            ELSE NULL
        END AS author_nickname,

        CASE
            WHEN NOT v_stream_mode
                 AND (
                     details.author_id = v_user_id
                     OR v_is_streamer
                 )
            THEN details.private_description
            ELSE NULL
        END AS private_description,

        (
            NOT v_stream_mode
            AND COALESCE(details.author_id = v_user_id, false)
        ) AS is_owner,

        event.status

    FROM public.events AS event
    INNER JOIN public.event_types AS event_type
        ON event_type.code = event.event_type_code
    INNER JOIN public.event_private_details AS details
        ON details.event_id = event.id
    INNER JOIN auth.users AS usr
        ON usr.id = details.author_id

    WHERE event.event_date >= p_start_date
      AND event.event_date < p_end_date
      AND (
          event.status = 'published'
          OR (
              NOT v_stream_mode
              AND (
                  details.author_id = v_user_id
                  OR v_is_streamer
              )
          )
      )

    ORDER BY event.event_date, event.created_at, event.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_livestream_days (
  p_start_date date,
  p_end_date   date
)
  RETURNS TABLE (
    stream_date date
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    IF p_start_date IS NULL
       OR p_end_date IS NULL
       OR NOT isfinite(p_start_date)
       OR NOT isfinite(p_end_date)
       OR p_end_date <= p_start_date THEN
        RAISE EXCEPTION 'A valid date range is required.';
    END IF;

    IF p_end_date - p_start_date > 366 THEN
        RAISE EXCEPTION 'Date range must not exceed 366 days.';
    END IF;

    RETURN QUERY
    SELECT livestream.stream_date
    FROM public.livestream_days AS livestream
    WHERE livestream.stream_date >= p_start_date
      AND livestream.stream_date < p_end_date
    ORDER BY livestream.stream_date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_submissions()
  RETURNS TABLE (
    id                  uuid,
    event_date          date,
    created_at          timestamp with time zone,
    event_type_label    text,
    author_nickname     text,
    show_nickname       boolean,
    private_description text,
    status              text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Streamer permission required.';
    END IF;

    RETURN QUERY
    SELECT
        event.id,
        event.event_date,
        event.created_at,
        event_type.label,
        COALESCE(
            NULLIF(usr.raw_user_meta_data ->> 'name', ''),
            'Viewer'
        ) AS author_nickname,
        event.show_nickname,
        details.private_description,
        event.status
    FROM public.events AS event
    INNER JOIN public.event_types AS event_type
        ON event_type.code = event.event_type_code
    INNER JOIN public.event_private_details AS details
        ON details.event_id = event.id
    INNER JOIN auth.users AS usr
        ON usr.id = details.author_id
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 20;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.app_admins AS admin
        WHERE admin.user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_livestream_day (
  p_stream_date date,
  p_enabled     boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Streamer permission required.';
    END IF;

    IF p_stream_date IS NULL OR NOT isfinite(p_stream_date) THEN
        RAISE EXCEPTION 'A valid date is required.';
    END IF;

    IF p_enabled IS NULL THEN
        RAISE EXCEPTION 'The marker state is required.';
    END IF;

    IF p_enabled THEN
        INSERT INTO public.livestream_days (stream_date, created_by)
        VALUES (p_stream_date, v_user_id)
        ON CONFLICT (stream_date) DO NOTHING;
    ELSE
        DELETE FROM public.livestream_days
        WHERE stream_date = p_stream_date;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_event (
  p_event_id            uuid,
  p_event_date          date,
  p_event_type_code     text,
  p_private_description text,
  p_show_nickname       boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_current_type text;
    v_description text := NULLIF(btrim(p_private_description), '');
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Check ownership and lock the event until the update completes.
    SELECT event.event_type_code
    INTO v_current_type
    FROM public.events AS event
    INNER JOIN public.event_private_details AS details
        ON details.event_id = event.id
    WHERE event.id = p_event_id
      AND details.author_id = v_user_id
    FOR UPDATE OF event;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Event not found or you do not have permission to edit it.';
    END IF;

    IF p_event_date IS NULL OR NOT isfinite(p_event_date) THEN
        RAISE EXCEPTION 'A valid event date is required.';
    END IF;

    -- An existing inactive type can be kept, but not newly selected.
    IF NOT EXISTS (
        SELECT 1
        FROM public.event_types AS event_type
        WHERE event_type.code = p_event_type_code
          AND (
              event_type.is_active
              OR event_type.code = v_current_type
          )
    ) THEN
        RAISE EXCEPTION 'Select an active event type.';
    END IF;

    IF char_length(v_description) > 2000 THEN
        RAISE EXCEPTION 'Description must not exceed 2000 characters.';
    END IF;

    UPDATE public.events
    SET event_date = p_event_date,
        event_type_code = p_event_type_code,
        show_nickname = COALESCE(p_show_nickname, false)
    WHERE id = p_event_id;

    UPDATE public.event_private_details
    SET private_description = v_description
    WHERE event_id = p_event_id;

    -- Author and moderation status remain unchanged.
END;
$function$;

ALTER TABLE "public"."app_admins"
  ADD CONSTRAINT "app_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."event_private_details"
  ADD CONSTRAINT "event_private_details_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_event_type_code_fkey" FOREIGN KEY (event_type_code) REFERENCES public.event_types(code);

ALTER TABLE "public"."event_private_details"
  ADD CONSTRAINT "event_private_details_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."livestream_days"
  ADD CONSTRAINT "livestream_days_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE INDEX event_private_details_author_id_idx ON public.event_private_details USING btree (author_id);

CREATE INDEX events_created_at_id_idx ON public.events USING btree (created_at DESC, id DESC);

CREATE INDEX events_event_date_idx ON public.events USING btree (event_date);

CREATE POLICY "event_types_read_active" ON "public"."event_types"
  FOR SELECT
  TO "authenticated"
  USING ((is_active = true));

DROP EVENT TRIGGER IF EXISTS "ensure_rls";

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

REVOKE ALL ON FUNCTION "public"."create_event"(date, text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_event"(date, text, text, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."delete_event"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_event"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_calendar_events"(date, date, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_calendar_events"(date, date, boolean) TO "anon", "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_livestream_days"(date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_livestream_days"(date, date) TO "anon", "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_recent_submissions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_recent_submissions"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "postgres";

REVOKE ALL ON FUNCTION "public"."set_livestream_day"(date, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_livestream_day"(date, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_event"(uuid, date, text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_event"(uuid, date, text, text, boolean) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_admins" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."app_admins" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_private_details" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."event_private_details" TO "service_role";

REVOKE ALL ON TABLE "public"."event_types" FROM "authenticated";

GRANT SELECT ON TABLE "public"."event_types" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_types" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."event_types" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."livestream_days" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."livestream_days" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

