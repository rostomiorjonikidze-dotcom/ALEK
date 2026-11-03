import Foundation

enum TelemetryCSV {
    static func create(samples: [LiveSample]) throws -> URL {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(
            "ALEK_OBD_LiveData_\(Int(Date().timeIntervalSince1970)).csv"
        )
        var rows = ["timestamp_utc,pid,description,value,unit"]
        let posix = ISO8601DateFormatter()
        posix.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        for sample in samples {
            guard let definition = OBDParser.sensors.first(where: { $0.pid == sample.pid }) else {
                continue
            }
            let name = definition.label.replacingOccurrences(of: "\"", with: "\"\"")
            rows.append("\(posix.string(from: sample.timestamp)),\(sample.pid),\"\(name)\",\(sample.value),\(definition.unit)")
        }
        try rows.joined(separator: "\n").appending("\n")
            .write(to: file, atomically: true, encoding: .utf8)
        return file
    }
}
