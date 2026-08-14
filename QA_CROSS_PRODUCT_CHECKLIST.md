# AVANTiS Hardware Support — Cross-Product QA Verification Checklist

This internal QA test matrix confirms that the **Avantis Hardware Support Suite** functions reliably across all hardware form factors (Laptops, All-In-Ones, Desktops, Tablets, Workstations) without hardcoded assumptions.

---

## 📋 QA Test Matrix per Model

| Verification Item | Acceptance Criteria | Laptop / Tablet Behavior | Desktop / All-In-One Behavior | Pass / Fail |
| :--- | :--- | :--- | :--- | :---: |
| **1. Dynamic System Identity** | Hostname, Serial, Model, OS version detected at runtime via ACPI/SMBIOS without generic placeholders. | Reads model (e.g. `Avantis EliteBook`, `Avantis ProTab`) | Reads model (e.g. `Avantis All-In-One`, `Avantis Workstation`) | [ ] |
| **2. Processor & Load Telemetry** | CPU manufacturer, model, cores, clock speed, and current load percentage displayed. | Dynamic CPU profile & utilization | Dynamic CPU profile & utilization | [ ] |
| **3. Thermal Sensor Degradation** | If ACPI thermal sensor is exposed, show real temp (°C); if absent on budget motherboard, display load-correlated estimate without crashing or showing blank/zero. | Shows `Active (Direct ACPI Sensor)` | Shows `Active` or `Estimated baseline` gracefully | [ ] |
| **4. Memory Utilization** | Total physical RAM detected in GB, active memory tracked accurately, spec reflects installed capacity. | e.g. `8 GB DDR` or `16 GB DDR` | e.g. `16 GB DDR` or `32 GB DDR` | [ ] |
| **5. Storage & SMART Telemetry** | Primary drive mount (C:, /, etc.) and interface type (NVMe SSD, SATA SSD, HDD) detected dynamically. SMART health status verified. | Shows `Storage (C:)` + `NVMe SSD` / `SMART Passed` | Shows `Storage (C:)` + `SATA/NVMe` / `SMART Passed` | [ ] |
| **6. Power / Battery Adaptation** | If battery is present, show battery health percentage, charge level, and wear cycles. If absent (Desktop/AIO), automatically switch to **Power Supply (PSU) / AC Mains Power**. | Renders **Battery** card + health % | Renders **Power Supply (PSU)** card (no broken battery card) | [ ] |
| **7. Troubleshoot: Processor Test** | Stress test runs without error, verifies thermal headroom, provides plain-English pass/fail. | Pass / Thermal warning with guided steps | Pass / Thermal warning with guided steps | [ ] |
| **8. Troubleshoot: Memory Test** | Memory integrity scan verifies RAM read/write fidelity without crashing. | Pass / Parity alert with guided steps | Pass / Parity alert with guided steps | [ ] |
| **9. Troubleshoot: Storage Test** | Drive diagnostics inspect SMART attributes & reallocated sectors for specific drive type. | Pass / Bad sector warning with guided steps | Pass / Bad sector warning with guided steps | [ ] |
| **10. Troubleshoot: Power Test** | Battery diagnostics on laptops; AC line & PSU rail check on desktops. | Analyzes battery design capacity wear | Verifies AC power delivery & PSU rails | [ ] |
| **11. Action Center Notifications** | Native Windows toasts fire on WARNING/CRITICAL issues with deep-link click routing (`/#troubleshoot?component=...`). | Notification appears; click opens target card | Notification appears; click opens target card | [ ] |
| **12. Diagnostic Report Generation** | Generates exportable HTML report and plain-text copy containing dynamic device specs. | Exports clean diagnostic report | Exports clean diagnostic report | [ ] |

---

## 🛠️ Automated QA Verification Command

To execute the automated regression test suite on any device:

```bash
node scripts/test_hardware.js
```

---

*Avantis Technologies Quality Assurance Department · Product of Zimbabwe*
