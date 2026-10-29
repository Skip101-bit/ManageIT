# SMS ERP (ManageIT) — Requirements & Progress Summary

**Status date:** 29 October 2026
**System:** ManageIT, the Storage Management Systems (SMS) ERP
**Audience:** management, project reviews, development planning

---

## 1. Purpose

ManageIT is the internal system for Storage Management Systems. It manages inventory, jobs, stock movements, stock takes, fixed assets and users in one place. It replaces spreadsheets and manual checks with controlled steps that need approval and keep a full history.

---

## 2. Who uses it

| Role | What they can do |
|---|---|
| **Admin** | Everything: users, settings, jobs, inventory, assets, approvals, reports |
| **Stock Capturer** | Captures stock receipts, transfers and new stock; can *request* adjustments |
| **Approver** | Approves or rejects adjustments, transfers and stock-take results |
| **Store Manager** | Runs warehouse operations and stock movements; can *request* adjustments |
| **Auditor** | Runs stock takes, reviews history, approves audit adjustments |
| **Viewer** | Read-only access to inventory and reports |

---

## 3. Required functions and current status

**Key:** ✅ Done · 🔶 Done but waiting on testing or sign-off · 🔄 In progress · ⬜ Not started

### 3.1 Login, access and security

| Requirement | Status |
|---|---|
| Sign in with SAL number and password | ✅ |
| Six roles with a permission matrix, viewable on a Role Permissions page | ✅ |
| Users only see the menus and pages their role allows | ✅ |
| Inactive users cannot sign in | ✅ |
| Activity log of logins and user actions | ✅ |
| Proper passwords for live use (replace the demo passwords) | ⬜ Decision pending |

### 3.2 Portals (home screen)

| Requirement | Status |
|---|---|
| Portal home page with Stock-IT, Reports and Admin | ✅ |

### 3.3 Stock-IT: inventory and warehouse

| Requirement | Status |
|---|---|
| Master inventory register (view-only list) | ✅ |
| Allocated inventory: stock allocated to each job | ✅ |
| Stock receipts (book-in) | ✅ |
| Transfers, including to and from jobs and reverse transfers back to inventory | ✅ |
| Relocation between storage locations and bins | ✅ |
| Stock adjustments that need approval | ✅ |
| Pending Approvals page for approvers | ✅ |
| Full transaction history | ✅ |
| Serial number tracking | ✅ |
| Low-stock alerts | ✅ |
| **Stock take (Inventory Audit):** multi-count, with on-hand quantities hidden from counters | ✅ |
| **Reconciliation:** compare counts to the register; approve or reject each difference with a reason; keep a history | ✅ |

### 3.4 Stock-IT: BOM and stock check (new this cycle)

| Requirement | Status |
|---|---|
| Upload a BOM (Excel or CSV) | ✅ |
| One job number assigns the whole BOM to that job | ✅ |
| A BOM upload never changes quantities or the master register | ✅ |
| Record whether each part came from the **Parts Library** or **AutoCAD** | ✅ |
| Part-number rule: C&I parts are updated in the Parts Library, other AutoCAD parts in AutoCAD | ✅ |
| Parts not on the master register are flagged and cannot be allocated | ✅ |
| One click adds unidentified parts to the master register | ✅ |
| Stock check uses **free stock only** (stock already allocated to jobs is not counted) | ✅ |
| Allocate free stock to the job with no order transaction | ✅ |
| Filter by category: Production, Service, Legacy | ✅ |
| History of uploads and checks, newest first | ✅ |
| Tested with a real job BOM | 🔶 Waiting on testing |

### 3.5 Stock-IT: Pastel alignment (new this cycle)

| Requirement | Status |
|---|---|
| Step-by-step timeline for aligning Pastel with the Parts Library | ✅ |
| Import Pastel stock and compare it with the Parts Library | ✅ |
| Track outstanding part updates, including Carl Henry's | ✅ |
| Final Pastel update locked until every step is done and all updates are agreed | ✅ |
| Worked through with Carl Henry | 🔶 Waiting on sign-off |

### 3.6 Admin

| Requirement | Status |
|---|---|
| Job management: create, edit, set status (e.g. Active, On Hold) | ✅ |
| Inventory management: add and edit items | ✅ |
| Storage locations and bins | ✅ |
| Asset management: fixed asset register, maintenance, inspections, warranty and insurance dates | ✅ |
| User management: add, edit, deactivate, delete; set role | ✅ |
| System settings: company name, low-stock threshold, activity logging | ✅ |

### 3.7 Reports, import and export

