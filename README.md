# LedgerIQ — Executive Accounting Dashboard

A bank-grade executive accounting dashboard built with **React** (frontend) and
**Node.js / Express + Microsoft SQL Server** (backend). Three roles/pages:

1. **Admin → Analytics** — the admin's own home screen: daily dashboard-usage
   % per customer, and a live feed of failed sign-in attempts (wrong
   password, unknown username/email, or a deactivated account) so the admin
   immediately sees when a customer tried to get in and couldn't. The admin
   no longer sees the portfolio-wide Executive Dashboard or Account Details
   drill-through — those pages exist only for the customer role now, scoped
   to that customer's own accounts.
2. **Admin → Customers** — the company admin creates a username + password
   (and company name/email/phone) for each customer, and chooses which
   accounts that customer can see. Credentials are shown once at creation so
   the admin can hand them to the customer directly (in person, by phone,
   etc.). Every phone number is validated against real international
   numbering plans (not just a length check) and every email is validated
   before the customer can be created or edited.
3. **Customer → Dashboard** (Executive Dashboard + Account Details) —
   portfolio KPIs, account status table, charts, exchange rates (all 6
   directional pairs across CHF/USD/EUR), a monthly FX profit/loss panel per
   currency, and a balances chart across every account regardless of how
   many the customer has. Each currency (CHF, USD, EUR) lives in its own
   dedicated bank account — an account only ever holds one currency.

**Multi-tenant by design**: every account row has a `CustomerId`. Every API
route that returns account/dashboard/transaction data — not just the UI —
filters by the logged-in customer's own `UserId`, so a customer can never see
another customer's numbers even by editing a URL or account number directly.

All business logic for scoring, alerts, and monthly aggregation lives in SQL
Server stored procedures — the Node API stays thin and just calls them.

The UI is fully bilingual (German / English, switchable live, no reload) and
every section can be printed individually or as one full report — see
"Bilingual UI & printing" below.

---

## Admin → Analytics (usage % and failed sign-ins)

- **Daily usage %** — the same ~45s heartbeat that already powered "who's
  online" now also accumulates active minutes per customer per day
  (`dbo.DailyUsage`), capped per beat so a tab left open overnight doesn't
  inflate the number. Admin → Analytics shows each customer's usage today as
  a % of an 8-hour business day.
- **Failed sign-ins** — every login attempt, success or fail, is recorded in
  `dbo.LoginAttempts` with a reason (`not_found` / `bad_password` /
  `inactive`). Admin → Analytics lists the failed ones with who it matched
  (if anyone) and when, so the admin can see "Acme Corp tried to sign in and
  couldn't" without the customer needing to call and ask.

Both are additive — an existing database gets these via
`backend/db/migration_admin_updates.sql`; fresh installs get them
automatically from `schema.sql`.

---

## Currency accounts, exchange rates and monthly FX profit/loss

Each customer's CHF, USD and EUR balances live in **separate dedicated bank
accounts** — a CHF account only ever holds CHF, a USD account only ever holds
USD, and a EUR account only ever holds EUR (enforced in
`POST /api/accounts` — `currencyCode` must be one of `CHF`/`USD`/`EUR`, one
per account).

`dbo.ExchangeRates` now tracks all 6 directional pairs: CHF→USD, USD→CHF,
CHF→EUR, EUR→CHF, EUR→USD and USD→EUR — same manual-entry model as before
(`GET /api/exchange-rates/latest`), you or your own job inserts new rows and
the dashboard always reads the most recent one per pair.

