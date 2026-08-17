# Avantis PC Support System — Complete Backend Technical Walkthrough & Architecture Report

---

## 1. System Architecture Overview

The **Avantis Support System** is an enterprise-grade PC diagnostic, predictive health, automated remediation, and fleet telemetry platform engineered for Avantis computers. It is structured into four decoupled, resilient microservices communicating over lightweight HTTP/IPC and WebSockets.

```mermaid
graph TD
    subgraph "Client PC (Local Subsystem)"
        HW["Hardware Sensors & Windows APIs<br/>(WMI / PowerShell / Defender / Disk / ACPI)"]
        
        AGENT["Local Hardware Agent<br/>(Node.js / Express @ Port 9140)"]
        ORCH["5-Stage Scan Orchestrator"]
        AI["Gemini AI & Predictive Engine"]
        NOTIF["Windows Native Toast Manager"]
        STORE["Audit Report Store (JSON)"]
        
        UI["Avantis Desktop UI<br/>(Vanilla HTML/CSS/JS @ Port 9142)"]
    end

    subgraph "Central Cloud Infrastructure"
        BACKEND["Central Telemetry Backend<br/>(Express API @ Port 9141)"]
        FLEET_DB[("Device Fleet Registry & Logs")]
        TICKETS[("Support Ticket Store")]
        
        DASH["Fleet Support Console<br/>(IT Admin Portal @ Port 9143)"]
    end

    HW -->|WMI / OS Queries| AGENT
    AGENT --> ORCH
    AGENT --> AI
    AGENT --> NOTIF
    AGENT --> STORE
    
    UI <-->|Local IPC (Port 9140)| AGENT
    AGENT -->|Heartbeats & Telemetry| BACKEND
    BACKEND --> FLEET_DB
    BACKEND --> TICKETS
    DASH <-->|Fleet REST APIs| BACKEND
```

---

## 2. Port Architecture & Service Topology

| Service | Port | Directory | Role & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Local Hardware Agent** | `9140` | `agent/` | Core diagnostic engine, WMI sensor polling, 5-stage scan orchestrator, Gemini AI assistant, deterministic predictive monitoring, native Windows toast alerts. |
| **Central Telemetry Backend** | `9141` | `backend/` | Cloud ingestion gateway, device inventory tracking, health rollups, support ticketing engine, alert dispatch. |
| **Avantis Client Desktop UI** | `9142` | `client-ui/` | Right-angled user dashboard, 6-action horizontal toolbar, 4 outcome metric tiles, 2x2 live telemetry grid, flexible auto-expanding Gemini chat. |
| **Fleet Support Console** | `9143` | `support-dashboard/` | IT administrator fleet management portal, live device inspection, telemetry search, ticket manager. |

---

## 3. Deep Dive: Local Hardware Agent (`agent/`, Port 9140)

The local agent is the heart of the system. It runs continuously as a background Windows service or standalone daemon.

### 3.1. Diagnostic & Sensor Pipeline (`agent/src/diagnostics/`)
* **`hardware_collector.js`**:
  * **CPU**: Real-time load percent, operating temperature ($^\circ\text{C}$), model name, physical/logical core counts via WMI `Win32_Processor` and `MSAcpi_ThermalZoneTemperature`.
  * **Memory (RAM)**: Total physical RAM, used RAM in GB, used percentage, free memory via `os.totalmem()` and `os.freemem()`.
  * **Storage**: Primary drive capacity (free GB, total GB, used %), physical drive model, interface type (`NVMe SSD` vs `SATA`), and raw SMART health status via `Win32_DiskDrive`.
  * **Battery & Power**: AC line status, current charge percentage, battery wear level / health percentage, charging state via `Win32_Battery`.
* **`threshold_engine.js`**:
  * Evaluates telemetry against configured enterprise thresholds (e.g. CPU $\ge 90\%$, Temp $\ge 85^\circ\text{C}$, RAM $\ge 90\%$, Disk $\ge 90\%$, Battery Health $< 60\%$).
  * Computes an aggregate **Health Score** ($0 - 100$) and status classification: `HEALTHY`, `WARNING`, or `CRITICAL`.

---

### 3.2. 5-Stage Sequential Orchestrator (`agent/src/orchestrator/`)
* **`system_scan_orchestrator.js`**:
  * Eliminates CPU/disk I/O thrashing by executing maintenance passes **sequentially, not in parallel**:
  ```
  Step 1: Scan Hardware (Read-only baseline of thermals, RAM, SMART, battery)
    └──> Step 2: Threat Scan (Windows Defender signature update & malware scan)
           └──> Step 3: Update Drivers (Match installed hardware against verified Avantis catalog)
                  └──> Step 4: Clean Up Files (Sweep temp staging folders, update caches, volume TRIM)
                         └──> Step 5: Optimize Network (Reset TCP/IP stack, flush DNS cache, record latency)
  ```
  * Computes unified outcome summary metrics:
    `{ updatesInstalled, spaceRecoveredGb, filesOptimized, threatsRemoved }`
  * Generates an immutable, timestamped JSON audit log saved into `reports/`.

