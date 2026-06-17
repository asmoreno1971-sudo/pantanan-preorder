# BIS1 Documentation

## Project Title

**BIS1: Bakhaw Integrated School Information System**

## Project Overview

BIS1 is a web-based information system for Bakhaw Integrated School. It is designed to help school personnel manage learner records, personnel profiles, guidance cases, dashboard summaries, and account access in one browser-based application.

The system supports both online and offline use. When an internet connection is available, records are loaded from the server and synchronized through the available API routes. When the connection is unavailable, the app keeps key learner and guidance data available on the device through browser storage and queues changes for later synchronization.

BIS1 is deployed as a Node.js web application and is currently configured for Render deployment under the service name `bis1`.

## Main Objectives

The system aims to:

1. Provide a central digital location for learner profiles.
2. Allow teachers and authorized users to update learner records.
3. Provide a personnel profile system for school staff data.
4. Support guidance case recording, monitoring, and report preparation.
5. Display dashboard summaries for enrollment and advisory monitoring.
6. Protect school records through login sessions and role-based access.
7. Preserve access to important records during temporary internet interruptions.
8. Reduce manual repetition by pulling names, grade sections, personnel fields, and options from configured data sources.

## Target Users

The intended users are:

- School administrator
- Teachers
- Guidance designate or guidance personnel
- Personnel profile users
- Authorized staff assigned to learner record maintenance

## System Modules

### 1. Teacher Login and Session Module

Pages:

- `/teacher-login`
- `/teacher-login.html`

Main files:

- `public/teacher-login.html`
- `public/teacher-login.js`
- `public/teacher-session.js`
- `public/teacher-session.css`

Purpose:

This module controls access to protected BIS1 pages. Users log in using teacher credentials and PIN-based access. The server creates and validates teacher sessions before allowing access to learner, personnel, dashboard, guidance, and account administration pages.

Important API routes:

- `POST /api/teacher-login`
- `GET /api/teacher-session`
- `POST /api/teacher-logout`
- `POST /api/teacher-consent`
- `POST /api/teacher-change-pin`

Key behavior:

- Protected pages redirect unauthenticated users to the login page.
- Guidance pages require a guidance-capable session.
- Teacher account management requires admin access.
- Current teacher information is stored locally to support profile workflows.

### 2. Learner Profile Module

Pages:

- `/students`
- `/students.html`

Main files:

- `public/students.html`
- `public/students.js`
- `public/students.css`
- `public/learner-offline.js`
- `public/learner-sw.js`

Purpose:

The Learner Profile module is used to add, view, update, search, reorder, export, and delete learner records. It supports class-level filtering and offline persistence.

Important API routes:

- `GET /api/students`
- `GET /api/students.csv`
- `POST /api/students`
- `PUT /api/students/:id`
- `DELETE /api/students/:id`
- `POST /api/students/reorder`
- `GET /api/grade-sections`

Stored learner data includes:

- Grade / section
- Learner name
- Sex
- Age
- Birthday
- Status code
- Date of movement
- LRN
- Address
- Father
- Mother
- Guardian
- Contact number

Key behavior:

- Learners can be searched by name, LRN, section, parent, guardian, or address.
- Grade / section options are loaded from the configured grade-section source.
- Offline changes are queued and synchronized when the connection returns.
- Records can be exported by class.

### 3. Dashboard Module

Pages:

- `/student-dashboard`
- `/student-dashboard.html`

Main files:

- `public/student-dashboard.html`
- `public/student-dashboard.js`
- `public/student-dashboard.css`

Purpose:

The Dashboard module summarizes learner information by section, sex, status code, and advisory assignment. It gives users a quick view of enrollment and learner movement data.

Important API routes:

- `GET /api/students`
- `GET /api/advisory-directory`

Key behavior:

- Shows total learner count.
- Shows male and female counts.
- Shows section-level summaries.
- Links users back to learner records.
- Displays advisory information when available.

