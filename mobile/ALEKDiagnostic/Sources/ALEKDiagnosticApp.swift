import SwiftUI

@main
struct ALEKDiagnosticApp: App {
    @StateObject private var diagnostic = DiagnosticService()

    var body: some Scene {
        WindowGroup {
            DiagnosticTabs(diagnostic: diagnostic)
                .preferredColorScheme(.dark)
                .tint(AlekTheme.red)
        }
    }
}

enum AlekTheme {
    static let background = Color(red: 0.048, green: 0.050, blue: 0.065)
    static let panel = Color(red: 0.095, green: 0.098, blue: 0.12)
    static let red = Color(red: 0.88, green: 0.16, blue: 0.20)
    static let muted = Color(red: 0.62, green: 0.64, blue: 0.69)
}

struct DiagnosticTabs: View {
    @ObservedObject var diagnostic: DiagnosticService

    var body: some View {
        TabView {
            HomeScreen(diagnostic: diagnostic)
                .tabItem { Label("მთავარი", systemImage: "square.grid.2x2.fill") }
            FaultScreen(diagnostic: diagnostic)
                .tabItem { Label("შეცდომები", systemImage: "exclamationmark.triangle.fill") }
            EnhancedDiagnosticsScreen(diagnostic: diagnostic)
                .tabItem { Label("Enhanced", systemImage: "cpu.fill") }
            LiveScreen(diagnostic: diagnostic)
                .tabItem { Label("Live Data", systemImage: "waveform.path.ecg") }
            ReportScreen(diagnostic: diagnostic)
                .tabItem { Label("ანგარიში", systemImage: "doc.text") }
            GarageScreen(diagnostic: diagnostic)
                .tabItem { Label("ავტოფარეხი", systemImage: "car.side.fill") }
            HistoryScreen(diagnostic: diagnostic)
                .tabItem { Label("ისტორია", systemImage: "clock.arrow.circlepath") }
        }
        .background(AlekTheme.background)
    }
}

struct AlekCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.headline).foregroundStyle(.white)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(AlekTheme.panel, in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).stroke(.white.opacity(0.07)))
    }
}

struct PrimaryAction: View {
    let text: String
    let icon: String
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(text, systemImage: icon)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
        }
        .buttonStyle(.plain)
        .background(disabled ? Color.gray.opacity(0.35) : AlekTheme.red,
                    in: RoundedRectangle(cornerRadius: 12))
        .disabled(disabled)
    }
}
