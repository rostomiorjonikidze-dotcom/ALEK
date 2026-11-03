import SwiftUI
import UIKit
import Charts

struct ReportScreen: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var reportURL: URL?
    @State private var showingShare = false
    @State private var exportError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("ALEK").font(.caption).bold().tracking(4).foregroundStyle(AlekTheme.red)
                    Text("ანგარიში და ტესტები")
                        .font(.system(size: 28, weight: .bold))
                    Text("ნამდვილი ECU პასუხები • ადგილობრივი PDF")
                        .font(.subheadline).foregroundStyle(AlekTheme.muted)

                    AlekCard(title: "I/M Readiness") {
                        if let state = diagnostic.readiness {
                            HStack {
                                Label(state.milOn ? "Check Engine ანთებულია" : "Check Engine გამორთულია",
                                      systemImage: state.milOn ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                                    .foregroundStyle(state.milOn ? .orange : .green)
                                Spacer()
                            }
                            Text("ECU-ში დაფიქსირებული კოდები: \(state.reportedFaultCount)")
                                .font(.subheadline)
                            Text("მონიტორების ნედლი სტატუსი: \(state.rawHex)")
                                .font(.footnote).foregroundStyle(AlekTheme.muted)
                        } else {
                            Text("Readiness ჯერ არ არის წაკითხული")
                                .foregroundStyle(AlekTheme.muted)
                        }
                        PrimaryAction(text: "Readiness შემოწმება", icon: "checkmark.shield",
                                      disabled: !diagnostic.ecuConnected) {
                            diagnostic.refreshReadiness()
                        }
                    }

                    AlekCard(title: "Freeze Frame") {
                        if diagnostic.freezeFrame.isEmpty {
                            Text("Freeze Frame მონაცემი ჯერ არ არის წაკითხული ან ECU-მ არ დააბრუნა.")
                                .font(.footnote).foregroundStyle(AlekTheme.muted)
                        } else {
                            ForEach(OBDParser.sensors.filter { diagnostic.freezeFrame[$0.pid] != nil }) { sensor in
                                HStack {
                                    Text(sensor.label)
                                    Spacer()
                                    Text("\(diagnostic.freezeFrame[sensor.pid] ?? 0, specifier: "%.1f") \(sensor.unit)")
                                        .monospacedDigit()
                                }.font(.subheadline)
                            }
                        }
                        PrimaryAction(text: "Freeze Frame-ის წაკითხვა", icon: "camera.metering.center.weighted",
                                      disabled: !diagnostic.ecuConnected) {
                            diagnostic.loadFreezeFrame()
                        }
                    }

                    AlekCard(title: "პროფესიონალური PDF ანგარიში") {
                        Text("ქმნის ანგარიშს ECU კოდების, ბოლო მიღებული სენსორების, VIN-ისა და ტესტების შედეგებით.")
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                        PrimaryAction(text: "შექმენი PDF და გააზიარე", icon: "doc.richtext") {
                            do {
                                reportURL = try DiagnosticPDF.create(diagnostic: diagnostic)
                                showingShare = true
                            } catch {
                                exportError = error.localizedDescription
                            }
                        }
                    }
                    Text("შენიშვნა: სტანდარტული ELM327 ყველა მოდელის ABS/SRS/DPF/კოდირების ფუნქციებს ვერ უზრუნველყოფს.")
                        .font(.caption).foregroundStyle(AlekTheme.muted)
                }
                .padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .sheet(isPresented: $showingShare) {
                if let reportURL {
                    ShareActivity(items: [reportURL])
                }
            }
            .alert("PDF შეცდომა", isPresented: Binding(
                get: { exportError != nil },
                set: { if !$0 { exportError = nil } }
            )) {
                Button("კარგი", role: .cancel) { exportError = nil }
            } message: { Text(exportError ?? "") }
        }
    }
}

struct ShareActivity: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController,
                                context: Context) {}
}

struct LiveChart: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var pid = "0C"

    var body: some View {
        AlekCard(title: "ცოცხალი გრაფიკი") {
            Picker("სენსორი", selection: $pid) {
                ForEach(OBDParser.sensors) { sensor in
                    Text(sensor.label).tag(sensor.pid)
                }
            }
            .pickerStyle(.menu)
            let values = diagnostic.liveSamples.filter { $0.pid == pid }
            if values.isEmpty {
                Text("გრაფიკი გამოჩნდება ECU-ს რეალური მონაცემების მიღების შემდეგ.")
                    .font(.footnote).foregroundStyle(AlekTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 130)
            } else {
                Chart(values) { sample in
                    LineMark(
                        x: .value("დრო", sample.timestamp),
                        y: .value("მაჩვენებელი", sample.value)
                    ).foregroundStyle(AlekTheme.red)
                }
                .frame(height: 190)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 3))
                }
            }
        }
    }
}
