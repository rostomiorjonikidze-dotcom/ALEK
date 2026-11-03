import SwiftUI

private struct ScreenHeading: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("ALEK").font(.caption).bold().tracking(4).foregroundStyle(AlekTheme.red)
            Text(title).font(.system(size: 29, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(subtitle).font(.subheadline).foregroundStyle(AlekTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 8)
    }
}

struct HomeScreen: View {
    @ObservedObject var diagnostic: DiagnosticService

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeading(title: "DIAGNOSTIC V8",
                                  subtitle: "მობილური დიაგნოსტიკა • ELM327 BLE")

                    AlekCard(title: "კავშირის მდგომარეობა") {
                        HStack(spacing: 10) {
                            Image(systemName: diagnostic.ecuConnected
                                  ? "checkmark.circle.fill" : "circle.dotted")
                                .foregroundStyle(diagnostic.ecuConnected ? .green : AlekTheme.red)
                            Text(diagnostic.connectionStatus)
                                .font(.subheadline).foregroundStyle(.white)
                        }
                        if let vin = diagnostic.vin {
                            LabeledContent("VIN", value: vin)
                                .font(.caption).foregroundStyle(AlekTheme.muted)
                        }
                    }

                    AdapterPanel(ble: diagnostic.ble)

                    if diagnostic.ble.isReady {
                        AlekCard(title: "ELM327-ის რეალური მონაცემები") {
                            LabeledContent("ადაპტერი", value: diagnostic.adapterStatus.version ?? "—")
                            LabeledContent("OBD პროტოკოლი", value: diagnostic.adapterStatus.protocolName ?? "—")
                            LabeledContent("პროტოკოლის კოდი", value: diagnostic.adapterStatus.protocolCode ?? "—")
                            LabeledContent("ძაბვა", value: diagnostic.adapterStatus.voltage.map {
                                String(format: "%.1f V", $0)
                            } ?? "—")
                            LabeledContent("ხელმისაწვდომი PID", value: "\(diagnostic.supportedPIDs.count)")
                            PrimaryAction(text: "ადაპტერის მონაცემების განახლება",
                                          icon: "arrow.clockwise") {
                                diagnostic.refreshAdapterInfo()
                            }
                            if !diagnostic.ecuConnected {
                                PrimaryAction(text: "ECU კავშირის ხელახალი შემოწმება",
                                              icon: "waveform.path.ecg",
                                              disabled: diagnostic.busy) {
                                    diagnostic.retryECU()
                                }
                            }
                        }
                    }

                    AlekCard(title: "სწრაფი დიაგნოსტიკა") {
                        PrimaryAction(text: diagnostic.busy ? "მიმდინარეობს…" : "ძრავის სკანირება",
                                      icon: "stethoscope",
                                      disabled: !diagnostic.ecuConnected || diagnostic.busy) {
                            diagnostic.scanEngine()
                        }
                        PrimaryAction(text: "VIN-ის წაკითხვა", icon: "barcode.viewfinder",
                                      disabled: !diagnostic.ecuConnected) {
                            diagnostic.readVIN()
                        }
                        if !diagnostic.lastActionMessage.isEmpty {
                            Text(diagnostic.lastActionMessage)
                                .font(.footnote).foregroundStyle(AlekTheme.muted)
                        }
                    }

                    AlekCard(title: "პროგრამის შესაძლებლობები") {
                        FeatureRow(icon: "checkmark.shield", title: "OBD-II ძრავის კოდები",
                                   subtitle: "შენახული • მოსალოდნელი • მუდმივი")
                        Divider().overlay(.white.opacity(0.1))
                        FeatureRow(icon: "waveform.path.ecg", title: "ცოცხალი მონაცემები",
                                   subtitle: "RPM • MAF • MAP • ტემპერატურა")
                        Divider().overlay(.white.opacity(0.1))
                        FeatureRow(icon: "clock", title: "დიაგნოსტიკის ისტორია",
                                   subtitle: "ინახება ტელეფონზე")
                    }

                    Text("ABS, Airbag, კოდირება და DPF რეგენერაცია ამ ვერსიაში ჯერ არ არის ჩართული.")
                        .font(.caption).foregroundStyle(AlekTheme.muted)
                }
                .padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
}

