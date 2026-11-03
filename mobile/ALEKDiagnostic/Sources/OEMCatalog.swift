import Foundation

struct OEMDTCEntry: Codable, Identifiable {
    let make: String
    let model: String
    let year: String?
    let engine: String?
    let ecuResponseID: String
    let rawDTC: String
    let titleKA: String
    let explanationKA: String
    let sourceReference: String

    var id: String { "\(make)|\(model)|\(ecuResponseID)|\(rawDTC)|\(year ?? "")|\(engine ?? "")" }
}

struct OEMDTCPackage: Codable {
    let datasetName: String
    let version: String
    let license: String
    let entries: [OEMDTCEntry]
}

enum OEMCatalogError: LocalizedError {
    case tooLarge, invalid(String)
    var errorDescription: String? {
        switch self {
        case .tooLarge: return "OEM მონაცემების ფაილი 5 MB-ზე დიდია."
        case .invalid(let reason): return "OEM ფაილის შეცდომა: \(reason)"
        }
    }
}

enum OEMCatalog {
    private static func clean(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func decode(_ data: Data) throws -> OEMDTCPackage {
        guard data.count <= 5_000_000 else { throw OEMCatalogError.tooLarge }
        let package = try JSONDecoder().decode(OEMDTCPackage.self, from: data)
        guard !clean(package.datasetName).isEmpty,
              !clean(package.license).isEmpty else {
            throw OEMCatalogError.invalid("საჭიროა datasetName და license")
        }
        guard !package.entries.isEmpty, package.entries.count <= 50_000 else {
            throw OEMCatalogError.invalid("ჩანაწერების რაოდენობა არასწორია")
        }
        for item in package.entries {
            let raw = item.rawDTC.uppercased()
            let header = item.ecuResponseID.uppercased()
            guard raw.count == 6 && raw.allSatisfy({ $0.isHexDigit }),
                  header.count == 3 && header.allSatisfy({ $0.isHexDigit }),
                  !clean(item.make).isEmpty, !clean(item.model).isEmpty,
                  !clean(item.titleKA).isEmpty, !clean(item.sourceReference).isEmpty else {
                throw OEMCatalogError.invalid("კოდს სჭირდება 6 hex ნიშანი, ECU-ს 3 hex, მარკა/მოდელი და ზუსტი წყარო")
            }
        }
        return package
    }

    /// A match requires exact manufacturer/model, ECU response address,
    /// all 3 bytes of DTC (including subtype) and any specified year/engine.
    /// No generic P-code fallback is permitted.
    static func find(_ fault: EnhancedFault, vehicle: VehicleProfile?,
                     package: OEMDTCPackage?) -> OEMDTCEntry? {
        guard let vehicle, let package else { return nil }
        return package.entries.first { item in
            clean(item.make) == clean(vehicle.make) &&
            clean(item.model) == clean(vehicle.model) &&
            clean(item.ecuResponseID) == clean(fault.responseID) &&
            clean(item.rawDTC) == clean(fault.rawDTC) &&
            (item.year.map { clean($0) == clean(vehicle.year) } ?? true) &&
            (item.engine.map { clean($0) == clean(vehicle.engine) } ?? true)
        }
    }
}