---

### 3.3. Subsystem Modules (`agent/src/`)
1. **`threat/threat_scanner.js`**:
   * Uses PowerShell `Get-MpComputerStatus` and `Get-MpThreatDetection` to inspect real-time Defender protection, trigger quick scans, and report quarantined threats.
2. **`drivers/driver_manager.js`**:
   * Inventories active PnP hardware drivers via `Get-PnpDevice` and matches against `drivers_catalog.json`. Includes automatic Windows Restore Point creation before applying updates.
3. **`cleanup/cleanup_engine.js`**:
   * Cleans `C:\Windows\Temp`, user `%TEMP%`, SoftwareDistribution download cache, and executes SSD `Optimize-Volume -Defrag -ReTrim`.
4. **`network/network_optimizer.js`**:
   * Measures pre-optimization DNS latency, executes `ipconfig /flushdns`, `netsh int ip reset`, and measures post-optimization response time.
5. **`reports/report_store.js`**:
   * Manages reading, writing, and querying JSON reports in `reports/`.

---

### 3.4. Native Windows Notification Engine (`agent/src/notifications/`)
* **`notification_manager.js` & `send_toast.ps1`**:
  * Fired directly on the user's desktop using native Windows 10/11 WinRT Toast APIs and System Tray notifications.
  * **State Tracking & Anti-Spam**: Compares current severity weights against previously notified signal states (`HEALTHY` $\rightarrow$ `WARNING` $\rightarrow$ `CRITICAL`). Only fires on **new issues** or **severity escalations**. Automatically resets state when a subsystem returns to healthy.
  * **Works Headless**: Notification toasts fire directly even if the browser or desktop UI is completely closed.

---

## 4. Deep Dive: Gemini AI & Predictive Monitoring (`agent/src/ai/`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GEMINI AI ASSISTANT SUITE                          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│    PART 1: FOREGROUND CHAT ASSISTANT │ PART 2: BACKGROUND PREDICTIVE CARE   │
│  - REST API: POST /api/ai/chat       │  - Runs scheduled every 6h / scans   │
│  - Grounded in live sensors & scans  │  - Deterministic mathematical trends │
│  - Deep Avantis & laptop engineering │  - Zero API calls wasted on math     │
│  - Refuses to hallucinate fake specs │  - Fires native Windows Toast popups │
│  - Formatted plain text in UI        │  - 100% permission-based resolution  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 4.1. Foreground Grounded Chat Assistant (`gemini_service.js`)
* **Model Pipeline**: Primary `gemini-flash-latest`, with automatic failover to `gemini-pro-latest`.
* **Zero Hallucination Grounding**: The system prompt feeds exact live WMI sensor data and scan reports into a structured `CONTEXT JSON`. The model is strictly instructed never to fabricate hardware numbers or nonexistent components.
* **Deep Hardware & Laptop Expertise**: Educated on thermal dissipation, fan cleaning, battery charge calibration (100% $\rightarrow$ low power $\rightarrow$ recharge), Windows power throttling, NVMe optimization, and RAM management.
* **Rate-Limit & Offline Resilience**: Implements exponential backoff retry. If the API key is offline or throttled (`429`/`503`), the engine invokes a deterministic local template generator without crashing.

### 4.2. Background Deterministic Predictive Monitoring (`predictive_monitor.js`)
* **Local Mathematical Trend Math (Zero Quota Waste)**:
  * **Disk Depletion Trend**: Flags when primary drive free capacity drops by $\ge 15\%$ across 3+ scans.
  * **Thermal Envelope Trend**: Flags when CPU operating temperatures climb by $\ge 10^\circ\text{C}$ across 3+ scans.
  * **Battery Health Degradation**: Flags when battery retention capacity degrades by $\ge 5\%$ across 5+ scans.
  * **SMART Storage Anomaly**: Flags predictive disk hardware alerts.
* **Plain-English Gemini Translation**: Converts detected trend flags into actionable recommendations (`run_cleanup`, `run_driver_update`, `optimize_network`).
* **Desktop Notification**: Directly calls `sendWindowsToast()` to pop a native Windows notification on the screen.
* **Consent Safeguard**: Never modifies the user's machine silently. Any recommended action requires explicit user permission.

---

