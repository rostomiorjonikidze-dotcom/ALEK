import Foundation
import UIKit

struct LiveSample: Identifiable {
    let id = UUID()
    let timestamp: Date
    let pid: String
    let value: Double
}

struct ReadinessMonitor: Identifiable {
    let name: String
    let supported: Bool
    let complete: Bool
    var id: String { name }
}

struct ReadinessState {
    let milOn: Bool
    let reportedFaultCount: Int
    let monitors: [UInt8]

    static func decode(_ response: String) -> ReadinessState? {
        let bytes = OBDParser.hexBytes(response)
        guard let index = bytes.indices.first(where: {
            bytes[$0] == 0x41 && $0 + 5 < bytes.count && bytes[$0 + 1] == 0x01
        }) else { return nil }
        let a = bytes[index + 2]
        return ReadinessState(milOn: (a & 0x80) != 0,
                              reportedFaultCount: Int(a & 0x7F),
                              monitors: Array(bytes[(index + 3)...(index + 5)]))
    }

    var rawHex: String { monitors.map { String(format: "%02X", $0) }.joined(separator: " ") }

    var isDiesel: Bool {
        monitors.count == 3 && (monitors[0] & 0x08) != 0
    }

    var motorType: String { isDiesel ? "Diesel / Compression" : "Petrol / Spark" }

    var details: [ReadinessMonitor] {
        guard monitors.count == 3 else { return [] }
        let b = monitors[0], c = monitors[1], d = monitors[2]
        var results = [
            ReadinessMonitor(name: "Misfire", supported: (b & 0x01) != 0,
                             complete: (b & 0x10) == 0),
            ReadinessMonitor(name: "Fuel System", supported: (b & 0x02) != 0,
                             complete: (b & 0x20) == 0),
            ReadinessMonitor(name: "Comprehensive Components", supported: (b & 0x04) != 0,
                             complete: (b & 0x40) == 0)
        ]
        let labels = isDiesel
            ? ["NMHC catalyst", "NOx / SCR", "Boost pressure",
               "Exhaust gas sensor", "Particulate filter", "EGR / VVT", "Reserved", "Reserved"]
            : ["Catalyst", "Heated catalyst", "EVAP", "Secondary air",
               "A/C refrigerant", "Oxygen sensor", "Oxygen heater", "EGR / VVT"]
        for bit in 0..<8 {
            if isDiesel && bit >= 6 { continue }
            let mask: UInt8 = 1 << bit
            results.append(ReadinessMonitor(name: labels[bit],
                                            supported: (c & mask) != 0,
                                            complete: (d & mask) == 0))
        }
        return results.filter { $0.supported }
    }

    var allSupportedComplete: Bool {
        !details.isEmpty && details.allSatisfy { $0.complete }
    }
}

extension OBDParser {
    static func freezeValue(forPID pid: String, in response: String) -> Double? {
        let bytes = hexBytes(response)
        guard let requested = UInt8(pid, radix: 16),
              let i = bytes.indices.first(where: {
                  bytes[$0] == 0x42 && $0 + 3 < bytes.count &&
                  bytes[$0 + 1] == requested && bytes[$0 + 2] == 0
              }) else { return nil }
        let a = Double(bytes[i + 3])
        let b = i + 4 < bytes.count ? Double(bytes[i + 4]) : 0
        switch pid {
        case "0C": return i + 4 < bytes.count ? (a * 256 + b) / 4 : nil
        case "05", "0F": return a - 40
        case "0B": return a
        case "10": return i + 4 < bytes.count ? (a * 256 + b) / 100 : nil
        case "0D": return a
        default: return nil
        }
    }
}

extension DiagnosticService {
    func refreshReadiness() {
        guard ecuConnected else { return }
        request("0101", timeout: 8) { [weak self] response in
            self?.readiness = ReadinessState.decode(response)
        }
    }

    func loadFreezeFrame() {
        guard ecuConnected else { return }
        freezeFrame = [:]
        let supported = ["0C", "0D", "05", "0F", "0B", "10"]
        func next(_ index: Int) {
            guard index < supported.count else { return }
            let pid = supported[index]
            request("02" + pid + "00", timeout: 7) { [weak self] response in
                guard let self else { return }
                if let value = OBDParser.freezeValue(forPID: pid, in: response) {
                    self.freezeFrame[pid] = value
                }
                next(index + 1)
            }
        }
        next(0)
    }
}

