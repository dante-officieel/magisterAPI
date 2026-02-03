# Magister Rooster Notificaties

Dit project is een web-based systeem (frontend + backend) dat automatisch meldingen stuurt zodra lessen van een leerling uitvallen of wijzigen (tijd, lokaal, docent, vak). Het gebruikt de officiële Magister OAuth flow en API-endpoints voor roosterinformatie, slaat geen wachtwoorden op, en bewaart tokens versleuteld.

## Overzicht

- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS
- **Database**: SQLite (met `better-sqlite3`)
- **Notificaties**: E-mail via SMTP (optioneel uitbreidbaar met browser push/PWA)
- **Background jobs**: `node-cron`

## Magister login flow (OAuth + PKCE)

1. Gebruiker vult de Magister basis-URL in (bijv. `school.magister.net`) en e-mailadres voor notificaties.
2. De backend maakt een **PKCE pair** en redirect naar:
   `https://<school>.magister.net/connect/authorize?...`.
3. Magister authenticatie vindt plaats (inclusief ADFS of andere IdP als `identityProvider` is meegegeven).
4. Magister stuurt een `code` terug naar `/auth/callback`.
5. De backend wisselt deze `code` om voor een **access token** en **refresh token**.
6. Tokens worden **versleuteld** opgeslagen in de database.

## Voorbeeld API-calls (Magister)

- **Authorize**
  ```text
  GET https://<school>.magister.net/connect/authorize
    ?client_id=YOUR_CLIENT_ID
    &redirect_uri=https://yourapp/auth/callback
    &response_type=code
    &scope=openid%20profile%20magister-api
    &code_challenge=...
    &code_challenge_method=S256
  ```
- **Token exchange**
  ```text
  POST https://<school>.magister.net/connect/token
  Content-Type: application/x-www-form-urlencoded

  grant_type=authorization_code
  client_id=YOUR_CLIENT_ID
  client_secret=YOUR_CLIENT_SECRET
  redirect_uri=https://yourapp/auth/callback
  code=...
  code_verifier=...
  ```
- **Rooster ophalen**
  ```text
  GET https://<school>.magister.net/api/afspraken?van=2024-09-01&tot=2024-09-03
  Authorization: Bearer ACCESS_TOKEN
  ```

## Database structuur

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  magister_base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE schedule_cache (
  user_id INTEGER NOT NULL,
  cache_date TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cache_date)
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

## Beveiligingsmaatregelen

- **Geen wachtwoorden opslaan**: alleen OAuth tokens.
- **Encryptie van tokens**: AES-256-GCM met `ENCRYPTION_KEY`.
- **Refresh tokens**: automatische vernieuwing bij verlopen access tokens.
- **HTTPS vereist in productie**.
- **AVG/GDPR**: minimale data, expliciete toestemming, logging van notificaties.

## Installatie

```bash
npm install
```

Maak een `.env` bestand:

```env
PORT=3000
MAGISTER_CLIENT_ID=your-client-id
MAGISTER_CLIENT_SECRET=your-client-secret
MAGISTER_REDIRECT_URI=http://localhost:3000/auth/callback
ENCRYPTION_KEY=use-a-strong-32-char-secret
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password
SMTP_FROM=no-reply@example.com
```

Start de server:

```bash
npm start
```

## Roosterchecks

De cron job draait standaard elke 5 minuten:

```env
SCHEDULE_CRON=*/5 * * * *
```

## Privacy (AVG/GDPR)

- Sla enkel noodzakelijke gegevens op (e-mail, tokens, rooster-cache).
- Verwijder data op verzoek van de gebruiker.
- Token encryptie voorkomt misbruik bij databaselek.
- Gebruik logging en monitoring om misbruik te detecteren.

## Uitbreidingen

- Push notifications (Web Push / PWA) door te koppelen met een push-service.
- Multi-tenant support met gescheiden databases of schema's.
- Retry queues voor e-mailafhandeling.
