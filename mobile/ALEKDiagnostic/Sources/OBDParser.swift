import Foundation

struct FaultCode: Identifiable, Codable, Hashable {
    let code: String
    let category: String
    var id: String { category + ":" + code }
}

struct SensorDefinition: Identifiable {
    let pid: String
    let label: String
    let unit: String
    var id: String { pid }
}

enum OBDParser {
    static let sensors: [SensorDefinition] = [
        .init(pid: "0C", label: "ძრავის ბრუნები", unit: "RPM"),
        .init(pid: "0D", label: "სიჩქარე", unit: "km/h"),
        .init(pid: "05", label: "ძრავის ტემპერატურა", unit: "°C"),
        .init(pid: "0F", label: "შემავალი ჰაერი", unit: "°C"),
        .init(pid: "10", label: "ჰაერის ნაკადი (MAF)", unit: "g/s"),
        .init(pid: "0B", label: "შემშვები წნევა (MAP)", unit: "kPa"),
        .init(pid: "04", label: "ძრავის დატვირთვა", unit: "%"),
        .init(pid: "42", label: "ECU ძაბვა", unit: "V"),
        .init(pid: "11", label: "დროსელის მდგომარეობა", unit: "%"),
        .init(pid: "06", label: "STFT Bank 1", unit: "%"),
        .init(pid: "07", label: "LTFT Bank 1", unit: "%"),
        .init(pid: "0E", label: "ანთების კუთხე", unit: "°"),
        .init(pid: "1F", label: "ძრავის მუშაობის დრო", unit: "s"),
        .init(pid: "2F", label: "საწვავის დონე", unit: "%"),
        .init(pid: "31", label: "განულების შემდეგ მანძილი", unit: "km"),
        .init(pid: "33", label: "ატმოსფერული წნევა", unit: "kPa"),
        .init(pid: "46", label: "გარემოს ტემპერატურა", unit: "°C"),
        .init(pid: "5C", label: "ზეთის ტემპერატურა", unit: "°C"),
        .init(pid: "5E", label: "საწვავის ხარჯი", unit: "L/h")
    ]

    static func hexBytes(_ response: String) -> [UInt8] {
        var bytes: [UInt8] = []
        for rawLine in response.uppercased().components(separatedBy: .newlines) {
            var line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty || line.contains("NO DATA") || line.contains("SEARCHING") ||
               line.contains("UNABLE") || line.contains("STOPPED") ||
               line.contains("CAN ERROR") || line.contains("BUS INIT") { continue }
            // Remove ELM multi-frame prefixes, e.g. 0: / 1:
            if let colon = line.firstIndex(of: ":") {
                let prefix = String(line[..<colon]).trimmingCharacters(in: .whitespaces)
                if !prefix.isEmpty && prefix.allSatisfy({ $0.isHexDigit }) {
                    line = String(line[line.index(after: colon)...])
                }
            }
            for token in line.split(whereSeparator: { $0.isWhitespace || $0 == ">" }) {
                let word = String(token)
                // Ignore 11-bit and 29-bit CAN header tokens, which contain IDs.
                if word.count == 3 { continue }
                guard word.count >= 2, word.count.isMultiple(of: 2),
                      word.allSatisfy({ $0.isHexDigit }) else { continue }
                var index = word.startIndex
                while index < word.endIndex {
                    let next = word.index(index, offsetBy: 2)
                    if let value = UInt8(word[index..<next], radix: 16) { bytes.append(value) }
                    index = next
                }
            }
        }
        return bytes
    }

    static func supportedPIDs(_ response: String, blockPID: String) -> Set<String> {
        guard let block = UInt8(blockPID, radix: 16) else { return [] }
        let bytes = hexBytes(response)
        guard let i = bytes.indices.first(where: {
            bytes[$0] == 0x41 && $0 + 5 < bytes.count && bytes[$0 + 1] == block
        }) else { return [] }
        var result = Set<String>()
        for n in 0..<32 {
            let currentByte = bytes[i + 2 + n / 8]
            let bit: UInt8 = 1 << (7 - (n % 8))
            if currentByte & bit != 0 {
                result.insert(String(format: "%02X", Int(block) + n + 1))
            }
        }
        return result
    }

    static func value(forPID pid: String, in response: String) -> Double? {
        guard let code = UInt8(pid, radix: 16) else { return nil }
        let data = hexBytes(response)
        guard let index = data.indices.first(where: {
            data[$0] == 0x41 && ($0 + 1) < data.count && data[$0 + 1] == code
        }) else { return nil }
        let start = index + 2
        guard start < data.count else { return nil }
        let a = Double(data[start])
        let b = start + 1 < data.count ? Double(data[start + 1]) : 0

        switch pid.uppercased() {
        case "0C": return start + 1 < data.count ? (256 * a + b) / 4 : nil
        case "0D", "0B", "33", "1F": return pid == "1F" ? (start + 1 < data.count ? 256 * a + b : nil) : a
        case "05", "0F", "46", "5C": return a - 40
        case "10": return start + 1 < data.count ? (256 * a + b) / 100 : nil
        case "04", "11", "2F": return a * 100 / 255
        case "06", "07": return (a - 128) * 100 / 128
        case "0E": return a / 2 - 64
        case "31": return start + 1 < data.count ? 256 * a + b : nil
        case "42": return start + 1 < data.count ? (256 * a + b) / 1000 : nil
        case "5E": return start + 1 < data.count ? (256 * a + b) / 20 : nil
        default: return nil
        }
    }

    static func faults(_ response: String, mode: UInt8, category: String) -> [FaultCode] {
        let data = hexBytes(response)
        let marker = mode &+ 0x40
        var found: [FaultCode] = []
        for i in data.indices where data[i] == marker {
            var offset = i + 1
            while offset + 1 < data.count {
                let a = data[offset], b = data[offset + 1]
                if a == 0 && b == 0 { break }
                found.append(.init(code: decodeDTC(a, b), category: category))
                offset += 2
                // A standard response is limited; prevents crossing into another frame.
                if offset - i > 7 { break }
            }
        }
        return Array(Set(found)).sorted { $0.code < $1.code }
    }

    private static func decodeDTC(_ a: UInt8, _ b: UInt8) -> String {
        let system = ["P", "C", "B", "U"][Int(a >> 6)]
        return String(format: "%@%d%1X%02X", system, Int((a >> 4) & 0x03), Int(a & 0x0F), Int(b))
    }

    static func vin(_ response: String) -> String? {
        let bytes = hexBytes(response)
        guard let start = bytes.indices.first(where: {
            bytes[$0] == 0x49 && $0 + 2 < bytes.count && bytes[$0 + 1] == 0x02
        }) else { return nil }
        let rest = bytes.dropFirst(start + 3)
        let readable = rest.filter { (48...57).contains(Int($0)) || (65...90).contains(Int($0)) }
        let candidate = String(decoding: readable.prefix(17), as: UTF8.self)
        return candidate.count == 17 ? candidate : nil
    }
}
