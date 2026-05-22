-- Restore Richard admin + prevent demoting the last admin
ALTER TABLE users.profiles DISABLE TRIGGER check_role_escalation;

UPDATE users.profiles
SET app_role = 'admin'
WHERE email = 'rerbler@roots-consultants.com';

CREATE OR REPLACE FUNCTION users.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'users', 'public'
AS $function$
DECLARE
  other_admin_count integer;
BEGIN
  IF NEW.app_role IS DISTINCT FROM OLD.app_role
     AND NOT users.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can change app_role';
  END IF;

  IF OLD.app_role = 'admin'
     AND NEW.app_role IS DISTINCT FROM 'admin' THEN
    SELECT count(*) INTO other_admin_count
    FROM users.profiles
    WHERE app_role = 'admin'
      AND id <> OLD.id;

    IF other_admin_count = 0 THEN
      RAISE EXCEPTION 'Der letzte Admin kann nicht degradiert werden';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER TABLE users.profiles ENABLE TRIGGER check_role_escalation;
