# voicemap-notification-sender (AWS Lambda + SES)

Polls Neon for pending **email** notifications via `get_pending_notifications(100)` and sends with **Amazon SES** in the same region as the verified sender (recommended: `us-west-2`).

For the full end-to-end checklist (SES identity, production access, IAM, EventBridge 2-minute schedule, Lambda env vars), see the project **VoiceMap notification spec** (original: `voicemap-notification-system.md`).

## Environment variables (Lambda)

| Variable | Description |
|----------|---------------|
| `DATABASE_URL` | Neon connection string (same DB as the Next.js app). |
| `AWS_REGION` | e.g. `us-west-2` — must match the SES identity region. |
| `SES_FROM` | Full `From` header, e.g. `VoiceMap Alerts <you@verified-domain.com>`. The address or domain must be verified in SES. |

## IAM

Create a role (e.g. `voicemap-lambda-role`) trusted by `lambda.amazonaws.com` with an inline policy allowing:

- `ses:SendEmail`, `ses:SendRawEmail` on `*`
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on `arn:aws:logs:*:*:*`

## Build and deploy (CLI sketch)

1. `cd notification-sender && npm install`
2. Create a zip that includes `index.mjs` and the entire `node_modules` at the **root of the zip** (standard Lambda layout):

   - **macOS / Linux** (from this folder, after `npm install`):
     - `zip -r ../voicemap-notification-sender.zip . -x \"*.md\"`  
   - **Windows (PowerShell)**, from `notification-sender` after `npm install`:
     - `Compress-Archive -Path index.mjs,node_modules,package.json -DestinationPath ..\\voicemap-notification-sender.zip -Force`

3. **Create** (once):

   ```bash
   aws lambda create-function \
     --function-name voicemap-notification-sender \
     --runtime nodejs20.x \
     --handler index.handler \
     --role arn:aws:iam::YOUR_ACCOUNT_ID:role/voicemap-lambda-role \
     --zip-file fileb://../voicemap-notification-sender.zip \
     --timeout 30 \
     --region us-west-2
   ```

4. **Configure** environment:

   ```bash
   aws lambda update-function-configuration \
     --function-name voicemap-notification-sender \
     --environment \"Variables={DATABASE_URL=...,AWS_REGION=us-west-2,SES_FROM=VoiceMap Alerts <you@example.com>}\" \
     --region us-west-2
   ```

5. **EventBridge** — schedule `rate(2 minutes)` and add `lambda:InvokeFunction` permission for `events.amazonaws.com` (see spec).

6. **Code updates** — `aws lambda update-function-code` with a new zip.

## Database

Apply migration [`../DB/003_subscriptions_contact_email.sql`](../DB/003_subscriptions_contact_email.sql) on Neon if you use **email + phone (both)** subscriptions, and to refresh `get_pending_notifications` so the **email** address resolves correctly. See [`../DB/MIGRATIONS.md`](../DB/MIGRATIONS.md) for ordering with other migrations.

## App behavior

- The Next.js app queues rows when reports are severitized (`queue_notifications_for_report`); this Lambda only processes rows with `channel = 'email'`.
- SMS and WhatsApp are handled separately by the app (Twilio) and are not sent by this function.
