import XCTest
@testable import ALEKDiagnosticMobile

final class ELMResponseTests: XCTestCase {
    func testCAN11BitHeaderAndDLC() {
        let response = "7E8 04 41 0C 1A F8 00 00 00\r>"
        XCTAssertEqual(OBDParser.value(forPID: "0C", in: response), 1726)
    }

    func testCAN29BitHeader() {
        let response = "18DAF110 04 41 0C 0F A0 00 00 00\r>"
        XCTAssertEqual(OBDParser.value(forPID: "0C", in: response), 1000)
    }

    func testCANISOFirstAndConsecutiveFramesVIN() {
        let response = "7E8 10 14 49 02 01 31 48 47\r" +
            "7E8 21 43 4D 38 32 36 33 33\r" +
            "7E8 22 41 30 30 34 33 35 32\r>"
        XCTAssertEqual(OBDParser.vin(response), "1HGCM82633A004352")
    }

    func testNoDataAndEchoAreNotHex() {
        XCTAssertEqual(OBDParser.hexBytes("010C\rSEARCHING...\rNO DATA\r>"), [])
    }

    func testMultiVINFrameNumberPrefixes() {
        let response = "0: 49 02 01 31 48 47 43 4D 38\r" +
            "1: 49 02 02 32 36 33 33 41 30 30 34 33 35 32\r>"
        XCTAssertEqual(OBDParser.vin(response), "1HGCM82633A004352")
    }

    func testVehicleProfileRoundTrip() throws {
        let old = VehicleProfile(id: UUID(), make: "Alfa Romeo",
                                 model: "GT", year: "2005", engine: "1.9 JTD",
                                 manualVIN: "")
        let saved = try JSONEncoder().encode(old)
        XCTAssertEqual(try JSONDecoder().decode(VehicleProfile.self, from: saved), old)
    }

    func testOldScanRecordDecodesWithoutVehicleName() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","date":0,"vin":null,"codes":[]}"#
        let record = try JSONDecoder().decode(ScanRecord.self, from: Data(json.utf8))
        XCTAssertNil(record.vehicleName)
    }
}
