import XCTest
@testable import ALEKDiagnosticMobile

final class OEMCatalogTests: XCTestCase {
    private let dataset = """
    {"datasetName":"Test","version":"1","license":"test-only","entries":[
       {"make":"TestMake","model":"TestModel","year":"2020","engine":null,
        "ecuResponseID":"7E8","rawDTC":"030100",
        "titleKA":"Test title","explanationKA":"Test details","sourceReference":"test fixture"}
    ]}
    """

    func testExactManufacturerAndModuleMatch() throws {
        let package = try OEMCatalog.decode(Data(dataset.utf8))
        let car = VehicleProfile(id: UUID(), make: "TestMake", model: "TestModel",
                                 year: "2020", engine: "1.6", manualVIN: "")
        let fault = EnhancedFault(requestID: "7E0", responseID: "7E8",
                                  rawDTC: "030100", status: 8,
                                  statusAvailabilityMask: 255)
        XCTAssertEqual(OEMCatalog.find(fault, vehicle: car, package: package)?.titleKA,
                       "Test title")
    }

    func testNoGuessedDescriptionForOtherCarOrSubtype() throws {
        let package = try OEMCatalog.decode(Data(dataset.utf8))
        let other = VehicleProfile(id: UUID(), make: "OtherMake", model: "TestModel",
                                   year: "2020", engine: "", manualVIN: "")
        let fault = EnhancedFault(requestID: "7E0", responseID: "7E8",
                                  rawDTC: "030100", status: 0,
                                  statusAvailabilityMask: 255)
        XCTAssertNil(OEMCatalog.find(fault, vehicle: other, package: package))
        let car = VehicleProfile(id: UUID(), make: "TestMake", model: "TestModel",
                                 year: "2020", engine: "", manualVIN: "")
        let differentSubtype = EnhancedFault(requestID: "7E0", responseID: "7E8",
                                             rawDTC: "030101", status: 0,
                                             statusAvailabilityMask: 255)
        XCTAssertNil(OEMCatalog.find(differentSubtype, vehicle: car, package: package))
    }

    func testRejectUnreferencedDefinitions() {
        let incomplete = dataset.replacingOccurrences(of: "test fixture", with: "")
        XCTAssertThrowsError(try OEMCatalog.decode(Data(incomplete.utf8)))
    }

    func testNoCatalogueIsNotAValidOEMMatch() {
        let f = EnhancedFault(requestID: "7E0", responseID: "7E8",
                              rawDTC: "030100", status: 0, statusAvailabilityMask: 255)
        XCTAssertNil(OEMCatalog.find(f, vehicle: nil, package: nil))
    }
}
