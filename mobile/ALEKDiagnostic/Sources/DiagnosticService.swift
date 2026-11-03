import Foundation
import Combine

struct ScanRecord: Identifiable, Codable {
    let id: UUID
    let date: Date
    let vin: String?
    let codes: [FaultCode]
    var vehicleName: String?
}

private struct ELMRequest {
    let command: String
    let timeoutSeconds: Double
    let completion: (String) -> Void
}

final class DiagnosticService: ObservableObject {
    let ble = BLETransport()

    @Published private(set) var connectionStatus = "შეაერთე ELM327 და აირჩიე ადაპტერი"
    @Published private(set) var ecuConnected = false
    @Published private(set) var busy = false
    @Published private(set) var vin: String?
    @Published private(set) var faults: [FaultCode] = []
    @Published private(set) var sensors: [String: Double] = [:]
    @Published var readiness: ReadinessState?
    @Published var freezeFrame: [String: Double] = [:]
    @Published var liveSamples: [LiveSample] = []
    @Published private(set) var supportedPIDs: Set<String> = []
    @Published private(set) var vehicleInfo: [String: String] = [:]
    @Published private(set) var vehicleInfoStatus = ""
    @Published private(set) var enhancedResults: [EnhancedECUResult] = []
    @Published private(set) var oemCatalog: OEMDTCPackage?
    @Published private(set) var oemCatalogMessage = "OEM კატალოგი არ არის ჩატვირთული"
    @Published private(set) var enhancedStatus = "სკანირება არ დაწყებულა"
    @Published private(set) var mode06Results: [Mode06Reading] = []
    @Published private(set) var mode06Status = "Mode 06 ჯერ არ არის წაკითხული"
    @Published private(set) var enhancedScanning = false
    private var enhancedCancelled = false
    private var enhancedTargets: [(tx: String, rx: String)] = []
    var enhancedTargetCount: Int { enhancedTargets.isEmpty ? 8 : enhancedTargets.count }
    @Published private(set) var history: [ScanRecord] = []
    @Published private(set) var lastActionMessage = ""
    @Published private(set) var latestRaw = ""
    @Published private(set) var adapterStatus = AdapterStatus()
    @Published private(set) var connectionLog: [String] = []
    @Published private(set) var profiles: [VehicleProfile] = []
    @Published private(set) var selectedVehicleID: UUID?
    var selectedVehicle: VehicleProfile? { profiles.first { $0.id == selectedVehicleID } }
    private let garageKey = "alek_diagnostic_vehicle_profiles_v1"
    private let selectionKey = "alek_diagnostic_vehicle_selected_v1"

