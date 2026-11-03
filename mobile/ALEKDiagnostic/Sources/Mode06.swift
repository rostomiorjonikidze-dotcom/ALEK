import Foundation

/// Read-only SAE J1979 Mode 06 raw monitoring.
/// Never infer pass/fail without verified manufacturer scaling.
struct Mode06Test: Identifiable {
    let tid: UInt8
    let cid: UInt8
    let value: UInt16
    let minimum: UInt16
    let maximum: UInt16
    var id: String { String(format: "%02X-%02X", tid, cid) }
    var display: String {
        String(format: "TID %02X / CID %02X • Value %04X • Min %04X • Max %04X",
               tid, cid, Int(value), Int(minimum), Int(maximum))
    }
}
struct Mode06Reading: Identifiable {
    let mid: String
    let rawHex: String
    let tests: [Mode06Test]
    var id: String { mid }
}
enum Mode06Parser {
    static func supported(_ response: String, block: String) -> Set<String> {
        guard let base = UInt8(block, radix: 16) else { return [] }
        let bytes = ELMResponse.bytes(response)
        guard let i = bytes.indices.first(where: {
            bytes[$0] == 0x46 && $0 + 5 < bytes.count && bytes[$0 + 1] == base
        }) else { return [] }
        var found = Set<String>()
        for n in 0..<32 {
            let mask: UInt8 = 1 << (7 - n % 8)
            if bytes[i + 2 + n / 8] & mask != 0 {
                found.insert(String(format: "%02X", Int(base) + n + 1))
            }
        }
        return found
    }

    static func read(_ response: String, mid: String) -> Mode06Reading? {
        guard let code = UInt8(mid, radix: 16) else { return nil }
        let bytes = ELMResponse.bytes(response)
        guard let i = bytes.indices.first(where: {
            bytes[$0] == 0x46 && $0 + 1 < bytes.count && bytes[$0 + 1] == code
        }) else { return nil }
        let body = Array(bytes.dropFirst(i + 2))
        guard !body.isEmpty else { return nil }
        let raw = body.prefix(256).map { String(format: "%02X", $0) }.joined(separator: " ")
        var results: [Mode06Test] = []
        if body.count <= 256 && body.count.isMultiple(of: 8) {
            for index in stride(from: 0, to: body.count, by: 8) {
                let b = body
                results.append(Mode06Test(
                    tid: b[index], cid: b[index + 1],
                    value: UInt16(b[index + 2]) << 8 | UInt16(b[index + 3]),
                    minimum: UInt16(b[index + 4]) << 8 | UInt16(b[index + 5]),
                    maximum: UInt16(b[index + 6]) << 8 | UInt16(b[index + 7])
                ))
            }
        }
        return Mode06Reading(mid: mid, rawHex: raw, tests: results)
    }
}
