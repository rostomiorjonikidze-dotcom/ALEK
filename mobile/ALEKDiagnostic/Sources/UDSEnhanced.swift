import Foundation

/// ISO 14229 ReadDTCInformation (0x19, 0x02) for physical 11-bit CAN modules.
/// Only the raw ECU-provided 24-bit identifier and status byte are authoritative.
/// Any textual manufacturer interpretation requires separate verified OEM data.
struct EnhancedFault: Identifiable, Codable, Hashable {
    let requestID: String
    let responseID: String
    let rawDTC: String
    let status: UInt8
    let statusAvailabilityMask: UInt8
    var id: String { responseID + ":" + rawDTC }

    var statusWords: [String] {
        let names = [
            "ტესტი ვერ გაიარა", "შეცდომა მიმდინარე ციკლში",
            "მოსალოდნელი", "დადასტურებული", "ტესტი არ დასრულებულა ბოლო განულების შემდეგ",
            "შეცდომა ბოლო განულების შემდეგ", "ტესტი არ დასრულებულა ამ ციკლში",
            "მოთხოვნილია გამაფრთხილებელი ნათურა"
        ]
        return (0..<8).filter { status & (1 << $0) != 0 }
            .map { names[$0] }
    }

    /// SAE J2012 P/C/B/U interpretation is only a tentative rendering.
    /// UDS 24-bit codes may use manufacturer-specific formats and failure types.
    var tentativeSAE: String {
        guard rawDTC.count == 6,
              let hi = UInt8(rawDTC.prefix(2), radix: 16),
              let mid = UInt8(rawDTC.dropFirst(2).prefix(2), radix: 16),
              let sub = UInt8(rawDTC.suffix(2), radix: 16) else { return "" }
        let sys = ["P", "C", "B", "U"][Int(hi >> 6)]
        return String(format: "%@%d%1X%02X-%02X", sys, Int((hi >> 4) & 0x03),
                      Int(hi & 0x0F), Int(mid), Int(sub))
    }
}

struct EnhancedECUResult: Identifiable {
    let requestID: String
    let responseID: String
    let state: String
    let faults: [EnhancedFault]
    let rawResponse: String
    var id: String { requestID }
}

enum UDSReadResult {
    case success([EnhancedFault], UInt8)
    case negative(UInt8)
    case invalid
}

enum UDSDTC {
    static let requestIDs = (0...7).map { String(format: "%03X", 0x7E0 + $0) }

    static func responseID(for requestID: String) -> String? {
        guard let n = Int(requestID, radix: 16), (0x7E0...0x7E7).contains(n)
        else { return nil }
        return String(format: "%03X", n + 8)
    }

    static func supportedCAN11Bit(protocolCode: String?, protocolName: String?) -> Bool {
        if let code = protocolCode?.uppercased().trimmingCharacters(in: .whitespaces) {
            if ["6", "8", "A6", "A8"].contains(code) { return true }
            if !code.isEmpty { return false }
        }
        if let name = protocolName?.lowercased(), name.contains("can"),
           name.contains("11 bit") { return true }
        return false
    }

    static func isATOK(_ text: String) -> Bool {
        text.uppercased().replacingOccurrences(of: ">", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n")
            .contains(where: { $0.trimmingCharacters(in: .whitespaces) == "OK" })
    }

    static func parse(_ response: String, requestID: String) -> UDSReadResult {
        guard let responseID = responseID(for: requestID) else { return .invalid }
        let bytes = ELMResponse.bytes(response)
        guard !bytes.isEmpty else { return .invalid }

        // An explicitly selected ATCRA filter is required by the scanning service.
        // Do not claim attribution to an ECU from unfiltered replies.
        if let i = bytes.indices.first(where: {
            bytes[$0] == 0x7F && $0 + 2 < bytes.count && bytes[$0 + 1] == 0x19
        }) {
            return .negative(bytes[i + 2])
        }
        guard let start = bytes.indices.first(where: {
            bytes[$0] == 0x59 && $0 + 2 < bytes.count && bytes[$0 + 1] == 0x02
        }) else { return .invalid }
        let available = bytes[start + 2]
        let payload = Array(bytes.dropFirst(start + 3))
        guard payload.count % 4 == 0 else { return .invalid }
        var faults: [EnhancedFault] = []
        for i in stride(from: 0, to: payload.count, by: 4) {
            let raw = payload[i..<i+3].map { String(format: "%02X", $0) }.joined()
            let status = payload[i+3]
            faults.append(EnhancedFault(requestID: requestID, responseID: responseID,
                                        rawDTC: raw, status: status,
                                        statusAvailabilityMask: available))
        }
        return .success(faults, available)
    }
}
