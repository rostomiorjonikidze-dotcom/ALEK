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
    @Published private(set) var history: [ScanRecord] = []
    @Published private(set) var lastActionMessage = ""
    @Published private(set) var latestRaw = ""

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
        connectionStatus = "კავშირი გაწყვეტილია — დაუკავშირდი ხელახლა"
    }

    private func initializeELM() {
        handleDisconnect()
        connectionStatus = "ELM327 მზადდება…"
        // Do not infer vehicle connectivity from the Bluetooth link alone.
        request("ATZ", timeout: 7) { [weak self] _ in
            self?.request("ATE0") { [weak self] _ in
                self?.request("ATL0") { [weak self] _ in
                    self?.request("ATS0") { [weak self] _ in
                        self?.request("ATH0") { [weak self] _ in
                            self?.request("ATSP0") { [weak self] _ in
                                self?.request("0100", timeout: 12) { [weak self] response in
                                    guard let self else { return }
                                    let bytes = OBDParser.hexBytes(response)
                                    let valid = bytes.indices.contains {
                                        bytes[$0] == 0x41 && $0 + 1 < bytes.count &&
                                        bytes[$0 + 1] == 0x00
                                    }
                                    self.ecuConnected = valid
                                    self.connectionStatus = valid
                                        ? "ECU დაკავშირებულია — OBD-II მზადაა"
                                        : "Bluetooth მუშაობს, მაგრამ ECU-მ არ უპასუხა"
                                    if valid { self.readVIN() }
                                }
                            }
                        }
                    }
                }
            }
        }
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
            self.finishRequest()
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

    private func finishRequest() {
        guard let job = inFlight else { return }
        timeoutWork?.cancel()
        timeoutWork = nil
        inFlight = nil
        let result = responseBuffer.components(separatedBy: ">").first ?? responseBuffer
        responseBuffer = ""
        latestRaw = result
        job.completion(result)
        processNext()
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
        let definition = OBDParser.sensors[liveIndex % OBDParser.sensors.count]
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
