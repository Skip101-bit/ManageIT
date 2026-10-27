# ManageIT — Integrated ERP System

Storage Management Systems (PTY) Ltd — Stock-IT inventory & job management.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (SPA-style, no framework) |
| **Backend API** | ASP.NET Core 10 Web API (C#) |
| **Database** | Microsoft SQL Server |
| **Auth** | SAL number + password (BCrypt hashes in DB; demo mode supported) |
| **Excel Import** | SheetJS (CDN) |

## Project Structure

```
ManageIT/
├── frontend/public/          # ERP web app (index.html, app.js, api.js, ui.js, styles.css, config.js)
├── backend/ManageIT.Api/     # REST API bridging frontend ↔ SQL Server
└── backend/ManageIT_SQL/     # Database deployment scripts 00–09 (SSMS / sqlcmd)
```

## Quick Start

### 1. Deploy SQL Server Database

**Option A — SSMS:** Open `backend/ManageIT_SQL/00_MASTER_DEPLOY.sql` (enable SQLCMD mode) or run scripts 01→08 in order (05 seed data last).

**Option B — sqlcmd:**
```powershell
cd backend\ManageIT_SQL
sqlcmd -S localhost -E -i 01_CREATE_DATABASE.sql
sqlcmd -S localhost -E -d ManageIT -i 02_CREATE_TABLES.sql
sqlcmd -S localhost -E -d ManageIT -i 03_CREATE_AUDIT_TABLES.sql
sqlcmd -S localhost -E -d ManageIT -i 04_CREATE_TRIGGERS.sql
sqlcmd -S localhost -E -d ManageIT -i 06_EXTRA_TABLES.sql
sqlcmd -S localhost -E -d ManageIT -i 07_CREATE_STORED_PROCEDURES.sql
sqlcmd -S localhost -E -d ManageIT -i 08_STOCK_STORED_PROCEDURES.sql
sqlcmd -S localhost -E -d ManageIT -i 09_RBAC_PERMISSIONS.sql
sqlcmd -S localhost -E -d ManageIT -i 05_SEED_DATA.sql
```

### 2. Configure Connection String

Edit `backend/ManageIT.Api/appsettings.json`:

```json
"ConnectionStrings": {
  "ManageIT": "Server=YOUR_SERVER;Database=ManageIT;Trusted_Connection=True;TrustServerCertificate=True;"
}
```

**LocalDB (e.g. SSMS connected to `(localdb)\StockIT`):**
```json
"ManageIT": "Server=(localdb)\\StockIT;Database=ManageIT;Trusted_Connection=True;TrustServerCertificate=True;"
```

For SQL authentication:
```
Server=localhost;Database=ManageIT;User Id=sa;Password=YourPassword;TrustServerCertificate=True;
```

### 3. Run the API (serves frontend + API)

```powershell
cd backend\ManageIT.Api
dotnet run
```

Open **http://localhost:5000**

**UI build check:** View page source and confirm `<meta name="manageit-build" content="2026-06-18-v2-modern" />` — this is the modern UI (Inter font, gradients, SVG icons, no emojis).

### 4. Login (demo users — password `admin123` or `pass123` for all)

| SAL | Role | Typical use |
|-----|------|-------------|
| 10001 | Admin | Full system access |
| 10002 | Stock Capturer | Book in/out, create stock |
| 10003 | Approver | Approve adjustments & requests |
| 10004 | Store Manager | Warehouse ops, location/qty edits |
| 10005 | Auditor | Audits, reports, audit adjustments |
| 10006 | Viewer | Read-only inventory & reports |

## Role-Based Access Control (RBAC)

Six roles with a permissions grid enforced in the **API** and **UI**:

| Legend | Meaning |
|--------|---------|
| ✅ Full | Full access |
| 👁 View | View only |
| ✏️ Create/Edit | Create and edit records |
| ✔️ Approve | Approve pending requests |
| 📝 Request | Submit for approval (adjustments) |
| ❌ No Access | Hidden / blocked |

**Admin → Role Permissions** in the app shows the full matrix. Login returns a `permissions` map used by `permissions.js`.

**Approval workflow:** Stock Capturer and Store Manager submit stock adjustments as **Pending**; Approvers approve from **Approvals** in the sidebar.

Run script **09_RBAC_PERMISSIONS.sql** after 07/08 for RBAC tables (optional — matrix is enforced in API code).

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check + DB connectivity |
| POST | `/api/auth/login` | No | Authenticate by SAL + password (returns JWT) |
| GET | `/api/auth/me` | Yes | Current user profile |
| GET | `/api/bootstrap` | Yes | Load all ERP data (frontend format) |
| POST | `/api/sync` | Yes | Save full ERP state to SQL Server (bulk; stock/jobs/users use direct APIs when online) |
| GET | `/api/users` | Yes | List all users |
| GET | `/api/users/{id}` | Yes | Get one user |
| POST | `/api/users` | Yes | Create a user |
| PUT | `/api/users/{id}` | Yes | Update a user |
| DELETE | `/api/users/{id}` | Yes | Delete a user |
| GET | `/api/jobs` | Yes | List all jobs |
| GET | `/api/jobs/{id}` | Yes | Get one job |
| POST | `/api/jobs` | Yes | Create a job |
| PUT | `/api/jobs/{id}` | Yes | Update a job |
| DELETE | `/api/jobs/{id}` | Yes | Delete a job |
| GET | `/api/stock` | Yes | List all stock items |
| GET | `/api/stock/{id}` | Yes | Get one stock item |
| POST | `/api/stock` | Yes | Create a stock item |
| PUT | `/api/stock/{id}` | Yes | Update a stock item |
| DELETE | `/api/stock/{id}` | Yes | Delete a stock item |
| GET | `/api/storage-locations` | Yes | List storage locations |
| GET | `/api/storage-locations/{id}` | Yes | Get one storage location |
| POST | `/api/storage-locations` | Yes | Create a storage location |
| PUT | `/api/storage-locations/{id}` | Yes | Update a storage location |
| DELETE | `/api/storage-locations/{id}` | Yes | Delete a storage location |
| GET | `/api/transactions` | Yes | List stock transactions |
| POST | `/api/transactions` | Yes | Create a transaction (book in/out, transfer, adjustment) |
| GET | `/api/activity` | Yes | List activity log |
| POST | `/api/activity` | Yes | Log an activity entry |
| GET | `/api/settings` | Yes | Get system settings |
| PUT | `/api/settings` | Yes | Update settings (Admin) |
| GET | `/api/audits` | Yes | List inventory audits |
| POST | `/api/audits` | Yes | Create an audit record |
| GET | `/api/reconciliations` | Yes | List reconciliations |
| POST | `/api/reconciliations` | Yes | Create a reconciliation record |

**Swagger UI:** http://localhost:5000/swagger — click **Authorize**, paste `Bearer <token>` from login.

## Offline / Demo Mode

If the API or SQL Server is unavailable, the app falls back to **browser localStorage** with seeded demo data. Set `useApi: false` in `frontend/public/config.js` to force offline mode.

When online, **all entity saves** go directly to SQL Server (users, jobs, stock, storage locations, transactions, activity, settings, audits, reconciliations). `POST /api/sync` remains as a fallback for bulk import/offline catch-up. Failed online saves show an error toast.

## Integration Notes

- Frontend field names (camelCase) are mapped to SQL columns in `ManageItDataService.cs`
- Inventory and job categories: `Production Inventory`, `Service Inventory`, `Legacy Inventory`
- Changes auto-sync to SQL (debounced) when connected for bulk entities — header shows **SQL Connected** badge
- Stock and job Save/Delete call individual REST endpoints immediately when online
- User Save/Delete call `/api/users` endpoints immediately when online (BCrypt password hashing in API)
- Password hashes: use BCrypt in production; seed data uses `demo` placeholder verified by API

## Requirements

- .NET 10 SDK
- SQL Server 2019+ (or LocalDB / Express)
- Modern browser (Chrome, Edge, Firefox)

---

Product of **Storage Management Systems (PTY) Ltd**
