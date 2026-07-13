# ROOTS Auth-E-Mailvorlagen

Die HTML-Dateien sind für Supabase Auth vorbereitet.

- `password-reset.html`: Vorlage für den Passwort-Reset
- `invite-user.html`: Vorlage für Einladungen neuer Mitarbeiter

Im Supabase Dashboard unter `Authentication -> Emails -> Templates` den jeweiligen HTML-Inhalt einsetzen. Der Supabase-Platzhalter `{{ .ConfirmationURL }}` muss unverändert bleiben.