private struct AdapterPanel: View {
    @ObservedObject var ble: BLETransport
    @State private var showingDevices = false

    var body: some View {
        AlekCard(title: "ELM327 / Bluetooth LE") {
            Label(ble.status, systemImage: "bluetooth")
                .font(.subheadline).foregroundStyle(AlekTheme.muted)
            HStack(spacing: 10) {
                PrimaryAction(text: ble.isScanning ? "მოწყობილობების ძებნა…" : "მოძებნე ადაპტერი",
                              icon: "antenna.radiowaves.left.and.right") {
                    ble.scan()
                    showingDevices = true
                }
                if ble.isReady {
                    Button("გათიშვა") { ble.disconnect() }
                        .font(.caption).foregroundStyle(.white)
                }
            }
        }
        .sheet(isPresented: $showingDevices) {
            NavigationStack {
                List {
                    Section("აირჩიე შენი OBDII ადაპტერი") {
                        ForEach(ble.discovered.prefix(20)) { device in
                            Button {
                                ble.connect(to: device)
                                showingDevices = false
                            } label: {
                                HStack {
                                    Image(systemName: "bluetooth")
                                    VStack(alignment: .leading) {
                                        Text(device.name).fontWeight(.semibold)
                                        Text(device.id.uuidString)
                                            .font(.caption2).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("\(device.signal) dBm")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                        if ble.discovered.isEmpty {
                            Text("მოწყობილობები ჯერ არ ჩანს. ჩართე ანთება და შეამოწმე ადაპტერი.")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .navigationTitle("Bluetooth BLE")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("დახურვა") { ble.stopScan(); showingDevices = false }
                    }
                }
            }
            .onDisappear { ble.stopScan() }
        }
    }
}

private struct FeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 36, height: 36)
                .background(AlekTheme.red.opacity(0.13),
                            in: RoundedRectangle(cornerRadius: 9))
                .foregroundStyle(AlekTheme.red)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline).fontWeight(.semibold)
                Text(subtitle).font(.caption).foregroundStyle(AlekTheme.muted)
            }
            Spacer()
        }
    }
}

struct FaultScreen: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var showingConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeading(title: "შეცდომების კოდები",
                                  subtitle: "OBD-II • ძრავის ECU")
                    AlekCard(title: "DTC სკანირება") {
                        PrimaryAction(text: "წაიკითხე შეცდომები", icon: "magnifyingglass",
                                      disabled: !diagnostic.ecuConnected || diagnostic.busy) {
                            diagnostic.scanEngine()
                        }
                        Text(diagnostic.lastActionMessage.isEmpty
                             ? "დაკავშირებული ECU-დან წაიკითხე კოდები."
                             : diagnostic.lastActionMessage)
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                    }

                    if !diagnostic.faults.isEmpty {
                        ForEach(diagnostic.faults) { fault in
                            AlekCard(title: fault.code) {
                                HStack {
                                    Label(fault.category, systemImage: "exclamationmark.triangle.fill")
                                        .foregroundStyle(.orange)
                                    Spacer()
                                    Text("OBD-II").font(.caption).foregroundStyle(AlekTheme.muted)
                                }
                                Text("კოდი მიღებულია ECU-დან. მიზეზი გადაამოწმე ავტომობილის შესაბამის ტექნიკურ დოკუმენტაციაში.")
                                    .font(.footnote).foregroundStyle(AlekTheme.muted)
                            }
                        }
                    }

                    AlekCard(title: "ECU შეცდომების განულება") {
                        Text("განულება წაშლის პრობლემის დიაგნოსტიკურ მტკიცებულებებს და გადააყენებს ემისიის მზადყოფნის მონიტორებს. ჯერ შეინახე შედეგები.")
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                        Button(role: .destructive) { showingConfirmation = true } label: {
                            Label("Check Engine კოდების განულება", systemImage: "trash")
                                .fontWeight(.semibold)
                        }
                        .disabled(!diagnostic.ecuConnected || diagnostic.busy)
                    }
                }
                .padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .alert("ნამდვილად გინდა კოდების წაშლა?", isPresented: $showingConfirmation) {
                Button("გაუქმება", role: .cancel) {}
                Button("წაშალე", role: .destructive) { diagnostic.clearEngineCodes() }
            } message: {
                Text("ეს არ ასწორებს ავტომობილის პრობლემას. შეიძლება წაიშალოს Freeze Frame და I/M Readiness-ის მდგომარეობა.")
            }
        }
    }
}

