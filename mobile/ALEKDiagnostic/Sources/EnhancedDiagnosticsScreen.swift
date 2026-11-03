import SwiftUI
import UniformTypeIdentifiers

struct EnhancedDiagnosticsScreen: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var importingCatalog = false
    @State private var importError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("ALEK").font(.caption).bold().tracking(4).foregroundStyle(AlekTheme.red)
                    Text("Enhanced ECU").font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("UDS • ISO 14229 • მწარმოებლის დონის ნედლი შეცდომები")
                        .font(.subheadline).foregroundStyle(AlekTheme.muted)

                    AlekCard(title: "CAN მოდულების დიაგნოსტიკა") {
                        Text("კითხულობს 7E0–7E7 დიაპაზონის ფიზიკურ CAN მისამართებს, მხოლოდ უკვე დადასტურებულ 11-ბიტიან ISO 15765 CAN კავშირზე. ეს არ არის ყველა ავტომობილის/ყველა მოდულის უნივერსალური სკანირება.")
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                        Text(diagnostic.enhancedStatus)
                            .font(.footnote).foregroundStyle(.white)
                        HStack {
                            Text("შემოწმებული ECU")
                            Spacer()
                            Text("\(diagnostic.enhancedResults.count) / 8")
                        }.font(.caption).foregroundStyle(AlekTheme.muted)
                        PrimaryAction(text: diagnostic.enhancedScanning ? "კითხვის პროცესშია…" : "Enhanced DTC სკანირება",
                                      icon: "cpu",
                                      disabled: !diagnostic.ecuConnected || diagnostic.busy) {
                            diagnostic.scanEnhancedCAN()
                        }
                        if diagnostic.enhancedScanning {
                            Button("შეწყვიტე სკანირება") { diagnostic.cancelEnhancedCAN() }
                                .font(.subheadline).foregroundStyle(.orange)
                        }
                    }

                    AlekCard(title: "ზუსტი OEM განმარტებების კატალოგი") {
                        Text(diagnostic.oemCatalogMessage)
                            .font(.footnote).foregroundStyle(AlekTheme.muted)
                        Text("მხოლოდ მარკის, მოდელის, ECU-ის მისამართისა და მთელი 24-ბიტიანი კოდის ზუსტი დამთხვევა. მწარმოებლის განმარტება წყაროს გარეშე არ გამოიგონება.")
                            .font(.caption).foregroundStyle(AlekTheme.muted)
                        PrimaryAction(text: "OEM JSON მონაცემების იმპორტი", icon: "square.and.arrow.down") {
                            importingCatalog = true
                        }
                    }

                    if diagnostic.enhancedResults.isEmpty {
                        AlekCard(title: "ECU პასუხები") {
                            Text("სკანირების შემდეგ გამოჩნდება მხოლოდ რეალურად მიღებული პასუხები. დაუდასტურებელი მოდულები წარმატებულად არ ითვლება.")
                                .font(.footnote).foregroundStyle(AlekTheme.muted)
                        }
                    }

                    ForEach(diagnostic.enhancedResults) { module in
                        AlekCard(title: "ECU \(module.requestID) → \(module.responseID)") {
                            Text(module.state).font(.caption).foregroundStyle(AlekTheme.muted)
                            if module.faults.isEmpty {
                                Text(module.state.hasPrefix("UDS დადებითი")
                                     ? "ECU-მ დაადასტურა ცარიელი შედეგი ამ UDS მოთხოვნაზე."
                                     : "ამ ECU-ს შეცდომები ვერ დადასტურდა.")
                                    .font(.footnote).foregroundStyle(AlekTheme.muted)
                            }
                            ForEach(module.faults) { fault in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text("DTC \(fault.rawDTC)")
                                            .font(.system(.headline, design: .monospaced))
                                        Spacer()
                                        Text("0x\(String(format: "%02X", fault.status))")
                                            .font(.system(.caption, design: .monospaced))
                                            .foregroundStyle(.orange)
                                    }
                                    if !fault.tentativeSAE.isEmpty {
                                        Text("SAE ფორმატით სავარაუდოდ: \(fault.tentativeSAE)")
                                            .font(.caption).foregroundStyle(AlekTheme.muted)
                                    }
                                    ForEach(fault.statusWords, id: \.self) { word in
                                        Label(word, systemImage: "circle.fill")
                                            .font(.caption).foregroundStyle(AlekTheme.muted)
                                    }
                                    if let entry = diagnostic.exactOEMMeaning(for: fault) {
                                        Text(entry.titleKA).font(.subheadline).fontWeight(.semibold)
                                        Text(entry.explanationKA)
                                            .font(.caption).foregroundStyle(AlekTheme.muted)
                                        Text("OEM მონაცემთა წყარო: \(entry.sourceReference)")
                                            .font(.caption2).foregroundStyle(.green)
                                    } else {
                                        Text("OEM განმარტება: ამ მანქანისა და ECU-ს ზუსტი განმარტება კატალოგში არ არის. ნედლი კოდი და სტატუსი შენარჩუნებულია.")
                                            .font(.caption2).foregroundStyle(.orange)
                                    }
                                }
                                .padding(.vertical, 6)
                                Divider().overlay(.white.opacity(0.08))
                            }
                        }
                    }
                    Text("შეცდომების გაწმენდა, აქტიური ტესტები, კოდირება და ECU უსაფრთხოების განბლოკვა ამ მოდულით არ სრულდება.")
                        .font(.caption).foregroundStyle(AlekTheme.muted)
                }.padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .fileImporter(isPresented: $importingCatalog, allowedContentTypes: [.json]) { result in
                do {
                    let url = try result.get()
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    try diagnostic.importOEMCatalog(Data(contentsOf: url))
                } catch {
                    importError = error.localizedDescription
                }
            }
            .alert("OEM ფაილის შეცდომა", isPresented: Binding(
                get: { importError != nil },
                set: { if !$0 { importError = nil } }
            )) {
                Button("კარგი", role: .cancel) { importError = nil }
            } message: { Text(importError ?? "") }
        }
    }
}
