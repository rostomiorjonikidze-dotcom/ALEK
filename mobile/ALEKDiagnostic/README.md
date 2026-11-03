# ALEK DIAGNOSTIC V8 — iPhone / ELM327 BLE

Phase 1: native iOS source foundation. This does not modify the existing Windows/Delphi app.

## Included
- SwiftUI dark/red interface with Georgian text
- CoreBluetooth ELM327 BLE discovery, connect, notify and write
- Serial ELM AT command queue with timeout and prompt handling
- Standard OBD-II DTC reads (03, 07, 0A), MIL reset (04) behind confirmation
- RPM, vehicle speed, coolant, intake air, MAF, MAP, engine load, ECU voltage
- VIN request (0902) best effort; locally stored scan history

## Build on Mac
1. Install Xcode and XcodeGen (Homebrew: brew install xcodegen).
2. Open a Terminal in this directory and run: xcodegen generate
3. Open ALEKDiagnosticMobile.xcodeproj in Xcode.
4. Set your Apple Team in Signing & Capabilities, select a physical iPhone, Build & Run.
5. Connect an ELM327 Bluetooth LE adapter with ignition ON.

## Important
- This phase has NOT been compiled or tested with a real vehicle.
- ELM327 Bluetooth LE clone characteristic mappings vary. The transport searches for common UART write and notify paths.
- No ABS/SRS, coding, DPF forced regeneration, key programming, ECU flashing, or unsafe actuation is implemented.
- Original Windows archive (~503 MiB) could not be extracted in the current execution environment. No proprietary database migration is claimed.
- Readings always come from ECU responses: no simulated gauge values.
- Clear DTC is behind an explicit confirmation; it resets emission monitors and may erase useful fault evidence.
- Do not use the app while driving.
- Windows/Delphi source assets are not copied. Review licensing before importing any older database.