struct LiveScreen: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var csvURL: URL?
    @State private var showCSVShare = false
    @State private var csvError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeading(title: "Live Data",
                                  subtitle: "მონაცემები რეალური ECU-დან")
                    HStack(spacing: 10) {
                        Image(systemName: diagnostic.ecuConnected
                              ? "circle.fill" : "circle.slash")
                            .foregroundStyle(diagnostic.ecuConnected ? .green : .orange)
                        Text(diagnostic.ecuConnected
                             ? "ECU ONLINE" : "დაკავშირება არ არის")
                            .font(.caption).fontWeight(.bold).tracking(1)
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                              spacing: 12) {
                        ForEach(OBDParser.sensors) { sensor in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(sensor.label)
                                    .font(.caption).foregroundStyle(AlekTheme.muted)
                                    .lineLimit(2)
                                    .frame(height: 34, alignment: .topLeading)
                                Text(diagnostic.formattedValue(for: sensor))
                                    .font(.system(size: 29, weight: .bold, design: .rounded))
                                    .contentTransition(.numericText())
                                Text(sensor.unit).font(.caption2)
                                    .foregroundStyle(AlekTheme.red)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(15)
                            .background(AlekTheme.panel,
                                        in: RoundedRectangle(cornerRadius: 16))
                        }
                    }
                    LiveChart(diagnostic: diagnostic)
                    AlekCard(title: "მონაცემების ექსპორტი") {
                        Text("შენახული რეალური გაზომვების CSV — სახელოსნოში ან Excel-ში გასახსნელად.")
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                        PrimaryAction(text: "CSV ფაილის გაზიარება", icon: "square.and.arrow.up",
                                      disabled: diagnostic.liveSamples.isEmpty) {
                            do {
                                csvURL = try TelemetryCSV.create(samples: diagnostic.liveSamples)
                                showCSVShare = true
                            } catch { csvError = error.localizedDescription }
                        }
                    }
                    Text("ტირეთი (—) აღნიშნულია სენსორი, რომლის მონაცემიც ECU-ს ჯერ არ დაუბრუნებია. ეს მნიშვნელობები არ არის სიმულირებული.")
                        .font(.caption).foregroundStyle(AlekTheme.muted)
                }
                .padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .onAppear { diagnostic.startLive() }
            .onDisappear { diagnostic.stopLive() }
            .sheet(isPresented: $showCSVShare) {
                if let csvURL { ShareActivity(items: [csvURL]) }
            }
            .alert("CSV შეცდომა", isPresented: Binding(
                get: { csvError != nil },
                set: { if !$0 { csvError = nil } }
            )) {
                Button("კარგი", role: .cancel) { csvError = nil }
            } message: { Text(csvError ?? "") }
        }
    }
}

struct HistoryScreen: View {
    @ObservedObject var diagnostic: DiagnosticService

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeading(title: "ისტორია",
                                  subtitle: "შენახული დიაგნოსტიკური სკანირებები")
                    if diagnostic.history.isEmpty {
                        AlekCard(title: "ჩანაწერები ჯერ არ არის") {
                            Text("სკანირების დასრულების შემდეგ აქ გამოჩნდება მანქანის შეცდომების ისტორია.")
                                .font(.subheadline).foregroundStyle(AlekTheme.muted)
                        }
                    }
                    ForEach(diagnostic.history) { record in
                        AlekCard(title: record.date.formatted(date: .abbreviated,
                                                               time: .shortened)) {
                            if let vin = record.vin {
                                Text(vin).font(.caption).foregroundStyle(AlekTheme.muted)
                            }
                            Text("კოდები: \(record.codes.count)")
                                .fontWeight(.medium)
                            ForEach(record.codes) { code in
                                HStack {
                                    Text(code.code).font(.system(.body, design: .monospaced))
                                    Spacer()
                                    Text(code.category).font(.caption)
                                        .foregroundStyle(AlekTheme.muted)
                                }
                            }
                        }
                    }
                }
                .padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
}