## 5. Deep Dive: Central Cloud Backend (`backend/`, Port 9141)

The backend provides fleet-wide observability and enterprise support workflows.

* **`backend/src/server.js` & `backend/src/routes/api.js`**:
  * **Device Telemetry Ingestion (`POST /api/v1/telemetry`)**: Ingests periodic health snapshots from all fleet endpoints.
  * **Fleet Overview (`GET /api/v1/devices`)**: Aggregates all registered Avantis machines with status filters (`ALL`, `CRITICAL`, `WARNING`, `HEALTHY`).
  * **Support Escalation Engine (`POST /api/v1/tickets`)**: Receives customer support tickets packaged with full hardware telemetry snapshots for instant IT triage.
  * **Fleet Analytics (`GET /api/v1/analytics`)**: Computes real-time fleet health distribution, average CPU/RAM load, and common hardware alerts.

---

## 6. Complete API Endpoint Reference

### Agent IPC Endpoints (`http://localhost:9140`)

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Live hardware sensor telemetry, threshold evaluation, and health score. |
| `POST` | `/api/scan` | Forces an immediate live diagnostic refresh. |
| `POST` | `/api/orchestrator/start` | Triggers the full 5-stage sequential maintenance scan. |
| `GET` | `/api/orchestrator/progress` | Polls live progress (step 1 to 5, status, log text). |
| `GET` | `/api/reports/latest` | Returns the latest stored JSON audit report. |
| `GET` | `/api/reports` | Lists all historical audit reports. |
| `GET` | `/api/reports/:id` | Fetches a specific audit report by filename. |
| `GET` | `/api/drivers/catalog` | Lists verified driver packages for the detected model. |
| `POST` | `/api/drivers/scan` | Scans local drivers against verified catalog. |
| `POST` | `/api/drivers/update` | Applies verified driver updates with restore points. |
| `POST` | `/api/threat/scan` | Runs Windows Defender quick threat scan. |
| `POST` | `/api/threat/update` | Updates Windows Defender definition signatures. |
| `POST` | `/api/cleanup/run` | Executes disk cleanup and SSD TRIM. |
| `POST` | `/api/network/optimize` | Flushes DNS and resets TCP/IP stack. |
| `POST` | `/api/ai/chat` | Grounded Gemini AI chat assistant with live telemetry context. |
| `GET` | `/api/ai/predictions` | Lists active predictive trend issues. |
| `POST` | `/api/ai/predict/check` | Forces an immediate predictive trend evaluation. |
| `POST` | `/api/ai/resolve` | Executes a permission-approved predictive fix. |
| `POST` | `/api/support/ticket` | Submits a support ticket with diagnostic snapshot to backend. |

### Central Backend Endpoints (`http://localhost:9141`)

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/telemetry` | Ingests device health and sensor telemetry. |
| `GET` | `/api/v1/devices` | Returns registered fleet devices. |
| `GET` | `/api/v1/devices/:id` | Returns deep diagnostic history for a specific machine. |
| `GET` | `/api/v1/tickets` | Returns active enterprise support tickets. |
| `POST` | `/api/v1/tickets` | Creates a new support ticket with hardware snapshot. |
| `GET` | `/api/v1/analytics` | Returns fleet-wide health scores and alert rollups. |

---

## 7. Automated Test Suites & Verification Status

```
====================================================
🧪 AUTOMATED VERIFICATION RESULTS
====================================================
1. Gemini Acceptance Suite (scripts/test_gemini_spec.js):
   - Grounded Answer Test (Real CPU numbers):       [PASS] ✅
   - No Hallucination Test (Refuses fake GPU):      [PASS] ✅
   - Threat Review Test (Defender explanation):     [PASS] ✅
   - Off-Topic Flexibility Test:                    [PASS] ✅
   - Empty Baseline Handling:                       [PASS] ✅
   - Declining Disk Trend Detection (40% -> 20%):   [PASS] ✅
   - Flat/Noisy Data (Zero False Positives):        [PASS] ✅
   - SMART Failure High Urgency Detection:          [PASS] ✅
   - JSON Schema Recommendation Validation:         [PASS] ✅
   - Offline / Quota Fallback Resilience:           [PASS] ✅

2. Predictive Simulator (scripts/simulate_prediction_test.js):
   - Disk Depletion Scenario:                       [PASS] ✅
   - Thermal Escalation Scenario:                   [PASS] ✅
   - Battery Wear Scenario:                         [PASS] ✅
   - SMART Anomaly Scenario:                        [PASS] ✅

3. Git Sync Status:
   - Remote: https://github.com/Jemade/Support-System.git
   - Branch: main (Clean, up-to-date)
====================================================
```
