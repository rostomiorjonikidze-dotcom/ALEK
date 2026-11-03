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
        ELMResponse.bytes(response)
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
        var cursor = 0
        while cursor < data.count {
            guard let i = data[cursor...].firstIndex(of: marker) else { break }
            var offset = i + 1
            var decodedPairs = 0
            while offset + 1 < data.count && decodedPairs < 64 {
                let a = data[offset], b = data[offset + 1]
                if a == 0 && b == 0 {
                    offset += 2
                    break
                }
                found.append(.init(code: decodeDTC(a, b), category: category))
                offset += 2
                decodedPairs += 1
            }
            cursor = max(offset, i + 1)
        }
        return Array(Set(found)).sorted { $0.code < $1.code }
    }

    private static func decodeDTC(_ a: UInt8, _ b: UInt8) -> String {
        let system = ["P", "C", "B", "U"][Int(a >> 6)]
        return String(format: "%@%d%1X%02X", system, Int((a >> 4) & 0x03), Int(a & 0x0F), Int(b))
    }

    static func vin(_ response: String) -> String? {
        let bytes = hexBytes(response)
        var data: [UInt8] = []
        var index = 0
        var reading = false
        while index < bytes.count {
            if index + 2 < bytes.count && bytes[index] == 0x49 &&
                bytes[index + 1] == 0x02 {
                reading = true
                index += 3 // Skip 49 02 frame index.
                continue
            }
            if reading && ((48...57).contains(Int(bytes[index])) ||
                           (65...90).contains(Int(bytes[index]))) {
                data.append(bytes[index])
            }
            index += 1
        }
        guard data.count >= 17 else { return nil }
        let candidate = String(decoding: data.prefix(17), as: UTF8.self)
        return candidate.count == 17 ? candidate : nil
    }
}