### 4. Personnel Profile Module

Pages:

- `/personnel-profile`
- `/personnel-profile.html`

Main files:

- `public/personnel-profile.html`
- `public/personnel-profile.js`
- `public/personnel-profile.css`

Purpose:

The Personnel Profile module allows a logged-in personnel member to view and update their own personnel information. The form is dynamic: field titles are created from the personnel profile source, and saved data is loaded back into the form so users can update only the boxes that need changes.

Important API routes:

- `GET /api/personnel`
- `GET /api/personnel-profiles`
- `POST /api/personnel-profiles`
- `GET /api/teacher-directory`
- `GET /api/grade-sections`
- `GET /api/teacher-session`

Key behavior:

- The logged-in teacher name is displayed as the personnel name.
- Saved profile data is loaded automatically when the profile page opens.
- Dynamic boxes are generated from personnel profile field titles.
- The `Name` field is not duplicated in the dynamic form.
- `Sex` is a dropdown.
- `Birthday` uses `MM/DD/YYYY` date rollers.
- `Date of Expiry (PRC)` uses date rollers with year options from `2026` to `2035`.
- `Advisory / Assignment` is a dropdown using grade / section choices, plus special teacher options.
- `Year Started at DepEd` uses a year dropdown from `1980` to the current year.
- `Department` can use dropdown choices coming from Column B of the personnel profile source.
- Answer boxes auto-expand based on text height.
- The form is arranged in four columns on wide screens.

### 5. Personnel Consol Module

Pages:

- `/personnel`
- `/personnel.html`

Main files:

- `public/personnel.html`
- `public/personnel.js`
- `public/personnel.css`

Purpose:

The Personnel Consol displays personnel profile data for authorized users. It is intended for reviewing saved personnel profiles without showing all personnel names immediately on page open.

Important API routes:

- `GET /api/personnel-profiles`
- `GET /api/teacher-directory`

Key behavior:

- Access is protected by Personnel Consol password `1111`.
- Personnel names are available in the search dropdown.
- The page does not automatically display all personnel cards when opened.
- Details are shown only when a specific personnel name is selected.
- Saved profile values are displayed based on the selected personnel record.

### 6. Guidance Case Management Module

Pages:

- `/guidance`
- `/guidance.html`

Main files:

- `public/guidance.html`
- `public/guidance.js`
- `public/guidance.css`

Purpose:

The Guidance module records learner incidents, interventions, involved learners, immediate response, adviser notification, signatory, status, and case details.

Important API routes:

- `GET /api/guidance-cases`
- `POST /api/guidance-cases`
- `PUT /api/guidance-cases/:id`
- `DELETE /api/guidance-cases/:id`
- `GET /api/students`
- `GET /api/advisory-directory`

Key behavior:

- Learner names are typable with suggestions.
- Main learner and involved learner fields resolve typed names back to saved learner records.
- The complete learner profile is shown after selecting or typing a valid learner.
- Guidance signatory is selected automatically:
  - JHS cases: Alexander S. Moreno
  - Elementary cases: Monalisa G. Lebuna
- Adviser information is generated from the selected learner section.
- Cases can be created, edited, deleted, searched, and printed as reports.
- Offline guidance cases are saved locally and queued for sync.

### 7. Guidance Report Module

Pages:

- `/guidance-report`
- `/guidance-report.html`

Main files:

- `public/guidance-report.html`
- `public/guidance-report.js`
- `public/guidance-report.css`

Purpose:

The Guidance Report module summarizes saved guidance cases for monitoring and reporting.

Important API routes:

- `GET /api/guidance-cases`

Key behavior:

- Loads guidance cases from the server when online.
- Falls back to offline saved guidance cases when needed.
- Supports reporting by month and year.
- Displays guidance case summaries using saved case data.

### 8. Teacher Account Administration Module

Pages:

- `/teacher-accounts`
- `/teacher-accounts.html`

Main files:

