-- Trigger: fire AFTER INSERT on form_instances to call on-instance-created Edge Function
-- Uses pg_net to make an async HTTP POST to the Edge Function via Kong gateway.
--
-- URL resolution:
--   Local dev:  Kong gateway at http://supabase_kong_royalforms:8000 (Docker internal)
--   Production: override by recreating this function with the production URL
--               e.g. https://<project-ref>.supabase.co/functions/v1/on-instance-created
--
-- Auth: The on-instance-created Edge Function has verify_jwt = false,
--        so no Authorization header is needed from the trigger.
--        The Edge Function authenticates itself to Supabase using its own env vars.

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_created()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  -- Build payload with the new row's id and readable_id
  _payload := jsonb_build_object(
    'id', NEW.id,
    'readable_id', NEW.readable_id
  );

  -- Fire async HTTP POST via pg_net to the on-instance-created Edge Function.
  -- The Edge Function will generate short URLs (Shlink) and update this row.
  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/on-instance-created',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- Create the trigger on form_instances
CREATE TRIGGER on_form_instance_created
  AFTER INSERT ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_form_instance_created();
