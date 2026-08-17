# AVANTiS Hardware Support Suite

> **Product of Zimbabwe** : Engineered for Avantis PCs, Laptops, Desktops, Tablets, and All-in-Ones.  
> Designed to match Dell SupportAssist layout ergonomics with an authentic brand feel and robust hardware diagnostics.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Tech Stack & Architecture](#tech-stack--architecture)
3. [Four Product Pillars](#four-product-pillars)
4. [Native Windows Notification Subsystem](#native-windows-notification-subsystem)
5. [Ports & Endpoints Reference](#ports--endpoints-reference)
6. [Prerequisites & Installation](#prerequisites--installation)
7. [Running Locally](#running-locally)
8. [Running with Docker](#running-with-docker)
9. [Automated Verification Suite](#automated-verification-suite)
10. [Brand Typography & Color Rules](#brand-typography--color-rules)

---

## System Overview

The **Avantis Hardware Support Suite** is a hardware monitoring and diagnostics ecosystem built specifically for Avantis hardware. The system consists of three independent microservices working in unison:

```
                      +------------------------------------------+
                      |       Windows Hardware Telemetry         |
                      | (CPU Load, RAM, SMART, Battery, Storage) |
                      +--------------------+---------------------+
                                           |
                                           v
+--------------------------------------------------------------------------------------+
|                     AVANTiS Background Monitoring Agent (Port 9140)                 |
|  - Continuous 30s background health polling via WMI, CIM, and Performance Counters  |
|  - Threshold rules & evaluation engine (0-100 score)                                |
|  - Temporary file & cache cleanup engine                                             |
|  - Native Windows Action Center Notification Manager (state-tracked deduplication)  |
+-------------------+----------------------------------------------+-------------------+
                    |                                              |
      REST / IPC    |                               REST Telemetry | Ingest
                    v                                              v
+------------------------------------+             +-----------------------------------+
|  Customer Support UI (Port 9142)   |             |   Cloud Backend API (Port 9141)   |
|  - Dell SupportAssist layout       |             |  - PostgreSQL Persistence         |
|  - Top nav: Home, Troubleshoot,    |             |  - In-Memory Fallback Adapter     |
|    Support, History, Settings      |             |  - Support Ticket Queue           |
|  - 6-item Action Toolbar           |             +-----------------------------------+
|  - Summary / Actions sub-views     |
|  - 90-day impact event log         |
|  - Anchored Avantis Assistant chat |
|  - Printable Diagnostic Reports    |
+------------------------------------+
```

---

## Tech Stack & Architecture

| Subsystem | Directory | Tech Stack | Purpose |
| :--- | :--- | :--- | :--- |
| **Customer Support Dashboard** | [`client-ui/`](file:///client-ui) | HTML5, Vanilla CSS Design System, JavaScript (ES6+), Google Fonts (*Plus Jakarta Sans*, *JetBrains Mono*), Express | Clean single-device desktop support interface running locally on the user's PC (Port 9142). |
| **Background Agent** | [`agent/`](file:///agent) | Node.js, Express, Windows WinRT PowerShell Bridge, WMI/CIM | Quiet background service monitoring hardware metrics every 30s, dispatching Action Center alerts, and running cleanups (Port 9140). |
| **Cloud Backend API** | [`backend/`](file:///backend) | Node.js, Express, PostgreSQL `pg` Pool (with auto-switching In-Memory engine fallback), CORS | Ingests device telemetry, manages central device registry, alerts, and customer support tickets (Port 9141). |
| **Scripts & Diagnostics** | [`scripts/`](file:///scripts) | Windows Batch (`.bat`), Node.js Test Suite | One-click service orchestration and automated system verification suite. |

---

## Four Product Pillars

### 1. Driver Updates
- **Catalog Detection**: Scans installed drivers against Avantis verified driver repository for the device model.
- **Interactive Download & Install**: Step-by-step progress animation with immediate status updates and real maintenance event logging.

### 2. Hardware Scans & Troubleshoot
- **Primary CTA**: "Run Diagnostic Check" full-system scan providing an animated SVG health score gauge.
- **Isolated Component Tests (Troubleshoot Tab)**:
  - **Processor**: Thermal and load stress test monitoring clock stability.
  - **Memory**: Integrity read/write verification across memory banks.
  - **Storage**: SMART health attributes, sector verification, and capacity check.
  - **Power**: Battery wear cycles, design capacity degradation, and AC connection status.
- **Guided Resolution**: Plain-English explanations and actionable step-by-step recommendations.

### 3. Performance Tuning & 90-Day Impact Stats
- **Temporary Files Cleanup**: Scans and cleans Windows `Temp` and crash dumps safely.
- **90-Day Trailing Aggregate**: Real event logging tracking software updates installed, drive space recovered, files optimized, and threats removed.
- **Contextual Performance Insights**: Dynamically computed advice based on live RAM, storage, and thermal metrics.

### 4. Threat Detection
- **Unified Security View**: Surfaces active antivirus protection status (*Windows Defender / Licensed AV Engine*) alongside hardware health indicators.

---

## Native Windows Notification Subsystem

The background agent includes a dedicated `NotificationManager` that fires native Windows 10/11 Action Center toast notifications directly from the background service, even if the dashboard is closed.

### Key Notification Behaviors:
1. **Plain-English Messaging**:
   - *Battery wear*: `"Battery health has dropped to 58% of original design capacity: consider a battery replacement."`
   - *Storage warning*: `"Drive C: reported 12 reallocated sectors. Drive health monitoring is active."`
   - *CPU overheating*: `"CPU temperature reached 92°C. Thermal throttling is active: check system ventilation."`
2. **State-Tracked Deduplication**:
   - Fires once when an issue is first detected (`HEALTHY` -> `WARNING` or `CRITICAL`).
   - Fires again ONLY upon escalation (e.g. `WARNING` -> `CRITICAL`) or when a separate issue occurs.
   - Quiet on routine checks: periodic 30-second cycles do not re-notify if severity has not changed.
   - Auto-reset on resolution: when a component returns to normal, the tracking state resets.
3. **Deep-Link Protocol Navigation**:
   - Clicking `"Open Troubleshoot"` launches `http://localhost:9142/#troubleshoot?component={cpu|memory|storage|power}`.

---

## Ports & Endpoints Reference

| Service | Port | Base URL | Primary Endpoints |
| :--- | :--- | :--- | :--- |
| **Agent IPC API** | `9140` | `http://localhost:9140` | `GET /api/status`<br>`POST /api/scan`<br>`POST /api/cleanup/scan`<br>`POST /api/cleanup/execute`<br>`POST /api/network/optimize`<br>`POST /api/security/scan`<br>`POST /api/support/ticket`<br>`GET /api/notifications/status`<br>`POST /api/notifications/test` |
| **Backend API** | `9141` | `http://localhost:9141` | `GET /health`<br>`POST /api/v1/telemetry/ingest`<br>`GET /api/v1/devices`<br>`GET /api/v1/devices/:id`<br>`GET /api/v1/alerts`<br>`GET /api/v1/tickets`<br>`POST /api/v1/tickets`<br>`PATCH /api/v1/tickets/:id` |
| **Customer Support UI** | `9142` | `http://localhost:9142` | `http://localhost:9142` (Home)<br>`http://localhost:9142/#troubleshoot`<br>`http://localhost:9142/#support`<br>`http://localhost:9142/#history`<br>`http://localhost:9142/#settings` |

---

## Prerequisites & Installation

### 1. Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **PowerShell**: Built-in Windows PowerShell (for native Action Center toasts and WMI queries).
- **Docker & Docker Compose** (optional, for containerized deployment).

### 2. Install Dependencies
Run the following commands from the repository directory:

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
```

---

## Running Locally

### Option A: One-Click Launcher (Windows)
Double-click [`scripts/run_all.bat`](file:///scripts/run_all.bat) or run from PowerShell / Command Prompt:

```cmd
cd scripts
run_all.bat
```

### Option B: Manual Service Startup

```bash
# Terminal 1: Backend API
cd backend
node src/server.js

# Terminal 2: Background Monitoring Agent
cd agent
node src/index.js

# Terminal 3: Customer Desktop Dashboard
cd client-ui
node server.js
```

Then open your browser to:
- **Customer Support Dashboard**: [`http://localhost:9142`](http://localhost:9142)

---

## Running with Docker

You can run the full suite using Docker and Docker Compose.

### 1. Prerequisites
- Docker Desktop installed and running.

### 2. Configure Environment (Optional)
Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Build & Run Stack
From the project root:

```bash
docker compose up --build
```

To run in detached (background) mode:

```bash
docker compose up --build -d
```

### 4. Access the Application
Open your browser to:
- **Avantis Hardware Support Dashboard**: [`http://localhost:9142`](http://localhost:9142)

### 5. Stop Containers
To stop the running containers:

```bash
docker compose down
```

To stop containers and remove the database volume:

```bash
docker compose down -v
```

---

## Automated Verification Suite

To verify system health, live hardware telemetry, IPC endpoints, cleanup engine, ticket flow, and the notification manager:

```bash
node scripts/test_hardware.js
```

---

## Brand Typography & Color Rules

- **Wordmark Solid Teal**: `#13A3AF`
- **CTA / Accent Teal-Green**: `#0BBCA8` (hover: `#09a290`)
- **Subtitle Muted Teal**: `#98D3D8` ("Product of Zimbabwe")
- **AV Monogram Favicon**: Located at `client-ui/assets/avantis-icon.svg`
- **Primary Typography**: *Plus Jakarta Sans* (400, 500, 600, 700, 800)
- **Monospace Code/Serial**: *JetBrains Mono* (400, 500, 600)
