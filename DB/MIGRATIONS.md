# Database migrations (Neon)

Apply SQL files in order for a fresh or upgrading database.

| File | Purpose |
|------|---------|
| `schemav2.sql` or your bootstrap path | Full schema (development reference). |
| `002_add_image_url.sql` | Cloudinary `image_url` on `reports`, `home_lat` / `home_long` type fix on `users`, `home_radius`. If this migration **already ran**, do **not** re-run the `ALTER` on `home_lat` / `home_long` from an older "003" doc that only touched those columns — the types are already corrected here. |
| `003_subscriptions_contact_email.sql` | Adds `subscriptions.contact_email` and replaces `get_pending_notifications` so **email** alerts resolve the correct address for `contact_preference = 'email'` and `'both'`. **Required** for the subscription API paths that set `contact_email` and for the SES Lambda sender. |

**Verify `users.home_lat` / `home_long` types:** in Neon SQL editor, `\d users` or `SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('home_lat','home_long');` — expect `double precision`. If still `text`, run only the `ALTER` portion from `002_add_image_url.sql` (or `schemav2`) once.