- `public/teacher-accounts.html`
- `public/teacher-accounts.js`
- `public/teacher-accounts.css`

Purpose:

This module is for creating, editing, activating, deactivating, and deleting teacher accounts. It is restricted to admin users.

Important API routes:

- `GET /api/teacher-accounts`
- `POST /api/teacher-accounts`
- `PUT /api/teacher-accounts/:username`
- `DELETE /api/teacher-accounts/:username`
- `POST /api/teacher-admin-unlock`

Key behavior:

- Admin-only access.
- Loads teacher names from the teacher directory.
- Supports account roles and active status.
- Uses PIN-based access for teachers.

## Data Sources and Storage

BIS1 uses a combination of server storage, browser storage, and external sheet sources.

### Server-Side Storage

The server can store records through configured data paths or database-backed storage, depending on deployment configuration.

Important storage files and paths include:

- `students.json`
- `teacher-accounts.json`
- `guidance-cases.json`
- `personnel-profiles.json`
- `kiosk-settings.json`
- `orders.json`
- `transaction-ledger.json`

Environment variables can override default storage paths.

### Browser Offline Storage

The learner-facing BIS1 modules use offline storage through:

- `public/learner-offline.js`
- `public/learner-sw.js`
- IndexedDB
- Local storage
- Service worker shell caching

Offline support covers:

- Learner records
- Pending learner changes
- Guidance cases
- Pending guidance changes
- Cached advisory data
- Cached personnel/profile data where applicable

### Google Sheet / CSV Sources

The server reads external spreadsheet CSV exports for:

- Teacher directory
- Grade sections
- Advisory directory
- Personnel profile field titles and options

Current behavior includes:

- Teacher names are read from the configured teacher directory source.
- Grade / section choices are read from the configured section source.
- Personnel field titles are read from Column A of the personnel profile source.
- Department dropdown options can be read from Column B of the personnel profile source.

## Access Control

BIS1 protects sensitive school records through session checks on both pages and API routes.

Protected areas include:

- Learner Profile
- Dashboard
- Personnel Consol
- Personnel Profile
- Guidance
- Guidance Report
- Teacher Account Administration

Additional restrictions:

- Guidance pages require guidance-authorized access.
- Teacher account administration requires admin role.
- Personnel profile saving is limited to the logged-in user's own profile unless the session is admin.
- Personnel Consol requires password `1111`.

## Offline Capability

BIS1 is designed to remain usable during unstable connectivity.

Offline features include:

- Cached app shell for key pages.
- Local learner record storage.
- Local guidance case storage.
- Queued learner changes.
- Queued guidance changes.
- Automatic sync attempts when online.

Important files:

- `public/learner-offline.js`
- `public/learner-sw.js`
- `public/learner-manifest.webmanifest`

## Deployment

BIS1 is deployed as a Node.js web service.

Main deployment file:

- `render.yaml`

Configured Render service:

- Service name: `bis1`
- Environment: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

Important environment variables:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `DATA_NAMESPACE`
- `TEACHER_USERNAME`
- `TEACHER_PIN`
- `TEACHER_ADMIN_PASSWORD`
- `TEACHER_SESSION_SECRET`
- `STUDENT_SHEET_SYNC_URL`
- `STUDENT_SHEET_SYNC_SECRET`

Local startup command:

```bash
npm start
```

Syntax check command:

```bash
npm run check
```

## Technical Architecture

### Backend

File:

- `server.js`

Responsibilities:

- Serves static HTML, CSS, and JavaScript files.
- Provides API routes for learner, personnel, guidance, teacher account, and configuration data.
- Validates teacher and guidance sessions.
- Reads external CSV sources.
- Normalizes dates and profile values.
- Handles storage reads and writes.
- Supports deployment health checks.

### Frontend

Folder:

- `public/`

Responsibilities:

- Provides browser-based user interfaces.
- Handles form validation and dynamic UI rendering.
- Stores offline data.
- Queues offline changes.
- Refreshes data when connectivity returns.
- Uses cache-busted script and stylesheet versions to avoid stale browser files.

### Service Worker

File:

- `public/learner-sw.js`

Responsibilities:

- Caches learner shell files.
- Provides offline shell fallbacks.
- Clears older shell caches.
- Helps key BIS1 pages load even when offline.

## Important User Workflows

### Login Workflow

1. User opens a protected page.
2. If no valid session exists, user is redirected to `/teacher-login`.
3. User selects or enters teacher credentials and PIN.
4. Server validates the login.
5. User is redirected to the requested page.

### Learner Record Workflow

1. User opens Learner Profile.
2. Learner records load from local cache first.
3. If online, the app refreshes from the server.
4. User adds, edits, deletes, reorders, searches, or exports records.
5. Offline changes are queued if internet is unavailable.

### Personnel Profile Workflow

1. User logs in.
2. User opens Personnel Profile.
3. The app identifies the logged-in personnel name.
4. Dynamic fields are rendered.
5. Existing saved data is loaded into the boxes.
6. User updates only needed boxes.
7. User saves the profile.

### Personnel Consol Workflow

1. User opens Personnel Consol.
2. User enters password `1111`.
3. Names are available in the dropdown.
4. No full name list is shown by default.
5. User selects one personnel name.
6. Saved profile data appears for review.

### Guidance Case Workflow

1. User opens Guidance.
2. User types or selects a learner name.
3. The learner profile appears.
4. User records incident details, role, response, intervention, and status.
5. System identifies adviser and signatory.
6. Case is saved online or queued offline.
7. Case can be edited, deleted, reported, or reviewed later.

## Data Privacy and Security Notes

BIS1 handles sensitive learner, personnel, and guidance information. Users should:

- Use only authorized accounts.
- Avoid sharing login PINs.
- Log out after using shared devices.
- Treat guidance records as confidential.
- Avoid exporting or printing learner data unless needed for official school purposes.
- Keep deployment environment secrets private.

Recommended future security improvements:

- Replace shared default passwords with individual accounts.
- Enforce stronger PIN/password requirements.
- Add audit logs for sensitive actions.
- Add role labels for guidance, teacher, and admin users.
- Review session duration and automatic logout settings.

## Maintenance Guide

Recommended maintenance tasks:

1. Regularly verify that Render deployment is healthy.
2. Run `npm run check` before pushing changes.
3. Keep teacher accounts updated.
4. Review learner and guidance pending sync behavior after outages.
5. Update cache-busting versions when changing browser files.
6. Keep Google Sheet column structure consistent with the app.
7. Back up stored JSON or database records.
8. Review environment variables after deployment changes.

## Current Limitations

Known limitations and areas for improvement:

- Some data sources depend on external spreadsheet availability.
- Offline sync depends on browser storage remaining available on the device.
- Personnel Consol password is currently a fixed value.
- Some modules share the same Node server with older food kiosk features in the repository.
- Printed documents and formal PDF reports may need additional layout polishing depending on school format requirements.

## Suggested Future Improvements

Recommended next enhancements:

1. Add a formal printable user manual.
2. Add backup and restore tools for learner and guidance data.
3. Add import/export tools for personnel profiles.
4. Add role-based dashboards for teacher, guidance, and admin users.
5. Add audit history for profile and guidance case edits.
6. Add automatic duplicate learner detection.
7. Add better validation for phone numbers, LRN, dates, and personnel IDs.
8. Add an admin settings page for passwords, options, and field labels.
9. Convert this documentation into a Word or PDF handbook for school use.

## Summary

BIS1 is a practical school information system focused on learner records, personnel profiles, guidance case management, dashboard summaries, and protected teacher access. Its strongest features are its browser-based workflow, dynamic profile forms, offline support, and integration with existing school data sources.

The system is suitable for continued school use and can be expanded into a more complete student information, personnel, and guidance management platform.