`GET /api/exchange-rates/monthly-pl` computes, per currency, the FX
revaluation profit/loss for the current month: the balance held in that
currency × (today's rate to CHF − the rate to CHF on the 1st of the month).
CHF is the reporting/base currency (Swiss company) so it always shows 0 —
USD and EUR show exactly how much stronger or weaker that currency got
against CHF this month, valued against the actual balance held. The
Executive Dashboard's new "Monthly FX Profit / Loss" panel renders this, and
a new "Account Balances" chart shows every account's saldo, color-coded by
currency, regardless of how many accounts the customer has.

---

## Printing — Hoffmann & Partner AG letterhead

Every printed section/report shows the Hoffmann & Partner AG wordmark (the
dashboard's operator) together with the signed-in customer's own company
name, so a printed PDF is never ambiguous about whose figures it contains.
Set a customer's company name once from Admin → Customers (`companyName` on
`POST/PATCH /api/admin/customers`) and it appears automatically on every
print/PDF that customer generates.

---

## Bilingual UI & printing

### Language switcher
A DE/EN toggle sits in the top bar (and on the login screen). It is backed by
`src/i18n/translations.js` — one flat dictionary per language — and
`src/i18n/I18nContext.jsx`, which exposes a `useTranslation()` hook:

```jsx
import { useTranslation } from '../i18n/I18nContext';

function Example() {
  const { t, lang, setLang } = useTranslation();
  return <h1>{t('execTitle')}</h1>;
}
```

The chosen language persists in `localStorage` and is auto-detected from the
browser on first visit (German browsers default to DE). To add a new string,
add the key once to both the `en` and `de` blocks in `translations.js` and
reference it with `t('yourKey')` — never hardcode user-facing text in a
component.

### Printing
Two print modes, both built on the browser's native print dialog (so "Save as
PDF" works automatically in every browser, no extra library needed):

- **Print a single section** — every panel (KPI strip, account table, each
  chart, the alerts feed, transaction history, etc.) is wrapped in
  `<PrintableSection>` and has its own small 🖨️ button. Clicking it isolates
  just that section for the print/PDF output.
- **Print the full dashboard** — the "🖨️ Print full dashboard" button in the
  top bar prints the entire current page as one report, with a letterhead
  (`PrintHeader`) showing the LedgerIQ name, report title, timestamp, and the
  signed-in user.

Implementation lives in `src/utils/print.js` (`printSection()` /
`printFullDashboard()`) and `src/styles/print.css` (the `@media print` rules
that strip the sidebar/topbar/buttons and flatten the dark theme to a
print-friendly light one). Status colors and KPI tones are remapped to
print-safe colors so green/yellow/red still read clearly on a black & white
printer.

---

## Project structure

```
accounting-dashboard/
├── backend/
│   ├── config/db.js              SQL Server connection pool
│   ├── db/
│   │   ├── schema.sql             Tables, indexes (Users has Email/Phone/PasswordHash)
│   │   └── procedures.sql         Scoring engine, alert generation, snapshots
│   ├── middleware/auth.js         JWT auth + admin guard
│   ├── services/accountAccess.js  Per-account ownership check (customer scoping)
│   ├── utils/generatePassword.js  Strong random password generator
│   ├── routes/
│   │   ├── auth.js                Login (bcrypt against dbo.Users)
│   │   ├── customers.js           Admin: create/edit customers, assign accounts
│   │   ├── accounts.js            Account list / create (scoped by customer)
│   │   ├── accountDetail.js       Drill-through endpoints (ownership-checked)
│   │   ├── transactions.js        Record profit/loss/extra-cost entries (admin only)
│   │   ├── dashboard.js           KPIs, charts, status table, alerts (scoped)
│   │   ├── exchangeRates.js       Reads your FX rate table
│   │   └── export.js              Excel / PDF export (scoped)
│   ├── scripts/
│   │   ├── seed.js                1 admin + 2 demo customers + 6 accounts + FX rates
│   │   └── refreshScoresAndAlerts.js
│   └── server.js                  Entry point + cron auto-refresh
└── frontend/
    └── src/
        ├── components/
        │   ├── kpi/KpiCard.jsx
        │   ├── charts/             Column, Line, Donut, Top-10 list, FX panel
        │   ├── tables/AccountsStatusTable.jsx
        │   ├── alerts/AlertsPanel.jsx
        │   ├── filters/FiltersBar.jsx
        │   ├── layout/             Sidebar, Topbar, LanguageSwitcher
        │   └── print/              PrintableSection, PrintHeader
        ├── i18n/
        │   ├── translations.js     EN + DE dictionaries
        │   └── I18nContext.jsx     useTranslation() hook
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── CustomersPage.jsx   Admin-only: create/manage customer logins
        │   ├── ExecutiveDashboardPage.jsx
        │   └── AccountDetailPage.jsx
        ├── services/api.js        All backend calls
        ├── utils/print.js          printSection() / printFullDashboard()
        └── styles/                 Theme + print.css (@media print rules)
```

---

## How the scoring engine works (usp_RecalculateAccountScore)

Every account starts at **15** points for the current month, then loses points:

| Condition this month                          | Penalty |
|------------------------------------------------|---------|
| Loss > Profit                                   | -5      |
| Extra Cost > the account's ExpenseLimit         | -5      |
| No transactions in the last 60 days             | -5      |

Score maps to status: **15 = Active (green)**, **10-14 = Medium (yellow)**, **0-9 = Inactive (red)**.

usp_RefreshAlerts re-derives the alerts feed from the same data: inactive
accounts, excessive expenses, loss exceeding profit, and negative monthly
profit each produce a distinct alert card.

Both procedures run automatically every 15 minutes via node-cron (configurable
in .env as REFRESH_CRON), and also run immediately after every transaction
write so the dashboard reflects changes without waiting for the schedule.

---

## 1) Set up SQL Server

If you don't have SQL Server running, the fastest path is Docker:

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=YourStrong!Passw0rd" \
  -p 1433:1433 --name sql1 -d mcr.microsoft.com/mssql/server:2022-latest
```

Already have a running database? Run the two additive migrations instead of
`schema.sql`:
```bash
sqlcmd -S localhost -U sa -P "YourPassword" -i backend/db/migration_import_balances.sql
sqlcmd -S localhost -U sa -P "YourPassword" -i backend/db/migration_online_status.sql
sqlcmd -S localhost -U sa -P "YourPassword" -i backend/db/migration_admin_updates.sql
```
(Fresh installs get all of this automatically from `schema.sql` +
`procedures.sql`.)

Then create the schema and procedures (fresh installs only):

```bash
sqlcmd -S localhost -U sa -P "YourStrong!Passw0rd" -i backend/db/schema.sql
sqlcmd -S localhost -U sa -P "YourStrong!Passw0rd" -i backend/db/procedures.sql
```

(Or open both files in SQL Server Management Studio / Azure Data Studio and run them.)

### Exchange rates

The dbo.ExchangeRates table is intentionally **not** populated by any external
API call — you update it yourself, manually or with your own script/job:

```sql
INSERT INTO dbo.ExchangeRates (FromCurrency, ToCurrency, Rate)
VALUES ('CHF', 'USD', 1.12);
```

The dashboard always reads the most recent row per currency pair.

---

## 2) Run the backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env: DB_SERVER, DB_USER, DB_PASSWORD, JWT_SECRET, REFRESH_CRON
npm run seed        # creates 1 admin + 2 demo customers + 6 accounts + 6 months of data
npm run dev          # http://localhost:4000
```

Demo logins after seeding (the login screen accepts either the **Username**
or the **Email** shown below — both work with the same password):

| Role     | Username      | Email                  | Password      | Sees |
|----------|---------------|-------------------------|---------------|------|
| Admin    | `admin_demo`   | admin@ledgeriq.demo     | `Admin@2024!` | Everything, plus Admin → Customers |
| Customer | `acme_corp`    | finance@acme.demo       | `Acme@2024!`  | Only accounts 100101 / 100102 / 100201 |
| Customer | `nova_trading` | accounts@nova.demo      | `Nova@2024!`  | Only accounts 100245 / 100301 / 100312 |

To create real customers going forward: log in as `admin_demo`, open
**Customers** in the sidebar, click **Add customer**, and either let the app
generate a strong password or set one yourself — it's shown once so you can
hand both the username and password to the customer. If you also give them
an email on that form, they can use either one to sign in.

To recalculate scores/alerts manually at any time (e.g. after a bulk import):

```bash
npm run refresh
```

---

## 3) Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

---

## 4) Importing account balances straight from Excel into SQL Server

You have 3 Excel sheets (EUR, USD, CHF) that are already fully
calculated — Saldo, Haben, Soll, Betrag, Kontonummer, active status,
Datum. This workflow loads them into SQL Server exactly as they are,
with **no recalculation anywhere** — the dashboard just displays what
the sheet said.

**Already have a running database with real customers in it?** Run
`backend/db/migration_import_balances.sql` instead of `schema.sql` —
it only *adds* the new table/columns and never drops your existing
data:
```bash
sqlcmd -S localhost -U sa -P "YourPassword" -i backend/db/migration_import_balances.sql
```
(Fresh installs get this automatically from `schema.sql` +
`procedures.sql`.)

### Step 1 — Load each Excel sheet into `dbo.ImportedBalances`
The table has columns: `Kontonummer, Currency, Saldo, Haben, Soll, Betrag, AktivKonto, Datum`.
Easiest path is SQL Server's own **Import and Export Wizard** (comes
with SQL Server Management Studio / Azure Data Studio):