    private var commandQueue: [ELMRequest] = []
    private var inFlight: ELMRequest?
    private var responseBuffer = ""
    private var timeoutWork: DispatchWorkItem?
    private var liveRunning = false
    private var liveIndex = 0
    private let historyKey = "alek_diagnostic_history_v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: historyKey),
           let saved = try? JSONDecoder().decode([ScanRecord].self, from: data) {
            history = saved
        }
        if let existing = try? Data(contentsOf: oemCatalogURL()),
           let catalog = try? OEMCatalog.decode(existing) {
            oemCatalog = catalog
            oemCatalogMessage = "ჩატვირთულია: (catalog.datasetName) • (catalog.entries.count) ჩანაწერი"
        }
        if let stored = UserDefaults.standard.data(forKey: garageKey),
           let decoded = try? JSONDecoder().decode([VehicleProfile].self, from: stored) {
            profiles = decoded
        }
        if let selected = UserDefaults.standard.string(forKey: selectionKey),
           let id = UUID(uuidString: selected),
           profiles.contains(where: { $0.id == id }) { selectedVehicleID = id }
        ble.onReady = { [weak self] in self?.initializeELM() }
        ble.onText = { [weak self] chunk in self?.receive(chunk) }
        ble.onDisconnect = { [weak self] in self?.handleDisconnect() }
    }

    private func handleDisconnect() {
        timeoutWork?.cancel()
        timeoutWork = nil
        inFlight = nil
        commandQueue.removeAll()
        responseBuffer = ""
        ecuConnected = false
        busy = false
        liveRunning = false
        sensors = [:]
        supportedPIDs = []
        vin = nil
        faults = []
        readiness = nil
        freezeFrame = [:]
        mode06Results = []
        mode06Status = "Mode 06 ჯერ არ არის წაკითხული"
        vehicleInfo = [:]
        vehicleInfoStatus = ""
        enhancedScanning = false
        enhancedCancelled = true
        adapterStatus = AdapterStatus()
        connectionStatus = "კავშირი გაწყვეტილია — დაუკავშირდი ხელახლა"
    }

    private func initializeELM() {
        handleDisconnect()
        busy = true
        connectionStatus = "ELM327 მზადდება…"
        note("BLE ready; starting ELM initialization")
        note(ble.channelInfo)
        // Do not infer vehicle connectivity from the Bluetooth link alone.
        request("ATZ", timeout: 7) { [weak self] _ in
            self?.request("ATE0") { [weak self] _ in
                self?.request("ATL0") { [weak self] _ in
                    self?.request("ATS0") { [weak self] _ in
                        self?.request("ATH0") { [weak self] _ in
                            self?.request("ATSP0") { [weak self] _ in
                                self?.request("0100", timeout: 12) { [weak self] response in
                                    guard let self else { return }
                                    self.applyECUHandshake(response)
                                    self.refreshAdapterInfo()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Rechecks real ECU connection without requiring disconnecting the BLE adapter.
    func retryECU() {
        guard ble.isReady, !busy else { return }
        busy = true
        connectionStatus = "ECU-თან კავშირის ხელახალი შემოწმება…"
        request("0100", timeout: 12) { [weak self] response in
            self?.applyECUHandshake(response)
            self?.refreshAdapterInfo()
        }
    }

    private func applyECUHandshake(_ response: String) {
        let bytes = OBDParser.hexBytes(response)
        let valid = bytes.indices.contains {
            bytes[$0] == 0x41 && $0 + 1 < bytes.count && bytes[$0 + 1] == 0x00
        }
        ecuConnected = valid
        busy = false
        connectionStatus = valid
            ? "ECU დაკავშირებულია — OBD-II მზადაა"
            : "Bluetooth მუშაობს, მაგრამ ECU-მ არ უპასუხა. შეამოწმე ანთება."
        if valid {
            supportedPIDs = OBDParser.supportedPIDs(response, blockPID: "00")
            fetchNextSupportedPIDBlock(after: "00")
            readVIN()
            refreshReadiness()
        }
    }

    func refreshAdapterInfo() {
        guard ble.isReady else { return }
        request("ATI") { [weak self] response in
            guard let self else { return }
            var info = self.adapterStatus
            info.version = AdapterTextParser.firmware(response)
            self.adapterStatus = info
        }
        request("ATRV") { [weak self] response in
            guard let self else { return }
            var info = self.adapterStatus
            info.voltage = AdapterTextParser.voltage(response)
            self.adapterStatus = info
        }
        request("ATDP") { [weak self] response in
            guard let self else { return }
            var info = self.adapterStatus
            info.protocolName = AdapterTextParser.protocolName(response)
            self.adapterStatus = info
        }
        request("ATDPN") { [weak self] response in
            guard let self else { return }
            var info = self.adapterStatus
            info.protocolCode = AdapterTextParser.protocolCode(response)
            self.adapterStatus = info
        }
    }

    private func oemCatalogURL() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory,
                                 in: .userDomainMask)[0].appendingPathComponent("ALEK_OEM_Catalog.json")
    }

    func importOEMCatalog(_ data: Data) throws {
        let catalog = try OEMCatalog.decode(data)
        let path = oemCatalogURL()
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try data.write(to: path, options: .atomic)
        oemCatalog = catalog
        oemCatalogMessage = "ჩატვირთულია: \(catalog.datasetName) • \(catalog.entries.count) ჩანაწერი"
    }

    func oemModuleName(responseID: String) -> String? {
        OEMCatalog.modules(for: selectedVehicle, package: oemCatalog)
            .first(where: { $0.responseID.uppercased() == responseID.uppercased() })?.name
    }

    func exactOEMMeaning(for fault: EnhancedFault) -> OEMDTCEntry? {
        OEMCatalog.find(fault, vehicle: selectedVehicle, package: oemCatalog)
    }

    func saveVehicle(_ profile: VehicleProfile) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[index] = profile
        } else {
            profiles.append(profile)
        }
        selectVehicle(profile.id)
        saveGarage()
    }

    func selectVehicle(_ id: UUID) {
        guard profiles.contains(where: { $0.id == id }) else { return }
        selectedVehicleID = id
        UserDefaults.standard.set(id.uuidString, forKey: selectionKey)
    }

    func removeVehicle(_ id: UUID) {
        profiles.removeAll { $0.id == id }
        if selectedVehicleID == id {
            selectedVehicleID = nil
            UserDefaults.standard.removeObject(forKey: selectionKey)
        }
        saveGarage()
    }

    private func saveGarage() {
        if let data = try? JSONEncoder().encode(profiles) {
            UserDefaults.standard.set(data, forKey: garageKey)
        }
    }

    private func note(_ text: String) {
        let timestamp = Date().formatted(date: .omitted, time: .standard)
        connectionLog.append("[\(timestamp)] \(text)")
        if connectionLog.count > 250 {
            connectionLog.removeFirst(connectionLog.count - 250)
        }
    }

    /// Exported only after a user taps Share. May contain VIN and ECU data.
    func exportConnectionLog() throws -> URL {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("ALEK_ELM327_Diagnostic_Log_\(Int(Date().timeIntervalSince1970)).txt")
        let prefix = "ALEK DIAGNOSTIC V8 — ELM327 BLE\n"
            + "Connection: \(connectionStatus)\n"
            + "UART: \(ble.channelInfo)\n"
            + "These records may include VIN/vehicle information.\n\n"
        try (prefix + connectionLog.joined(separator: "\n") + "\n")
            .write(to: file, atomically: true, encoding: .utf8)
        return file
    }

    func request(_ command: String, timeout: Double = 5,
                         completion: @escaping (String) -> Void) {
        commandQueue.append(ELMRequest(command: command,
                                       timeoutSeconds: timeout,
                                       completion: completion))
        processNext()
    }

    private func processNext() {
        guard inFlight == nil, ble.isReady, !commandQueue.isEmpty else { return }
        let job = commandQueue.removeFirst()
        note("TX \(job.command)")
        responseBuffer = ""
        inFlight = job
        guard ble.write(job.command) else {
            inFlight = nil
            job.completion("")
            processNext()
            return
        }
        let work = DispatchWorkItem { [weak self] in
            guard let self, let current = self.inFlight,
                  current.command == job.command else { return }
            self.finishRequest(timedOut: true)
        }
        timeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + job.timeoutSeconds, execute: work)
    }

    private func receive(_ chunk: String) {
        guard inFlight != nil else { return }
        responseBuffer += chunk
        guard responseBuffer.contains(">") else { return }
        finishRequest()
    }

    private func finishRequest(timedOut: Bool = false) {
        guard let job = inFlight else { return }
        timeoutWork?.cancel()
        timeoutWork = nil
        inFlight = nil
        let result = responseBuffer.components(separatedBy: ">").first ?? responseBuffer
        responseBuffer = ""
        latestRaw = result
        let safeResponse = String(result.prefix(1800)).replacingOccurrences(of: "\r", with: " ")
            .replacingOccurrences(of: "\n", with: " ")
        note(timedOut ? "TIMEOUT \(job.command): \(safeResponse)" : "RX \(job.command): \(safeResponse)")
        job.completion(result)
        processNext()
    }

    private func fetchNextSupportedPIDBlock(after block: String) {
        let next: String
        switch block {
        case "00": next = "20"
        case "20": next = "40"
        case "40": next = "60"
        case "60": next = "80"
        default: return
        }
        guard supportedPIDs.contains(next) else { return }
        request("01" + next, timeout: 7) { [weak self] response in
            guard let self else { return }
            self.supportedPIDs.formUnion(OBDParser.supportedPIDs(response, blockPID: next))
            self.fetchNextSupportedPIDBlock(after: next)
        }
    }

    func readVehicleInfo() {
        guard ecuConnected, !busy else { return }
        stopLive()
        busy = true
        vehicleInfo = [:]
        vehicleInfoStatus = "ECU იდენტიფიკატორების წაკითხვა…"
        let items = ["04", "06", "0A"]
        func next(_ index: Int) {
            guard index < items.count else {
                self.busy = false
                self.vehicleInfoStatus = self.vehicleInfo.isEmpty
                    ? "ამ ECU-მ Mode 09 იდენტიფიკატორები არ დააბრუნა."
                    : "Mode 09 ინფორმაცია წაკითხულია."
                return
            }
            let pid = items[index]
            self.request("09" + pid, timeout: 9) { [weak self] response in
                guard let self else { return }
                if let text = VehicleInfoParser.asciiValue(response, pid: pid), pid != "06" {
                    self.vehicleInfo[pid] = text
                } else if let raw = VehicleInfoParser.hexPayload(response, pid: pid) {
                    self.vehicleInfo[pid] = raw
                }
                next(index + 1)
            }
        }
        next(0)
    }

    /// Read-only UDS 0x19/0x02, only for confirmed 11-bit CAN. No unsafe services.
    func scanEnhancedCAN() {
        guard ecuConnected, ble.isReady, !busy else { return }
        guard UDSDTC.supportedCAN11Bit(protocolCode: adapterStatus.protocolCode,
                                        protocolName: adapterStatus.protocolName) else {
            enhancedStatus = "მხოლოდ დადასტურებულ 11-bit CAN პროტოკოლზეა ხელმისაწვდომი. ამ ადაპტერის მიმდინარე პროტოკოლი არ არის დადასტურებული."
            return
        }
        stopLive()
        busy = true
        enhancedCancelled = false
        enhancedScanning = true
        enhancedResults = []
        let supplied = OEMCatalog.modules(for: selectedVehicle, package: oemCatalog)
        enhancedTargets = supplied.isEmpty
            ? UDSDTC.requestIDs.compactMap { tx in
                UDSDTC.responseID(for: tx).map { (tx: tx, rx: $0) }
            }
            : supplied.map { (tx: $0.requestID.uppercased(), rx: $0.responseID.uppercased()) }
        enhancedStatus = supplied.isEmpty
            ? "8 სტანდარტული CAN მისამართის შემოწმება…"
            : "(supplied.count) დოკუმენტირებული ECU მოდულის შემოწმება…"
        request("ATH1", timeout: 5) { [weak self] answer in
            guard let self else { return }
            guard UDSDTC.isATOK(answer) else {
                self.finishEnhancedScan("ATH1 ვერ ჩაირთო — მარკის/ECU-ს ზუსტ პასუხს ვერ დავადასტურებთ.")
                return
            }
            self.request("ATCAF1", timeout: 5) { [weak self] reply in
                guard let self else { return }
                guard UDSDTC.isATOK(reply) else {
                    self.finishEnhancedScan("ELM-ის ISO-TP ფორმატირება მიუწვდომელია.")
                    return
                }
                self.scanEnhancedModule(index: 0)
            }
        }
    }

    func cancelEnhancedCAN() {
        guard enhancedScanning else { return }
        enhancedCancelled = true
        enhancedStatus = "სკანირების შეწყვეტა მოთხოვნილია…"
    }

    private func scanEnhancedModule(index: Int) {
        guard enhancedScanning else { return }
        guard !enhancedCancelled else {
            finishEnhancedScan("სკანირება შეწყვეტილია.")
            return
        }
        guard index < enhancedTargets.count else {
            finishEnhancedScan("Enhanced ECU სკანირება დასრულებულია. შემოწმებულია \(enhancedResults.count) მისამართი.")
            return
        }
        let target = enhancedTargets[index]
        let tx = target.tx
        let rx = target.rx
        enhancedStatus = "კითხულობს ECU \(tx) / \(rx) — \(index + 1)/\(enhancedTargets.count)"
        request("ATSH" + tx, timeout: 5) { [weak self] headerResponse in
            guard let self else { return }
            guard UDSDTC.isATOK(headerResponse) else {
                self.enhancedResults.append(EnhancedECUResult(
                    requestID: tx, responseID: rx, state: "ATSH მისამართი მიუღებელია",
                    faults: [], rawResponse: headerResponse))
                self.scanEnhancedModule(index: index + 1)
                return
            }
            self.request("ATCRA" + rx, timeout: 5) { [weak self] filterResponse in
                guard let self else { return }
                guard UDSDTC.isATOK(filterResponse) else {
                    // Without an accepted receive-address filter, results could
                    // be wrongly attributed to another ECU. Stop safely.
                    self.finishEnhancedScan("ადაპტერმა ATCRA ფილტრი არ მიიღო. ECU-ს ზუსტი იდენტიფიკაციის გარეშე სკანირება შეწყდა.")
                    return
                }
                self.request("1902FF", timeout: 9) { [weak self] response in
                    guard let self else { return }
                    switch UDSDTC.parse(_response: response, requestID: tx, responseID: rx) {
                    case .success(let faults, let available):
                        let description = String(format: "UDS დადებითი პასუხი • სტატუსის მხარდაჭერა 0x%02X", available)
                        self.enhancedResults.append(EnhancedECUResult(
                            requestID: tx, responseID: rx, state: description,
                            faults: faults, rawResponse: response))
                    case .negative(let reason):
                        self.enhancedResults.append(EnhancedECUResult(
                            requestID: tx, responseID: rx,
                            state: String(format: "UDS უარყოფითი პასუხი • NRC 0x%02X", reason),
                            faults: [], rawResponse: response))
                    case .invalid:
                        self.enhancedResults.append(EnhancedECUResult(
                            requestID: tx, responseID: rx,
                            state: "UDS პასუხი არ მივიღეთ ან ვერ გაიშიფრა",
                            faults: [], rawResponse: response))
                    }
                    self.scanEnhancedModule(index: index + 1)
                }
            }
        }
    }

    private func finishEnhancedScan(_ message: String) {
        enhancedScanning = false
        enhancedStatus = message
        if !ble.isReady {
            busy = false
            return
        }
        // Restore functional OBD addressing before any subsequent regular scans.
        request("ATCRA", timeout: 5) { [weak self] _ in
            self?.request("ATSH7DF", timeout: 5) { [weak self] _ in
                self?.request("ATH0", timeout: 5) { [weak self] _ in
                    self?.busy = false
                }
            }
        }
    }

    /// Read-only Mode 06 ECU monitors from the supported MID bitmap.
    func scanMode06() {
        guard ecuConnected, !busy else { return }
        stopLive()
        busy = true
        mode06Results = []
        mode06Status = "Mode 06 მონიტორების ძებნა…"
        var supported = Set<String>()

        func readBitmap(_ block: String) {
            request("06" + block, timeout: 8) { [weak self] response in
                guard let self else { return }
                let found = Mode06Parser.supported(response, block: block)
                supported.formUnion(found)
                let next = (UInt8(block, radix: 16).map { Int($0) + 32 } ?? 256)
                let nextHex = String(format: "%02X", next)
                if next <= 0xE0 && found.contains(nextHex) {
                    readBitmap(nextHex)
                } else {
                    self.readMode06MIDs(Array(supported).sorted())
                }
            }
        }
        readBitmap("00")
    }

    private func readMode06MIDs(_ mids: [String]) {
        let blocks: Set<String> = ["20", "40", "60", "80", "A0", "C0", "E0"]
        let queue = Array(mids.filter { !blocks.contains($0) }.prefix(64))
        guard !queue.isEmpty else {
            busy = false
            mode06Status = "ECU-მ Mode 06 მონიტორების სია არ დააბრუნა."
            return
        }
        func next(_ index: Int) {
            guard index < queue.count else {
                self.busy = false
                self.mode06Status = "Mode 06 დასრულდა: \(self.mode06Results.count) რეალური MID პასუხი."
                return
            }
            let mid = queue[index]
            self.mode06Status = "Mode 06 MID \(mid): \(index + 1) / \(queue.count)"
            self.request("06" + mid, timeout: 7) { [weak self] response in
                guard let self else { return }
                if let reading = Mode06Parser.read(response, mid: mid) {
                    self.mode06Results.append(reading)
                }
                next(index + 1)
            }
        }
        next(0)
    }

    func readVIN() {
        guard ecuConnected else { return }
        request("0902", timeout: 8) { [weak self] response in
            self?.vin = OBDParser.vin(response)
        }
    }

    func scanEngine() {
        guard ecuConnected else { return }
        stopLive()
        busy = true
        faults = []
        lastActionMessage = "ძრავის შეცდომების წაკითხვა…"

        request("03", timeout: 9) { [weak self] stored in
            guard let self else { return }
            let a = OBDParser.faults(stored, mode: 0x03, category: "შენახული")
            self.request("07", timeout: 9) { [weak self] pending in
                guard let self else { return }
                let b = OBDParser.faults(pending, mode: 0x07, category: "მოსალოდნელი")
                self.request("0A", timeout: 9) { [weak self] permanent in
                    guard let self else { return }
                    let c = OBDParser.faults(permanent, mode: 0x0A, category: "მუდმივი")
                    let replies = [stored, pending, permanent]
                    let valid = replies.contains { $0.uppercased().contains("NO DATA") } ||
                        ELMResponse.hasPositiveResponse(stored, mode: 0x03) ||
                        ELMResponse.hasPositiveResponse(pending, mode: 0x07) ||
                        ELMResponse.hasPositiveResponse(permanent, mode: 0x0A)
                    self.busy = false
                    guard valid else {
                        self.lastActionMessage = "ECU-მ შეცდომების მოთხოვნას დამაჯერებელი პასუხი არ დაუბრუნა."
                        return
                    }
                    self.faults = Array(Set(a + b + c)).sorted { $0.code < $1.code }
                    self.lastActionMessage = self.faults.isEmpty
                        ? "შეცდომა არ დაბრუნებულა — დარწმუნდი, რომ ECU პასუხობს"
                        : "ნაპოვნია \(self.faults.count) კოდი"
                    self.addHistory()
                    self.refreshReadiness()
                }
            }
        }
    }

    private func addHistory() {
        let record = ScanRecord(id: UUID(), date: Date(), vin: vin, codes: faults,
                                vehicleName: selectedVehicle?.title)
        history.insert(record, at: 0)
        history = Array(history.prefix(100))
        if let data = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(data, forKey: historyKey)
        }
    }

    // The caller MUST show user confirmation before this function.
    func clearEngineCodes() {
        guard ecuConnected, !busy else { return }
        stopLive()
        busy = true
        request("04", timeout: 10) { [weak self] response in
            guard let self else { return }
            self.busy = false
            self.lastActionMessage = OBDParser.hexBytes(response).contains(0x44)
                ? "ECU-მ შეცდომების განულება დაადასტურა — გადაამოწმე ხელახლა"
                : "განულება არ დადასტურდა. შეცდომები შესაძლოა დარჩა."
        }
    }

    func startLive() {
        guard ecuConnected, !liveRunning, !busy else { return }
        liveRunning = true
        liveIndex = 0
        pollNext()
    }

    func stopLive() {
        liveRunning = false
        // Current read is allowed to finish; no further polls will be scheduled.
    }

    private func pollNext() {
        guard liveRunning, ecuConnected else { return }
        let available = OBDParser.sensors.filter { supportedPIDs.contains($0.pid) }
        guard !available.isEmpty else { liveRunning = false; return }
        let definition = available[liveIndex % available.count]
        liveIndex += 1
        request("01" + definition.pid, timeout: 5) { [weak self] response in
            guard let self else { return }
            if let value = OBDParser.value(forPID: definition.pid, in: response) {
                self.sensors[definition.pid] = value
                self.liveSamples.append(LiveSample(timestamp: Date(), pid: definition.pid, value: value))
                if self.liveSamples.count > 1400 {
                    self.liveSamples.removeFirst(self.liveSamples.count - 1400)
                }
            }
            // Unsupported PIDs deliberately stay absent (shown as —).
            guard self.liveRunning else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.pollNext()
            }
        }
    }

    func formattedValue(for definition: SensorDefinition) -> String {
        guard let value = sensors[definition.pid] else { return "—" }
        return value.rounded() == value
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }
}
