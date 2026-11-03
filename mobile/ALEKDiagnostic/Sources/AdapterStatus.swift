import Foundation

/// Read-only adapter/protocol metadata returned by ELM327 AT commands.
/// These values come from the real adapter (not a claim of ECU connectivity).
struct AdapterStatus {
    var version: String?
    var protocolName: String?
    var protocolCode: String?
    var voltage: Double?
}

enum AdapterTextParser {
    static func firmware(_ response: String) -> String? {
        let lines = normalizedLines(response)
        return lines.first(where: { line in
            let u = line.uppercased()
            return !u.hasPrefix("AT") && u != "OK" && u != "?" && !u.contains("NO DATA")
        })
    }

    static func protocolName(_ response: String) -> String? {
        let lines = normalizedLines(response)
        return lines.first(where: { line in
            let u = line.uppercased()
            return u != "OK" && u != "?" && !u.hasPrefix("AT") && !u.contains("NO DATA")
        })
    }

    static func protocolCode(_ response: String) -> String? {
        let line = normalizedLines(response).first(where: {
            !$0.uppercased().hasPrefix("AT") && $0 != "OK" && $0 != "?"
        })
        guard let line else { return nil }
        let code = line.trimmingCharacters(in: .whitespaces).uppercased()
        guard code.count <= 3,
              code.allSatisfy({ $0.isHexDigit || $0 == "A" }) else { return nil }
        return code
    }

    static func voltage(_ response: String) -> Double? {
        let lines = normalizedLines(response)
        for line in lines {
            let plain = line.uppercased().replacingOccurrences(of: " ", with: "")
            guard plain.hasSuffix("V") else { continue }
            let digits = String(plain.dropLast())
            guard let value = Double(digits), (0.0...35.0).contains(value) else { continue }
            return value
        }
        return nil
    }

    private static func normalizedLines(_ response: String) -> [String] {
        response.replacingOccurrences(of: ">", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
