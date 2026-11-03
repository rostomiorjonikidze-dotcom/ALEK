import Foundation

/// Parses common ELM327 replies, including command echo, 11/29-bit CAN headers,
/// compact/spaced hex, single-frame ISO-TP, and first/consecutive ISO-TP frames.
/// The parser never injects simulated ECU values.
enum ELMResponse {
    static func bytes(_ response: String) -> [UInt8] {
        var output: [UInt8] = []
        var remainingISOBytes = 0
        let normalized = response.replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: ">", with: "\n")

        for original in normalized.components(separatedBy: "\n") {
            var line = original.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if line.isEmpty || line.hasPrefix("SEARCHING") || line.contains("NO DATA") ||
                line.contains("UNABLE") || line.contains("STOPPED") ||
                line.contains("CAN ERROR") || line.contains("BUS INIT") ||
                line.contains("BUS ERROR") || line.contains("BUFFER FULL") { continue }

            if let colon = line.firstIndex(of: ":") {
                let prefix = line[..<colon].trimmingCharacters(in: .whitespaces)
                if (1...2).contains(prefix.count), prefix.allSatisfy({ $0.isHexDigit }) {
                    line = String(line[line.index(after: colon)...])
                }
            }

            var tokens = line.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            guard !tokens.isEmpty else { continue }
            if tokens.count == 1 {
                let echo = tokens[0]
                if echo.hasPrefix("AT") || ["03", "04", "07", "0A", "0902"].contains(echo) ||
                    (echo.count == 4 && (echo.hasPrefix("01") || echo.hasPrefix("02"))) ||
                    (echo.count == 6 && echo.hasPrefix("02")) { continue }
            }

            var hadHeader = false
            if tokens.count > 1, let first = tokens.first,
               [3, 8].contains(first.count), first.allSatisfy({ $0.isHexDigit }) {
                tokens.removeFirst()
                hadHeader = true
            }
            var lineBytes: [UInt8] = []
            for token in tokens {
                guard token.count >= 2, token.count.isMultiple(of: 2),
                      token.allSatisfy({ $0.isHexDigit }) else { continue }
                var index = token.startIndex
                while index < token.endIndex {
                    let next = token.index(index, offsetBy: 2)
                    if let number = UInt8(token[index..<next], radix: 16) {
                        lineBytes.append(number)
                    }
                    index = next
                }
            }
            guard !lineBytes.isEmpty else { continue }

            // A CAN header is sometimes followed by an explicit 1-byte DLC.
            if hadHeader && lineBytes.count > 2 && lineBytes[0] <= 8 &&
               [0x41, 0x42, 0x43, 0x44, 0x47, 0x49, 0x4A].contains(lineBytes[1]) {
                lineBytes.removeFirst()
            }

            // ISO-TP first frame: 10 14 49 02 01 ..., payload length 0x14.
            if lineBytes.count >= 4, lineBytes[0] & 0xF0 == 0x10,
               [0x41, 0x42, 0x43, 0x47, 0x49, 0x4A].contains(lineBytes[2]) {
                let length = Int(lineBytes[0] & 0x0F) * 256 + Int(lineBytes[1])
                let payload = Array(lineBytes.dropFirst(2).prefix(length))
                output += payload
                remainingISOBytes = max(0, length - payload.count)
                continue
            }

            // ISO-TP consecutive frame. Only strip PCI if a first frame was seen.
            if remainingISOBytes > 0, lineBytes[0] & 0xF0 == 0x20 {
                let payload = Array(lineBytes.dropFirst().prefix(remainingISOBytes))
                output += payload
                remainingISOBytes = max(0, remainingISOBytes - payload.count)
                continue
            }

            // ISO-TP single frame: 04 41 0C 1A F8 [padding].
            if lineBytes.count >= 3, lineBytes[0] > 0, lineBytes[0] <= 7,
               [0x41, 0x42, 0x43, 0x47, 0x49, 0x4A].contains(lineBytes[1]) {
                let length = Int(lineBytes[0])
                output += lineBytes.dropFirst().prefix(length)
                continue
            }

            output += lineBytes
        }
        return output
    }

    static func hasPositiveResponse(_ response: String, mode: UInt8) -> Bool {
        bytes(response).contains(mode &+ 0x40)
    }

    static func isEmptyValidReply(_ response: String) -> Bool {
        let raw = response.uppercased()
        return raw.contains("NO DATA") || raw.contains("43 00") ||
            raw.contains("47 00") || raw.contains("4A 00")
    }
}
