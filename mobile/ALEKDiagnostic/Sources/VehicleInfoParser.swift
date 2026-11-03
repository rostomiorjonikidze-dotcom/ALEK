
/// Raw, read-only Mode 09 identifiers. VIN is parsed separately.
/// Some ECUs do not expose CAL ID, CVN or ECU name over generic OBD-II.
enum VehicleInfoParser {
    static func hexPayload(_ response: String, pid: String) -> String? {
        guard let requestedPID = UInt8(pid, radix: 16) else { return nil }
        let bytes = ELMResponse.bytes(response)
        guard let start = bytes.indices.first(where: { i in
            i + 2 < bytes.count && bytes[i] == 0x49 && bytes[i + 1] == requestedPID
        }) else { return nil }
        let result = Array(bytes.dropFirst(start + 3))
        guard !result.isEmpty else { return nil }
        return result.prefix(256).map { String(format: "%02X", $0) }.joined(separator: " ")
    }

    static func asciiValue(_ response: String, pid: String) -> String? {
        guard let requestedPID = UInt8(pid, radix: 16) else { return nil }
        let bytes = ELMResponse.bytes(response)
        guard let start = bytes.indices.first(where: { i in
            i + 2 < bytes.count && bytes[i] == 0x49 && bytes[i + 1] == requestedPID
        }) else { return nil }
        let payload = bytes.dropFirst(start + 3).filter { $0 >= 0x20 && $0 <= 0x7E }
        let text = String(decoding: payload, as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : String(text.prefix(100))
    }
}

