import Foundation
import Combine

struct ScanRecord: Identifiable, Codable {
    let id: UUID
    let date: Date
    let vin: String?
    let codes: [FaultCode]
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
    @Published private(set) var history: [ScanRecord] = []
    @Published private(set) var lastActionMessage = ""
    @Published private(set) var latestRaw = ""
    @Published private(set) var adapterStatus = AdapterStatus()
    @Published private(set) var connectionLog: [String] = []

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
                    self.faults = Array(Set(a + b + c)).sorted { $0.code < $1.code }
                    self.busy = false
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
        let record = ScanRecord(id: UUID(), date: Date(), vin: vin, codes: faults)
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
        let available = OBDParser.sensors.filter {
            supportedPIDs.isEmpty || supportedPIDs.contains($0.pid)
        }
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
