import XCTest
@testable import ALEKDiagnosticMobile

final class Mode06Tests: XCTestCase {
    func testSupportedMonitorBits() {
        XCTAssertEqual(Mode06Parser.supported("46 00 80 00 00 01\r>", block: "00"),
                       Set(["01", "20"]))
    }
    func testRawMonitorFields() throws {
        let r = try XCTUnwrap(Mode06Parser.read(
            "46 01 01 02 00 64 00 32 00 96\r>", mid: "01"))
        XCTAssertEqual(r.tests.count, 1)
        XCTAssertEqual(r.tests[0].value, 100)
        XCTAssertEqual(r.tests[0].minimum, 50)
        XCTAssertEqual(r.tests[0].maximum, 150)
    }
    func testEmptyResponseIsNotPassingResult() {
        XCTAssertNil(Mode06Parser.read("NO DATA\r>", mid: "01"))
    }
    func testNonStandardMonitorRemainsRaw() throws {
        let r = try XCTUnwrap(Mode06Parser.read("46 21 AA BB CC\r>", mid: "21"))
        XCTAssertEqual(r.rawHex, "AA BB CC")
        XCTAssertTrue(r.tests.isEmpty)
    }
}
