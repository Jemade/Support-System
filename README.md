# AVANTiS Hardware Support & Fleet Diagnostics Suite

> **Product of Zimbabwe** — Engineered for Avantis PCs, Laptops, Desktops, and Tablets.  
> Designed to achieve feature parity with Dell SupportAssist with an authentic, human-crafted brand feel and robust hardware diagnostics.

---

## 📑 Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack & Architecture](#tech-stack--architecture)
3. [Four Product Pillars](#four-product-pillars)
4. [Native Windows Notification Subsystem](#native-windows-notification-subsystem)
5. [Ports & Endpoints Reference](#ports--endpoints-reference)
6. [Prerequisites & Installation](#prerequisites--installation)
7. [Running the System](#running-the-system)
8. [Automated Verification Suite](#automated-verification-suite)
9. [Brand Typography & Design Rules](#brand-typography--design-rules)

---

## 🌟 System Overview

The **Avantis Hardware Support Suite** is an enterprise-grade hardware monitoring and diagnostics ecosystem built specifically for Avantis hardware. The system consists of four independent microservices working in unison:

```
                      +------------------------------------------+
                      |       Windows Hardware Telemetry         |
                      | (CPU Temp, RAM, SMART, Battery, Storage) |
                      +--------------------+---------------------+
                                           |
                                           v
+--------------------------------------------------------------------------------------+
|                     AVANTiS Background Monitoring Agent (Port 9140)                 |
|  - Continuous 30s background health polling                                         |
|  - Threshold rules & evaluation engine (0-100 score)                                |
|  - Temporary file & cache cleanup engine                                             |
|  - Native Windows Action Center Notification Manager (state-tracked deduplication)  |
+-------------------+----------------------------------------------+-------------------+
                    |                                              |
      REST / IPC    |                               REST Telemetry | Ingest
                    v                                              v
+------------------------------------+             +-----------------------------------+
|  Customer Support UI (Port 9142)   |             |   Cloud Backend API (Port 9141)   |
|  - Modern single-device dashboard  |             |  - PostgreSQL Persistence         |
|  - 4 Tabs: Home, Troubleshoot,     |             |  - In-Memory Fallback Adapter     |
|    Drivers, History                |             |  - Support Ticket Queue           |
|  - Single-component diagnostics    |             +-----------------+-----------------+
|  - Deep-link route handler         |                               |
|  - Printable Diagnostic Reports    |                               | Fleet Telemetry
+------------------------------------+                               v
                                                   +-----------------------------------+
                                                   | Support Console Portal (Port 9143)|
                                                   |  - Helpdesk Fleet Inspector       |
                                                   |  - Device Registry & Alert Queue  |
                                                   |  - Support Ticket Resolution      |
                                                   +-----------------------------------+
```

---

## 🛠️ Tech Stack & Architecture

| Subsystem | Directory | Tech Stack | Purpose |
| :--- | :--- | :--- | :--- |
| **Customer Support Dashboard** | [`client-ui/`](file:///c:/Users/admin/Desktop/project_support/client-ui) | HTML5, Vanilla CSS Design System, JavaScript (ES6+), Google Fonts (*Plus Jakarta Sans*, *JetBrains Mono*), Express | Clean, human-crafted single-device desktop support interface running locally on the user's PC. |
| **Background Agent** | [`agent/`](file:///c:/Users/admin/Desktop/project_support/agent) | Node.js, Express, `systeminformation`, Windows WinRT PowerShell Bridge | Quiet background service monitoring hardware metrics every 30s, dispatching Action Center alerts, and running cleanups. |
| **Cloud Backend API** | [`backend/`](file:///c:/Users/admin/Desktop/project_support/backend) | Node.js, Express, PostgreSQL `pg` Pool (with auto-switching In-Memory engine fallback), CORS | Ingests device telemetry, manages central device registry, alerts, and customer support tickets. |
| **Fleet Support Console** | [`support-dashboard/`](file:///c:/Users/admin/Desktop/project_support/support-dashboard) | HTML5, CSS3, JavaScript, Express | Centralized helpdesk portal for support engineers to inspect fleet health, telemetry snapshots, and tickets. |
| **Scripts & Diagnostics** | [`scripts/`](file:///c:/Users/admin/Desktop/project_support/scripts) | Windows Batch (`.bat`), Node.js Test Suite | One-click service orchestration and automated 7-step hardware verification suite. |

---

## 🎯 Four Product Pillars

### 1. Driver Updates
- **Catalog Detection**: Scans installed drivers against Avantis's verified driver repository for the device's specific hardware model.
- **Interactive Download & Install**: Step-by-step progress animation with immediate status updates.
- *Architecture Note*: Built with a modular UI surface ready to consume the backend driver catalog (`GET /api/drivers/{modelId}`).

### 2. Hardware Scans & Troubleshoot
- **Primary CTA**: "Run Diagnostic Check" full-system scan providing an animated SVG health score gauge.
- **Isolated Component Tests (Troubleshoot Tab)**:
  - **Processor**: Thermal and load stress test monitoring core temperature ramps.
  - **Memory**: Integrity read/write verification across memory banks.
  - **Storage**: SMART health attributes, sector verification, and capacity check.
  - **Power**: Battery wear cycles, design capacity degradation, and AC connection status.
- **Guided Resolution**: Rather than raw codes, issues surface plain-English explanations and actionable step-by-step recommendations.

### 3. Performance Tuning
- **Temporary Files Cleanup**: Scans and cleans Windows `Temp`, `INetCache`, and crash dumps safely.
- **Contextual Performance Insights**: Dynamically computes advice based on live RAM, storage, and thermal metrics.

### 4. Threat Detection
- **Unified Security View**: Surfaces active antivirus protection status (*Windows Defender / Licensed AV Engine*) alongside hardware health indicators.

---

## 🔔 Native Windows Notification Subsystem

The background agent includes a dedicated `NotificationManager` that fires native Windows 10/11 Action Center toast notifications directly from the background service—**even if the dashboard or browser is completely closed**.

### Key Notification Behaviors:
1. **Plain-English Messaging**:
   - *Battery wear*: `"Battery health has dropped to 58% of original design capacity — consider a battery replacement."`
   - *Storage warning*: `"Drive C: reported 12 reallocated sectors. Drive health monitoring is active."`
   - *CPU overheating*: `"CPU temperature reached 92°C. Thermal throttling is active — check system ventilation."`
2. **State-Tracked Deduplication (No Spam)**:
   - **Fires once** when an issue is first detected (`HEALTHY` $\rightarrow$ `WARNING` or `CRITICAL`).
   - **Fires again ONLY upon escalation** (e.g. `WARNING` $\rightarrow$ `CRITICAL`) or when a separate issue occurs.
   - **Quiet on routine checks**: Periodic 30-second cycles do not re-notify if severity has not changed.
   - **Auto-Reset on Resolution**: When a component cools down or space is reclaimed (`WARNING` $\rightarrow$ `HEALTHY`), the tracking state resets so any future recurrence notifies anew.
3. **Deep-Link Protocol Navigation**:
   - Clicking `"Open Troubleshoot"` on the toast launches `http://localhost:9142/#troubleshoot?component={cpu|memory|storage|power}`.
   - The Client UI automatically navigates to the Troubleshoot tab, scrolls to the target card, and applies an attention highlight pulse.

---

## 🔌 Ports & Endpoints Reference

| Service | Port | Base URL | Primary Endpoints |
| :--- | :--- | :--- | :--- |
| **Agent IPC API** | `9140` | `http://localhost:9140` | `GET /api/status`<br>`POST /api/scan`<br>`POST /api/cleanup/scan`<br>`POST /api/cleanup/execute`<br>`POST /api/support/ticket`<br>`GET /api/notifications/status`<br>`POST /api/notifications/test` |
| **Backend Cloud API** | `9141` | `http://localhost:9141` | `GET /health`<br>`POST /api/v1/telemetry/ingest`<br>`GET /api/v1/devices`<br>`GET /api/v1/devices/:id`<br>`GET /api/v1/alerts`<br>`GET /api/v1/tickets`<br>`POST /api/v1/tickets`<br>`PATCH /api/v1/tickets/:id` |
| **Customer Support UI** | `9142` | `http://localhost:9142` | `http://localhost:9142` (Home)<br>`http://localhost:9142/#troubleshoot`<br>`http://localhost:9142/#drivers`<br>`http://localhost:9142/#history` |
| **Fleet Portal** | `9143` | `http://localhost:9143` | `http://localhost:9143` (Fleet Diagnostics Console) |

---

## 📦 Prerequisites & Installation

### 1. Prerequisites
- **Node.js**: Version 18.0.0 or higher installed on Windows.
- **PowerShell**: Built-in Windows PowerShell (for native Action Center toasts).

### 2. Install Dependencies
Run the following command from the project root (or navigate into each folder):

```bash
# 1. Install Background Agent dependencies
cd agent
npm install

# 2. Install Cloud Backend dependencies
cd ../backend
npm install

# 3. Install Customer Support UI dependencies
cd ../client-ui
npm install

# 4. Install Support Dashboard dependencies
cd ../support-dashboard
npm install
```

---

## 🚀 Running the System

### Option A: One-Click Launcher (Recommended)
Double-click [`scripts/run_all.bat`](file:///c:/Users/admin/Desktop/project_support/scripts/run_all.bat) or run it from the command line:

```cmd
cd scripts
run_all.bat
```

This starts all four services in their respective console windows, waits for startup, and prompts to run the automated verification suite.

### Option B: Manual Service Startup
If you wish to run services individually in separate terminals:

```bash
# Terminal 1 — Backend API
cd backend
node src/server.js

# Terminal 2 — Background Monitoring Agent
cd agent
node src/index.js

# Terminal 3 — Customer Desktop Dashboard
cd client-ui
node server.js

# Terminal 4 — Technical Support Fleet Console
cd support-dashboard
node server.js
```

Then open your browser to:
- **Customer Support Dashboard**: [`http://localhost:9142`](http://localhost:9142)
- **Fleet Management Console**: [`http://localhost:9143`](http://localhost:9143)

---

## 🧪 Automated Verification Suite

To verify system health, agent IPC, database persistence, cleanup engine, ticket flow, and the notification manager:

```bash
node scripts/test_hardware.js
```

### Verification Output Sample:
```
=== Avantis PC Support System — Phase 1 Hardware Verification Suite ===

Test 1: Checking Backend API health & PostgreSQL connection...
[PASS] Backend API Online — Database mode: PostgreSQL (In-Memory Engine)

Test 2: Checking Local Agent IPC status & diagnostic collection...
[PASS] Agent Service Running
       Hardware Serial: AVT-ZIM-884920
       Model:           Avantis All-In-One PC (HM65)
       CPU Load/Temp:   42% / 48°C
       RAM Usage:       33% (5.2/16 GB)
       Storage (C:):    35% used, SMART: PASSED
       Power State:     AC Mains Power (Desktop / AIO PC)

Test 3: Testing System Cleanup Engine scan...
[PASS] Cleanup Scan successful — Found 450.5 MB reclaimable across 120 temp files

Test 4: Testing Support Ticket Creation via Agent IPC...
[PASS] Support Ticket Created Successfully — Ticket ID: AVT-TCK-483613

Test 5: Verifying Device Registration in Backend Database...
[PASS] Device Registered in DB — ID: AVT-ZIM-884920, Model: Avantis All-In-One PC (HM65), Health Score: 100/100

Test 6: Verifying Ticket reflection in Support Portal API...
[PASS] Total 1 Support Ticket(s) found in PostgreSQL DB

Test 7: Verifying Notification Subsystem Status & Trigger...
[PASS] Notification Subsystem Online — Tracked signals: cpu, memory, storage, battery

===============================================================
Verification Summary: 7 PASSED, 0 FAILED
===============================================================
```

---

## 🎨 Brand Typography & Design Rules

To maintain a consistent, authentic brand signature matching the official **AVANTiS** identity:

1. **Wordmark Signature (`.avantis-wordmark` / SVG Vector)**:
   - **Solid Wordmark Teal (`#13A3AF`)**: The entire word **`AVANTiS`** is styled in **one solid flat teal (`#13A3AF`)** — bold, geometric, angular sans-serif letterforms with uniform stroke weight and tight tracking.
   - **Alternating Caret / Valley Rhythm**:
     - Both **`A`**s have **no crossbar** and a sharp pointed apex (open at the bottom, like a caret `^`).
     - The **`V`** mirrors that angle, open at the top (`\/`).
     - Alternating rhythm across `AVA` (`^ \/ ^`).
     - **`N`**, **`T`**, and **`S`** are standard bold blocky letterforms with squared terminals and uniform stroke weight throughout.
     - The **`i`** is the only lowercase letter in the word (shorter stem, separated dot, sitting at roughly cap-height) and is rendered in the **exact same solid `#13A3AF` as every other letter** — never recolored as a separate accent.
   - **Subtitle**: `"PRODUCT OF ZIMBABWE"` in a lighter muted teal (**`#98D3D8`**) with wide letter-spacing (`0.24em`).
   - Encapsulated in the reusable `.avantis-brand-wrapper` component:
     ```html
     <div class="avantis-brand-wrapper">
       <div class="avantis-wordmark">
         <span class="wm-letter">AVANT</span><span class="wm-i">i</span><span class="wm-letter">S</span>
       </div>
       <div class="brand-tech-subtitle">PRODUCT OF ZIMBABWE</div>
     </div>
     ```
2. **Interactive CTA & Accent Colors**:
   - **Primary Action / Button CTA Teal-Green**: **`#0BBCA8`** (buttons, active status badges, health ring fill).
   - **Hardware Icons**: Outlined hardware icons (Processor chip, RAM DIMM stick, NVMe/Storage disk, Battery/PSU) styled in unified **`#13A3AF`**.
   - **Neutral Surfaces**: Off-white background (`#f5f8fa`), crisp white panels, and subtle border hierarchy (`#e2e8f0`).
3. **Floating Avantis Agent Assistant**:
   - Distinct 52x52 rounded floating badge in the bottom-right corner in `#13A3AF` with an active `#0BBCA8` health dot.

---

## 📄 License & Attribution

© Avantis Technologies. Product of Zimbabwe. Built for Avantis Hardware Support Operations.

---

## Running with Docker

Prerequisites: Docker and Docker Compose installed.

1. Clone the repo and move into the project folder.
2. Copy `.env.example` to `.env` and fill in any required values:
   ```bash
   cp .env.example .env
   ```
3. Run:
   ```bash
   docker compose up --build -d
   ```
4. Open http://localhost:9142 in a browser.
   - Customer Support Dashboard: http://localhost:9142
   - Helpdesk Fleet Console: http://localhost:9143
   - Backend Cloud API: http://localhost:9141
5. To stop: `docker compose down`. To stop and wipe the database: `docker compose down -v`.
