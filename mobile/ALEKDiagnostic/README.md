# ALEK DIAGNOSTIC V8 MOBILE

Native iPhone diagnostic app for ELM327 **Bluetooth Low Energy** adapters. Designed for practical, real-ECU SAE J1979 / EOBD diagnostics, with a Georgian-language professional dark interface.

## Implemented in the iOS source

- CoreBluetooth device discovery, UART characteristic selection, BLE status and ECU handshake.
- ELM initialization with serialized AT and OBD commands; protocol name/code, firmware and voltage responses.
- Manual ECU reconnect without re-pairing Bluetooth.
- Real OBD-II engine DTC reads: stored 03, pending 07, permanent 0A.
- Mode 04 code-clearing with explicit user confirmation (never silently).
- Mode 01 supported-PID detection and 19 standard live telemetry values (only if the ECU returns them).
- Mode 02 limited freeze-frame values; mode 01 PID 01 I/M readiness.
- Mode 09 PID 02 VIN retrieval when supported.
- Offline Georgian generic DTC explanations and suggested checks for common codes; no claim of OEM-specific certainty.
- Locally saved scan history; real-data graphs; PDF diagnostic report; CSV telemetry export.
- User-controlled technical log export with commands, responses, timeouts, and BLE characteristic IDs.

## Installation from source (macOS + Xcode)

**Requirements:** A real iPhone running iOS 17+, recent Xcode, an Apple ID for on-device signing, and an ELM327 BLE adapter. An iPhone simulator cannot communicate with a real BLE adapter.

1. Download this branch or the project ZIP artifact from its GitHub Actions workflow.
2. The generated Xcode ZIP already contains the .xcodeproj file. Otherwise run brew install xcodegen and xcodegen generate in mobile/ALEKDiagnostic.
3. Open ALEKDiagnosticMobile.xcodeproj in Xcode.
4. Select your iPhone and assign a signing Team under Signing & Capabilities.
5. Build & Run. Enable Bluetooth permission.
6. Connect the ELM327 BLE adapter to the vehicle, switch ignition ON, close other OBD apps (some adapters only allow one connection), choose the OBDII adapter in ALEK, and inspect the actual ECU connection status.
7. Verify RPM and fault reading on a parked vehicle before relying on measurements.
8. If the ECU does not respond, use the **BLE/ELM technical log export** action in the home screen. The log may contain VIN / vehicle data, so share it only with trusted recipients.

## CI

The GitHub Actions workflow generates the Xcode project, builds an unsigned iOS Simulator app, runs unit tests, and uploads a complete Xcode project ZIP. **A simulator build and unit tests do not prove Bluetooth or ECU compatibility on your actual vehicle.**

## Scope limitations

- This source is a real iOS OBD-II app, not a picture or fabricated telemetry, but it is **not yet a hardware-verified production release**.
- ABS, Airbag/SRS, transmission manufacturer-specific diagnostics, injector coding, forced DPF regen, ECU flash, special coding/actuations are **not implemented**. They cannot be promised for every model using a generic ELM327 clone.
- Manufacturer-specific data and test procedures may need licensed sources, validated protocols, and different hardware.
- The user-provided Windows V8 ZIP (~503 MiB) could not be inspected/extracted in the available execution environment. Its Windows binaries and proprietary databases have **not** been migrated.
- No signed IPA or TestFlight build exists. Personal iPhone installation needs signing through Xcode or an authorized Apple distribution workflow.
- This is not a substitute for an appropriately equipped professional scan tool when checking brakes, airbags, or safety-critical systems.

## Safety

Readouts are based on actual returned ECU messages; unsupported sensors show a dash instead of made-up numbers. Clear DTC erases evidence and can reset emission monitors. Diagnose and repair issues rather than only clearing codes. Never interact with the app while driving.

## Development branch

feature/alek-diagnostic-elm327-ios

The existing Windows/Delphi code and the repository main branch are left unchanged.
