import SwiftUI

@main
struct FamilyOSCompanionApp: App {
    @StateObject private var auth = AuthViewModel()
    @AppStorage("familyos.appearance") private var appearance = "system"

    private var preferredColorScheme: ColorScheme? {
        switch appearance {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }

    var body: some Scene {
        WindowGroup {
            CompanionView()
                .environmentObject(auth)
                .preferredColorScheme(preferredColorScheme)
        }
    }
}
