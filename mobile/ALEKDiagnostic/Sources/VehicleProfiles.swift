import SwiftUI
import Foundation

struct VehicleProfile: Identifiable, Codable, Equatable {
    let id: UUID
    var make: String
    var model: String
    var year: String
    var engine: String
    var manualVIN: String

    var title: String {
        [make, model, year].filter { !$0.isEmpty }.joined(separator: " ")
    }
}

struct GarageScreen: View {
    @ObservedObject var diagnostic: DiagnosticService
    @State private var showingForm = false
    @State private var make = ""
    @State private var model = ""
    @State private var year = ""
    @State private var engine = ""
    @State private var manualVIN = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ALEK").font(.caption).bold().tracking(4).foregroundStyle(AlekTheme.red)
                    Text("ჩემი ავტოფარეხი").font(.system(size: 29, weight: .bold))
                    Text("აირჩიე მარკა და მოდელი, ან შეინახე შენი ავტომობილი")
                        .font(.subheadline).foregroundStyle(AlekTheme.muted)

                    Button {
                        make = ""
                        model = ""
                        year = ""
                        engine = ""
                        manualVIN = ""
                        showingForm = true
                    } label: {
                        Label("ავტომობილის დამატება", systemImage: "plus.circle.fill")
                            .fontWeight(.semibold).frame(maxWidth: .infinity).padding(14)
                            .background(AlekTheme.red, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain)

                    if diagnostic.profiles.isEmpty {
                        AlekCard(title: "ავტომობილები ჯერ არ არის") {
                            Text("დაამატე მანქანა. პროფილის შეყვანა არ ნიშნავს ECU-სთან კავშირს.")
                                .font(.footnote).foregroundStyle(AlekTheme.muted)
                        }
                    }
                    ForEach(diagnostic.profiles) { profile in
                        AlekCard(title: profile.title) {
                            if !profile.engine.isEmpty {
                                Text(profile.engine).font(.subheadline)
                                    .foregroundStyle(AlekTheme.muted)
                            }
                            if !profile.manualVIN.isEmpty {
                                Text("VIN (ხელით): \(profile.manualVIN)")
                                    .font(.footnote).foregroundStyle(AlekTheme.muted)
                            }
                            HStack {
                                if diagnostic.selectedVehicleID == profile.id {
                                    Label("არჩეული", systemImage: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                } else {
                                    Button("არჩევა") { diagnostic.selectVehicle(profile.id) }
                                        .buttonStyle(.borderedProminent)
                                }
                                Spacer()
                                Button("წაშლა", role: .destructive) {
                                    diagnostic.removeVehicle(profile.id)
                                }.font(.caption)
                            }
                        }
                    }
                    if let vin = diagnostic.vin {
                        AlekCard(title: "ECU-დან ამოცნობილი VIN") {
                            Text(vin).font(.system(.body, design: .monospaced))
                            Text("ეს მნიშვნელობა უშუალოდ ავტომობილის ECU-მ დააბრუნა.")
                                .font(.caption).foregroundStyle(AlekTheme.muted)
                        }
                    }
                }.padding(18)
            }
            .background(AlekTheme.background.ignoresSafeArea())
            .navigationBarHidden(true)
            .sheet(isPresented: $showingForm) {
                NavigationStack {
                    Form {
                        Section("ავტომობილის მონაცემები") {
                            TextField("მარკა (მაგ. Alfa Romeo)", text: $make)
                            TextField("მოდელი (მაგ. GT)", text: $model)
                            TextField("წელი", text: $year).keyboardType(.numberPad)
                            TextField("ძრავა", text: $engine)
                            TextField("VIN (არასავალდებულო)", text: $manualVIN)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                        }
                        Section {
                            Text("ხელით შეყვანილი VIN მხოლოდ პროფილისთვისაა და არ ჩაითვლება ავტომატურად წაკითხულად.")
                                .font(.footnote)
                        }
                    }
                    .navigationTitle("ახალი ავტომობილი")
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("გაუქმება") { showingForm = false }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("შენახვა") {
                                let profile = VehicleProfile(
                                    id: UUID(),
                                    make: make.trimmingCharacters(in: .whitespaces),
                                    model: model.trimmingCharacters(in: .whitespaces),
                                    year: year.trimmingCharacters(in: .whitespaces),
                                    engine: engine.trimmingCharacters(in: .whitespaces),
                                    manualVIN: manualVIN.uppercased().trimmingCharacters(in: .whitespaces)
                                )
                                diagnostic.saveVehicle(profile)
                                showingForm = false
                            }
                            .disabled(make.trimmingCharacters(in: .whitespaces).isEmpty ||
                                      model.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
            }
        }
    }
}
