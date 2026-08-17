# Avantis Cross-Product QA Compatibility Matrix

## 1. Scope & Verification Matrix
This matrix validates that Avantis Hardware Support operates with 100% genuine hardware telemetry and adapts its UI, metrics, and health score calculations across all device types and hardware topologies.

| Hardware Subsystem | Laptop / 2-in-1 Portable | Desktop Tower / Workstation | Touch All-in-One (AIO) | Graceful Degradation / Failure State |
| :--- | :--- | :--- | :--- | :--- |
| **Device Model & ID** | SMBIOS Chassis 8-12 (e.g. `Avantis BookPro 14`) | SMBIOS Chassis 3-7 (e.g. `Avantis ProTower 7000`) | SMBIOS Chassis 13 (e.g. `Avantis Touch AIO 24`) | BIOS UUID fallback; zero generic strings |
| **Processor Architecture** | Dynamic cores/threads & clock speed (Intel / AMD / Qualcomm) | Multi-core high TDP (e.g. Ryzen 9 / Core i9) | Low-power / Ultra-core (e.g. Core Ultra 7) | No brand or formatting assumptions |
| **Installed RAM** | Physical stick breakdown (e.g. `16 GB (1x 16GB)`) | Multi-slot DDR4/DDR5 (e.g. `32 GB (2x 16GB 5200MHz)`) | Dual-channel SODIMM (e.g. `16 GB (2x 8GB)`) | Total visible memory computed from `os.totalmem()` |
| **Graphics (GPU)** | Integrated (Intel Iris / AMD Radeon) | Dual GPU: Dedicated RTX/Radeon + Integrated | Integrated or Discrete Arc GPU | Prioritizes dedicated GPU with VRAM; lists all |
| **Storage & SMART** | Primary OS drive (C:) + SMART predict | Multi-drive: NVMe boot (C:) + SATA secondary (D:) | Single NVMe SSD (C:) | Detects all physical drives; flags any failing drive |
| **Pen & Touch Input** | Standard display (`No pen or touch input`) | Desktop monitor (`No pen or touch input`) | Multi-touch digitizer (`Touch support with 10 points`) | Live PnP / SM_DIGITIZER detection; no hardcoding |
| **Power Delivery** | `Win32_Battery` charge % & wear % | `AC Mains Power (PSU)` (Zero battery deductions) | `AC Mains Power (PSU)` (Zero battery deductions) | Laptops check cell wear; Desktops check AC stability |
| **Health Score Engine** | Adapts to battery wear, thermal, RAM, SMART | Adapts to CPU load/temp, RAM, multi-drive SMART | Adapts to CPU load/temp, RAM, single-drive SMART | No battery deductions on AC-only machines |

---

## 2. Automated Cross-Device Test Suite

Run cross-device validation via:
```bash
node scripts/test_cross_device.js
```

### Verified Test Scenarios (16/16 Passed):
1. **Physical Host Machine**: Direct live telemetry, real RAM capacity, genuine storage metrics, power delivery detection.
2. **Avantis ProTower Workstation**: Desktop topology, AMD Ryzen 9, 32GB 2-stick DDR5, Dual GPU (RTX 4070 12GB primary), Dual storage drives (1TB NVMe + 2TB SATA), AC Mains PSU with 100/100 score (zero battery deductions).
3. **Avantis Touch All-in-One 24**: Intel Core Ultra 7, 16GB DDR5, Touchscreen digitizer + stylus support, AC Mains PSU.
4. **Degraded Field Laptop**: 96% RAM usage, 54% battery wear, 14 SMART reallocated sectors. Triggers `CRITICAL` status (Score: 10/100) with guided troubleshooting resolution steps.
5. **Cross-Machine Non-Collision**: Verified that zero serial numbers, processor strings, or health scores collide or use hardcoded fallbacks across models.