| Requirement | Status |
|---|---|
| Dashboard and Quick Actions | ✅ |
| KPI reports (stock items, book-ins, book-outs, transfers) | ✅ |
| Import inventory, jobs, users and storage locations from Excel or CSV, including Sage exports | ✅ |
| Export formatted Excel workbooks | ✅ |
| User activity and work activity reports | ✅ |

### 3.8 Data, hosting and maintenance

| Requirement | Status |
|---|---|
| SQL Server database design and setup scripts | ✅ |
| New database script for BOM and Pastel data | ✅ Written, not yet run |
| Offline mode, so the app still works when the database can't be reached | ✅ |
| Live SQL Server database connected | ⬜ Decision pending |
| Online demo link (Railway) | ✅ Demo only |
| Code backed up in a private GitHub repository | ✅ |
| Automatic redeploy of the online link when code changes | 🔄 Needs Railway sign-in |
| Security update of a flagged software package | ✅ |

---

## 4. Progress update

### Completed this cycle
- **BOM and stock check** merged into one page, with every rule from the brief (job assignment, master register protection, unidentified parts, free-stock-only check, allocation with no order transaction, category filter, history).
- **Pastel alignment** timeline, comparison with the Parts Library, and tracking of outstanding updates.
- **Online demo link** on Railway.
- **Housekeeping:** code on GitHub, a security package updated, and old unused job card code removed.
- **Bug fix:** the BOM and Pastel pages now load when opened from the menu (previously they only filled in after an action).

### Currently in progress
- **Automatic deployment:** connecting the online link to GitHub so it updates itself. This needs a Railway sign-in.
- **Bringing the online link up to date:** it still runs the version from 19 October, without the latest fixes.

### Outstanding
- A live, shared database (hosting choice, setup, running the new script, connecting the online link).
- Real-world testing of BOM upload and Pastel alignment.
- Replacing the demo passwords before live use.
- Hiding passwords on the user form (they currently show as plain text on screen).

---

## 5. Known issues and limitations

| # | Issue / limitation | Impact |
|---|---|---|
| 1 | **No live database is connected.** The app runs in offline mode. | Data is saved only in each person's browser; it is not shared and can be lost if the browser data is cleared. |
| 2 | **The online link is a demo.** It uses demo users with simple passwords. | Fine for showing the system; **not suitable for real company data**. Anyone with the link can sign in. |
| 3 | **The online link may be blocked on the office network.** | It wouldn't open on the office network in testing. IT may need to allow it, or a company web address could be used instead. |
| 4 | **The online link is out of date.** | Latest changes and fixes appear there only after the next redeploy. |
| 5 | **The new database script has not been run** (BOM and Pastel storage). | Until it is, these features rely on offline mode. |
| 6 | **Passwords show as plain text on the user form.** | Anyone looking at the admin's screen can read a user's password. |
| 7 | **No automated testing.** | Changes are checked by hand, so regressions are possible. |

---

## 6. Pending decisions and feedback

| Decision / feedback needed | Owner | Why it matters |
|---|---|---|
| **Where to host the live database:** Railway, Azure, or an on-site server; and the budget | Management | Blocks shared data and real use |
| **Password approach for live use** | Management / IT | Required before real data goes in |
| **Feedback on the online demo** | Boss | Confirms direction and priorities |
| **Pastel alignment sign-off** | Justin & Carl Henry | Unlocks the final Pastel update |
| **Office network access, or a company web address** | IT | Makes the online link usable in the office |

---

## 7. Estimated priorities for remaining work

| Priority | Work item | Reason |
|---|---|---|
| **1 – Critical** | Decide on and set up the live database; run the new script; connect the app | Nothing is shared or safely stored until this is done |
| **1 – Critical** | Replace the demo passwords, hide passwords on screen, and agree a password approach | Required before real data is used |
| **2 – High** | Finish automatic deployment and bring the online link up to date | Keeps the online version current without manual steps |
| **2 – High** | Test BOM upload and stock check with a real job | Confirms the new feature works on real data |
| **2 – High** | Complete the Pastel alignment with Carl Henry | Business process waiting on this |
| **2 – High** | Gather and act on the boss's feedback | May change priorities |
| **3 – Medium** | Fix office access to the online link | Makes it usable on site |
| **4 – Later** | Add automated testing | Reduces risk as the system grows |

---

## 8. Summary

The SMS ERP is **functionally complete for inventory, stock movements, stock takes, assets, users and reporting**. This cycle added the **BOM and stock check** and **Pastel alignment**.

The main blocker to real use is the **live database**. Once a hosting decision is made, the next steps are connecting the database, replacing the demo passwords, and testing with real data.
