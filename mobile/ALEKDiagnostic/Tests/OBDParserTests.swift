import XCTest
@testable import ALEKDiagnosticMobile

final class OBDParserTests: XCTestCase {
    func testRPMSpaced() {
        XCTAssertEqual(OBDParser.value(forPID: "0C", in: "41 0C 1A F8\r>"), 1726)
    }

    func testRPMCompact() {
        XCTAssertEqual(OBDParser.value(forPID: "0C", in: "410C1AF8\r>"), 1726)
    }

    func testTemperatures() {
        XCTAssertEqual(OBDParser.value(forPID: "05", in: "41 05 5A\r>"), 50)
        XCTAssertEqual(OBDParser.value(forPID: "0F", in: "41 0F 28\r>"), 0)
    }

    func testMAF() {
        XCTAssertEqual(OBDParser.value(forPID: "10", in: "41 10 01 F4\r>"), 5)
    }

    func testStoredFaults() {
        let codes = OBDParser.faults("43 01 33 00 00\r>", mode: 0x03, category: "შენახული")
        XCTAssertEqual(codes.first?.code, "P0133")
    }

    func testPendingFaults() {
        let codes = OBDParser.faults("47 04 01 00 00\r>", mode: 0x07, category: "მოსალოდნელი")
        XCTAssertEqual(codes.first?.code, "P0401")
    }

    func testUnsupportedPIDHasNoFakeValue() {
        XCTAssertNil(OBDParser.value(forPID: "0C", in: "NO DATA\r>"))
    }

    func testReadinessMILAndFaultCount() {
        let state = ReadinessState.decode("41 01 82 07 A5 80\r>")
        XCTAssertEqual(state?.milOn, true)
        XCTAssertEqual(state?.reportedFaultCount, 2)
        XCTAssertEqual(state?.rawHex, "07 A5 80")
    }

    func testReadinessMissingData() {
        XCTAssertNil(ReadinessState.decode("NO DATA\r>"))
    }

    func testFreezeFrameRPM() {
        XCTAssertEqual(OBDParser.freezeValue(forPID: "0C", in: "42 0C 00 0F A0\r>"), 1000)
    }

    func testFreezeFrameEmpty() {
        XCTAssertNil(OBDParser.freezeValue(forPID: "0C", in: "NO DATA\r>"))
    }

    func testSupportedPIDBitmask() {
        // Bit 1 and bit 12 in the 0100 bitmap: PID 01 and PID 0C.
        let found = OBDParser.supportedPIDs("41 00 80 10 00 00\r>", blockPID: "00")
        XCTAssertTrue(found.contains("01"))
        XCTAssertTrue(found.contains("0C"))
        XCTAssertFalse(found.contains("05"))
    }

    func testAdditionalStandardPIDs() {
        XCTAssertEqual(OBDParser.value(forPID: "11", in: "41 11 FF\r>"), 100)
        XCTAssertEqual(OBDParser.value(forPID: "31", in: "41 31 00 64\r>"), 100)
        XCTAssertEqual(OBDParser.value(forPID: "5E", in: "41 5E 00 28\r>"), 2)
    }

    func testAdapterFirmwareFromRealResponse() {
        XCTAssertEqual(AdapterTextParser.firmware("ATI\rELM327 v1.5\r>"), "ELM327 v1.5")
    }

    func testAdapterVoltageOnlyNumeric() {
        XCTAssertEqual(AdapterTextParser.voltage("ATRV\r12.6V\r>"), 12.6)
        XCTAssertNil(AdapterTextParser.voltage("NO DATA\r>"))
    }

    func testAdapterProtocolCode() {
        XCTAssertEqual(AdapterTextParser.protocolCode("ATDPN\rA6\r>"), "A6")
        XCTAssertEqual(AdapterTextParser.protocolName("ATDP\rAUTO, ISO 15765-4 CAN (11 bit ID, 500 kbaud)\r>"),
                       "AUTO, ISO 15765-4 CAN (11 bit ID, 500 kbaud)")
    }

    func testVIN() {
        let raw = "49 02 01 31 48 47 43 4D 38 32 36 33 33 41 30 30 34 33 35 32\r>"
        XCTAssertEqual(OBDParser.vin(raw), "1HGCM82633A004352")
    }
}
