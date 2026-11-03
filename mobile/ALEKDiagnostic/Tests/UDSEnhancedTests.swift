import XCTest
@testable import ALEKDiagnosticMobile

final class UDSEnhancedTests: XCTestCase {
    func testSingleFrameWithCANHeaderAndTwoWordCode() {
        let reply = "7E8 07 59 02 FF 03 01 00 AF\r>"
        let parsed = UDSDTC.parse(reply, requestID: "7E0")
        if case .success(let faults, let available) = parsed {
            XCTAssertEqual(available, 0xFF)
            XCTAssertEqual(faults.count, 1)
            XCTAssertEqual(faults.first?.rawDTC, "030100")
            XCTAssertEqual(faults.first?.responseID, "7E8")
            XCTAssertEqual(faults.first?.status, 0xAF)
            XCTAssertEqual(faults.first?.tentativeSAE, "P0301-00")
            XCTAssertTrue(faults[0].statusWords.contains("დადასტურებული"))
        } else { XCTFail("Expected positive UDS response") }
    }

    func testNegativeResponseDoesNotInventCodes() {
        let reply = "7E8 03 7F 19 11 00 00 00\r>"
        if case .negative(let nrc) = UDSDTC.parse(reply, requestID: "7E0") {
            XCTAssertEqual(nrc, 0x11)
        } else { XCTFail("Expected negative reply") }
    }

    func testNoDataIsInvalidNotNoFaults() {
        if case .invalid = UDSDTC.parse("NO DATA\r>", requestID: "7E0") {}
        else { XCTFail("NO DATA must not be interpreted as a clean ECU") }
    }

    func testMultiFrameUDSResponse() {
        let reply = "7E8 10 0B 59 02 FF 03 01 00\r" +
                    "7E8 21 AF 04 01 00 08 00 00\r>"
        if case .success(let faults, _) = UDSDTC.parse(reply, requestID: "7E0") {
            XCTAssertEqual(faults.count, 2)
            XCTAssertEqual(faults[0].rawDTC, "030100")
            XCTAssertEqual(faults[1].rawDTC, "040100")
        } else { XCTFail("Expected two fault records") }
    }

    func testRejectTruncatedDTCRecord() {
        if case .invalid = UDSDTC.parse("59 02 FF 03 01 00\r>", requestID: "7E0") {}
        else { XCTFail("Truncated record must not be considered fault-free") }
    }

    func testValidEmptyResponse() {
        if case .success(let faults, _) = UDSDTC.parse("59 02 FF\r>", requestID: "7E0") {
            XCTAssertTrue(faults.isEmpty)
        } else { XCTFail("Expected valid empty response") }
    }

    func testProtocolGuard() {
        XCTAssertTrue(UDSDTC.supportedCAN11Bit(protocolCode: "A6", protocolName: nil))
        XCTAssertTrue(UDSDTC.supportedCAN11Bit(protocolCode: "8", protocolName: nil))
        XCTAssertFalse(UDSDTC.supportedCAN11Bit(protocolCode: "A7", protocolName: nil))
        XCTAssertFalse(UDSDTC.supportedCAN11Bit(protocolCode: nil, protocolName: nil))
    }

    func testAddresses() {
        XCTAssertEqual(UDSDTC.responseID(for: "7E0"), "7E8")
        XCTAssertEqual(UDSDTC.responseID(for: "7E7"), "7EF")
        XCTAssertNil(UDSDTC.responseID(for: "742"))
    }
}
