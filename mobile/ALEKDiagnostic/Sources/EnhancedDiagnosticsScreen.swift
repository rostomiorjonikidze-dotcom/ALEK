import SwiftUI

struct EnhancedDiagnosticsScreen: View {
    @ObservedObject var diagnostic: DiagnosticService

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
                                Text("დადასტურებული შეცდომები არ დაბრუნებულა ამ UDS მოთხოვნაზე.")
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
                                    Text("OEM განმარტება: არ არის დადასტურებული. ზუსტი ECU კოდი და სტატუსი შენახულია უცვლელად.")
                                        .font(.caption2).foregroundStyle(.orange)
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
        }
    }
}