1. Right-click `AccountingDashboardDB` → Tasks → **Import Data**.
2. Source: Excel, pick your file and the EUR sheet.
3. Destination: SQL Server, table `dbo.ImportedBalances`.
4. Map your Excel columns to the matching table columns above.
5. Add one extra step (or a formula column in Excel before importing)
   so the `Currency` column is filled with `EUR` for every row of
   that sheet.
6. Repeat for the USD sheet (`Currency = 'USD'`) and the CHF sheet
   (`Currency = 'CHF'`).

(No SSMS installed? Save each sheet as CSV and use `BULK INSERT` —
ask and I'll give you the exact command for your file.)

### Step 2 — Push the import into the live dashboard tables
Run this once after loading (or re-loading) the sheets:
```sql
EXEC dbo.usp_SyncImportedBalances;
```
This copies Saldo → Account Balance, plus Haben/Soll/Betrag/Datum,
onto `dbo.Accounts` — matched by `Kontonummer` = `AccountNumber`.
Nothing is computed or adjusted; it's a straight copy.

- If a Kontonummer already exists as an account, its numbers are
  updated in place.
- If a Kontonummer is new, a new (unassigned) account is created
  automatically. Go to **Admin → Customers** in the dashboard and use
  **Manage accounts** to assign it to the right customer.

### Step 3 — Refresh the dashboard
The Account status table (Executive Dashboard) and each Account's
detail page now show **Saldo / Haben / Soll / Betrag / statement
date** exactly as imported, alongside the existing Profit/Loss/Score
columns (which still come from `dbo.Transactions`, unrelated to this
import).

Re-importing later: insert new rows into `dbo.ImportedBalances` (don't
delete the old ones) and run `EXEC dbo.usp_SyncImportedBalances;`
again — it always uses the most recent row per Kontonummer.

---

## 5) "Who's online now" (Admin sidebar widget)

Every logged-in user (admin or customer) sends a tiny heartbeat every
45 seconds while the dashboard tab is open. Admins see a small widget
in the bottom corner of the sidebar — a dot + count, expanding to the
list of names — showing everyone active in the last 2 minutes.

Already have a running database? Run the additive migration instead
of `schema.sql`:
```bash
sqlcmd -S localhost -U sa -P "YourPassword" -i backend/db/migration_online_status.sql
```
(Fresh installs get this automatically from `schema.sql`.) No frontend
setup needed — the heartbeat starts automatically on login.

---

## API reference

All routes except /api/auth/* require Authorization: Bearer <token>.
Dashboard/account endpoints accept these optional query filters:
?period=current|3m|6m|9m|12m&accountNumber=...&status=Active|Medium|Inactive&currency=CHF|USD|EUR
(Admins can also pass &customerId=... to view a specific customer's slice; customers
are always scoped to their own accounts automatically, regardless of query params.)

| Method | Path                                              | Purpose |
|--------|---------------------------------------------------|---------|
| POST   | /api/auth/login                                    | Log in, get JWT |
| POST   | /api/auth/heartbeat                                | Bump LastSeenAt (used by the online indicator) |
| GET    | /api/admin/customers                               | List customers (admin only) |
| GET    | /api/admin/customers/online-summary                | Who's online right now (admin only) |
| POST   | /api/admin/customers                               | Create a customer login (admin only) |
| PATCH  | /api/admin/customers/:id                           | Update name/email/phone/active (admin only) |
| POST   | /api/admin/customers/:id/reset-password            | Reset a customer's password (admin only) |
| GET    | /api/admin/customers/:id/accounts                  | Accounts assigned to a customer (admin only) |
| PUT    | /api/admin/customers/:id/accounts/:accountId       | Assign an account to a customer (admin only) |
| DELETE | /api/admin/customers/:id/accounts/:accountId       | Unassign an account (admin only) |
| GET    | /api/dashboard/kpis                                | 7 executive KPI cards |
| GET    | /api/dashboard/accounts-status                     | Status table rows |
| GET    | /api/dashboard/profit-loss-by-month                | Column chart data |
| GET    | /api/dashboard/trend                               | Line chart data |
| GET    | /api/dashboard/status-distribution                 | Donut chart data |
| GET    | /api/dashboard/top-extra-costs                     | Top 10 ranking |
| GET    | /api/dashboard/alerts                              | Active alerts feed |
| GET    | /api/accounts                                      | Account list (?unassigned=true for admin) |
| POST   | /api/accounts                                      | Create account, optional customerId (admin only) |
| GET    | /api/accounts/:accountNumber/detail                | Single account info (ownership-checked) |
| GET    | /api/accounts/:accountNumber/kpis                  | Per-account KPIs (ownership-checked) |
| GET    | /api/accounts/:accountNumber/monthly               | Per-account monthly series (ownership-checked) |
| GET    | /api/accounts/:accountNumber/transactions          | Transaction history (ownership-checked) |
| POST   | /api/transactions                                  | Record a profit/loss/extra-cost entry (admin only) |
| GET    | /api/exchange-rates/latest                         | Latest CHF/USD/EUR rates (6 directional pairs) |
| GET    | /api/exchange-rates/history                        | Rate history for one pair |
| GET    | /api/exchange-rates/monthly-pl                     | Monthly FX revaluation profit/loss per currency (scoped) |
| GET    | /api/admin/analytics/usage                         | Per-customer daily usage % (admin only) |
| GET    | /api/admin/analytics/login-attempts                | Recent sign-in attempts, failed by default (admin only) |
| GET    | /api/admin/analytics/summary                       | KPI cards for Admin → Analytics (admin only) |
| GET    | /api/export/excel                                  | Download account status as .xlsx (scoped) |
| GET    | /api/export/pdf                                    | Download account status as .pdf (scoped) |

---

## Recording a transaction (example)

```bash
curl -X POST http://localhost:4000/api/transactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
        "accountNumber": "100101",
        "description": "Q3 consulting revenue",
        "category": "General",
        "type": "Profit",
        "amount": 4200.00
      }'
```

Categorize as "category": "ExtraCost" to have it counted toward the
Extra Cost KPI and the excessive-expense alert rule.

---

## Security checklist before production

1. Set a long random JWT_SECRET in .env (32+ characters).
2. Passwords are hashed with bcrypt — never stored in plaintext.
3. Set DB_ENCRYPT=true with a valid certificate, especially on Azure SQL.
4. Restrict CORS_ORIGIN in the backend .env to your real frontend domain.
5. Put a reverse proxy (nginx) with HTTPS in front of the Node server.
6. Login rate limiting is already enabled — tune the values in server.js as needed.
7. Customer creation (POST /api/admin/customers) and account creation
   (POST /api/accounts) both require the admin role. Only the seed script's
   admin_demo user (or another user you promote to role='admin' in
   dbo.Users) can reach those routes or see data outside their own accounts.
8. Generated/typed customer passwords are returned exactly once, in the API
   response at creation/reset time — they are never logged and never stored
   anywhere except as a bcrypt hash. Make sure your reverse proxy/HTTPS is
   in place before creating real customers, since that response is the one
   moment the plaintext password travels over the wire.
