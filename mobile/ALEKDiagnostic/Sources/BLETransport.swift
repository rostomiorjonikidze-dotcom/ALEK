import Foundation
import CoreBluetooth
import Combine

struct BLEDevice: Identifiable, Equatable {
    let id: UUID
    let name: String
    let signal: Int
}

final class BLETransport: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    @Published private(set) var discovered: [BLEDevice] = []
    @Published private(set) var status = "Bluetooth მზადდება…"
    @Published private(set) var isReady = false
    @Published private(set) var isScanning = false

    var onText: ((String) -> Void)?
    var onReady: (() -> Void)?
    var onDisconnect: (() -> Void)?

    private var central: CBCentralManager!
    private var selected: CBPeripheral?
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var foundCharacteristics: [CBCharacteristic] = []
    private var outstandingServices = 0
    private var writable: CBCharacteristic?
    private var notifying: CBCharacteristic?
    private var scanRequested = false

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func scan() {
        scanRequested = true
        guard central.state == .poweredOn else {
            status = "ჩართე Bluetooth ტელეფონზე"
            return
        }
        discovered = []
        peripherals = [:]
        central.scanForPeripherals(withServices: nil,
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        isScanning = true
        status = "მოწყობილობების ძებნა…"
    }

    func stopScan() {
        scanRequested = false
        guard isScanning else { return }
        central.stopScan()
        isScanning = false
    }

    func connect(to device: BLEDevice) {
        guard let peripheral = peripherals[device.id] else {
            status = "ადაპტერი ვერ მოიძებნა — სცადე ხელახლა"
            return
        }
        stopScan()
        selected = peripheral
        writable = nil
        notifying = nil
        foundCharacteristics = []
        isReady = false
        status = "დაკავშირება: \(device.name)"
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    func disconnect() {
        if let selected { central.cancelPeripheralConnection(selected) }
    }

    @discardableResult
    func write(_ command: String) -> Bool {
        guard isReady, let selected, let writable,
              let data = (command + "\r").data(using: .ascii) else { return false }
        let type: CBCharacteristicWriteType = writable.properties.contains(.write)
            ? .withResponse : .withoutResponse
        let maxBytes = selected.maximumWriteValueLength(for: type)
        guard data.count <= maxBytes else {
            status = "ELM ბრძანება ზედმეტად გრძელია"
            return false
        }
        selected.writeValue(data, for: writable, type: type)
        return true
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            status = "Bluetooth ჩართულია"
            if scanRequested { scan() }
        case .poweredOff:
            status = "Bluetooth გამორთულია"
            isReady = false
        case .unauthorized:
            status = "Bluetooth-ზე წვდომა არ არის დაშვებული"
        default:
            status = "Bluetooth მიუწვდომელია"
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let advertised = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = advertised ?? peripheral.name ?? "BLE \(peripheral.identifier.uuidString.prefix(8))"
        peripherals[peripheral.identifier] = peripheral
        let device = BLEDevice(id: peripheral.identifier, name: name, signal: RSSI.intValue)
        if let index = discovered.firstIndex(where: { $0.id == device.id }) {
            discovered[index] = device
        } else {
            discovered.append(device)
        }
        discovered.sort { $0.signal > $1.signal }
    }

    func centralManager(_ central: CBCentralManager,
                        didConnect peripheral: CBPeripheral) {
        status = "BLE დაკავშირებულია — სერვისების ძებნა"
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral, error: Error?) {
        isReady = false
        status = "დაკავშირება ვერ მოხერხდა: \(error?.localizedDescription ?? "უცნობი შეცდომა")"
        onDisconnect?()
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        isReady = false
        writable = nil
        notifying = nil
        status = "BLE კავშირი გაწყდა"
        onDisconnect?()
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services, !services.isEmpty else {
            status = "BLE სერვისები ვერ მოიძებნა"
            return
        }
        foundCharacteristics = []
        outstandingServices = services.count
        for service in services { peripheral.discoverCharacteristics(nil, for: service) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        if error == nil { foundCharacteristics += service.characteristics ?? [] }
        outstandingServices -= 1
        guard outstandingServices <= 0 else { return }
        selectUARTCharacteristics(on: peripheral)
    }

    private func selectUARTCharacteristics(on peripheral: CBPeripheral) {
        // Nordic UART: 6E400002 write, 6E400003 notify. Several ELM BLE
        // clones use FFF1 (write) and FFF2 (notify), or expose a combined characteristic.
        func preference(_ char: CBCharacteristic, forWrite: Bool) -> Int {
            let id = char.uuid.uuidString.uppercased()
            if forWrite && id.contains("6E400002") { return 0 }
            if !forWrite && id.contains("6E400003") { return 0 }
            if forWrite && id.hasPrefix("FFF1") { return 1 }
            if !forWrite && id.hasPrefix("FFF2") { return 1 }
            if id.hasPrefix("FFF") { return 2 }
            return 9
        }

        let writeCandidates = foundCharacteristics.filter {
            $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
        }
        let notifyCandidates = foundCharacteristics.filter {
            $0.properties.contains(.notify) || $0.properties.contains(.indicate)
        }
        // Keep TX/RX on the same service. Avoid accidentally selecting
        // unrelated phone/device characteristics across BLE services.
        var candidates: [(CBCharacteristic, CBCharacteristic, Int)] = []
        for tx in writeCandidates {
            for rx in notifyCandidates where tx.service.uuid == rx.service.uuid {
                let score = preference(tx, forWrite: true) + preference(rx, forWrite: false)
                candidates.append((tx, rx, score))
            }
        }
        guard let best = candidates.min(by: { $0.2 < $1.2 }) else {
            status = "ELM BLE UART არხები ვერ მოიძებნა"
            return
        }
        writable = best.0
        notifying = best.1
        status = "BLE არხები მოიძებნა — შეტყობინებების ჩართვა"
        peripheral.setNotifyValue(true, for: best.1)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateNotificationStateFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard characteristic.uuid == notifying?.uuid else { return }
        guard error == nil, characteristic.isNotifying else {
            status = "BLE მონაცემების მიღება ვერ ჩაირთო"
            return
        }
        isReady = true
        status = "ELM327 BLE მზადაა"
        onReady?()
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard error == nil, let data = characteristic.value else { return }
        onText?(String(decoding: data, as: UTF8.self))
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        if let error { status = "BLE გაგზავნის შეცდომა: \(error.localizedDescription)" }
    }
}