enum DiagnosticPDF {
    static func create(diagnostic: DiagnosticService) throws -> URL {
        let reportDate = Date()
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("ALEK_Diagnostic_\(Int(reportDate.timeIntervalSince1970)).pdf")
        let page = CGRect(x: 0, y: 0, width: 595, height: 842)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let content = renderer.pdfData { context in
            context.beginPage()
            let margin: CGFloat = 44
            let width = page.width - margin * 2
            var y: CGFloat = margin

            func line(_ value: String, size: CGFloat = 12, bold: Bool = false,
                      color: UIColor = .black) {
                let font = bold
                    ? UIFont.systemFont(ofSize: size, weight: .semibold)
                    : UIFont.systemFont(ofSize: size)
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: font, .foregroundColor: color
                ]
                let height = (value as NSString).boundingRect(
                    with: CGSize(width: width, height: .greatestFiniteMagnitude),
                    options: [.usesLineFragmentOrigin], attributes: attrs, context: nil
                ).height + 8
                if y + height > page.height - margin {
                    context.beginPage()
                    y = margin
                }
                (value as NSString).draw(
                    in: CGRect(x: margin, y: y, width: width, height: height),
                    withAttributes: attrs
                )
                y += height
            }

            line("ALEK DIAGNOSTIC", size: 26, bold: true, color: UIColor(red: 0.77, green: 0.13, blue: 0.19, alpha: 1))
            line("Vehicle diagnostics report / Rapport de diagnostic", size: 13)
            y += 10
            line("Date: \(reportDate.formatted(date: .complete, time: .shortened))")
            line("Vehicle profile: \(diagnostic.selectedVehicle?.title ?? "Not selected")")
            line("VIN read from ECU: \(diagnostic.vin ?? "Not provided")")
            if let profile = diagnostic.selectedVehicle, !profile.manualVIN.isEmpty {
                line("VIN manually entered: \(profile.manualVIN)")
            }
            line("Connection: \(diagnostic.ecuConnected ? "ELM327 ECU online" : "offline / recorded data")")
            y += 12
            line("ENGINE DTC CODES", size: 15, bold: true)
            if diagnostic.faults.isEmpty {
                line("No codes stored in current app session; this does not certify a fault-free car.")
            } else {
                for fault in diagnostic.faults {
                    line("\(fault.code) — \(fault.category)")
                    line(DTCGuide.description(for: fault.code).title, size: 10)
                }
            }
            y += 12
            line("ENHANCED CAN / UDS DTC (RAW)", size: 15, bold: true)
            for ecu in diagnostic.enhancedResults {
                line("ECU (ecu.requestID) -> (ecu.responseID): (ecu.state)", size: 10)
                for fault in ecu.faults {
                    line("RAW DTC (fault.rawDTC), status 0x(String(format: "%02X", fault.status)), status availability 0x(String(format: "%02X", fault.statusAvailabilityMask))", size: 10)
                }
            }
            line("OEM interpretations of raw UDS DTCs are not verified. Do not substitute generic P-code labels for manufacturer-specific definitions.", size: 9)
            y += 12
            line("LIVE OBD DATA (last received)", size: 15, bold: true)
            for definition in OBDParser.sensors {
                let v = diagnostic.formattedValue(for: definition)
                line("\(definition.pid)  \(definition.label): \(v) \(definition.unit)")
            }
            y += 12
            line("I/M READINESS", size: 15, bold: true)
            if let r = diagnostic.readiness {
                line("MIL: \(r.milOn ? "ON" : "OFF"), ECU code count: \(r.reportedFaultCount)")
                line("Monitor bytes (B C D): \(r.rawHex)")
                line("Ignition type: \(r.motorType)")
                for monitor in r.details {
                    line("\(monitor.name): \(monitor.complete ? "COMPLETE" : "NOT COMPLETE")", size: 10)
                }
            } else {
                line("Not read")
            }
            y += 12
            line("VEHICLE ECU INFORMATION", size: 15, bold: true)
            for pid in ["04", "06", "0A"] {
                if let raw = diagnostic.vehicleInfo[pid] {
                    let label = ["04": "Calibration IDs", "06": "CVN", "0A": "ECU Name"][pid] ?? pid
                    line("\(label): \(raw)", size: 10)
                }
            }
            y += 12
            line("FREEZE FRAME", size: 15, bold: true)
            for definition in OBDParser.sensors {
                if let v = diagnostic.freezeFrame[definition.pid] {
                    line("\(definition.label): \(String(format: "%.2f", v)) \(definition.unit)")
                }
            }
            y += 14
            line("Note: This report is limited to available standardized OBD-II engine information; it is not an inspection of all ECUs. Measurements and DTCs require professional interpretation.", size: 10,
                 color: .darkGray)
        }
        try content.write(to: file, options: .atomic)
        return file
    }
}
