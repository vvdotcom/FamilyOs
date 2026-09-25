import SwiftUI
import UIKit

private enum FamilyPalette {
    static func canvas(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0x111925) : hex(0xF5F4EF) }
    static func surface(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0x1C2735) : hex(0xFFFEFB) }
    static func ink(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0xF5F3EC) : hex(0x18243D) }
    static func secondary(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0xB3BECA) : hex(0x5D6776) }
    static func line(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0x394758) : hex(0xDEDDD7) }
    static let amber = hex(0xD98D18)
    static let error = hex(0xA83E2A)
    static let success = hex(0x2F7940)
    static func field(_ scheme: ColorScheme) -> Color { scheme == .dark ? hex(0x141D29) : .white }

    static func hex(_ value: UInt32) -> Color {
        Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

private enum FamilyType {
    static func body(_ size: CGFloat, weight: String = "Figtree-400") -> Font { .custom(weight, size: size, relativeTo: .body) }
    static func display(_ size: CGFloat) -> Font { .custom("Bricolage-800-34", size: size, relativeTo: .largeTitle) }
}

struct CompanionView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.colorScheme) private var scheme
    @State private var showSettings = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                    .padding(.bottom, 30)

                VStack(alignment: .leading, spacing: 0) {
                    if auth.screen != .account {
                        Text(title)
                            .font(FamilyType.display(32))
                            .tracking(-0.5)
                            .foregroundStyle(FamilyPalette.ink(scheme))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(subtitle)
                            .font(FamilyType.body(15))
                            .lineSpacing(4)
                            .foregroundStyle(FamilyPalette.secondary(scheme))
                            .padding(.top, 9)
                            .padding(.bottom, 20)
                    }

                    if let message = auth.message {
                        messageBanner(message)
                            .padding(.bottom, 16)
                    }

                    if auth.screen == .signIn || auth.screen == .signUp {
                        accountTabs
                            .padding(.bottom, 19)
                    }

                    screenContent
                }
                .padding(24)
                .background(FamilyPalette.surface(scheme), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(FamilyPalette.line(scheme), lineWidth: 1))

                HStack(spacing: 7) {
                    Circle().fill(FamilyPalette.amber).frame(width: 7, height: 7)
                    Text("\(environmentLabel) · No app-store install required for development")
                        .font(FamilyType.body(12))
                        .foregroundStyle(FamilyPalette.secondary(scheme))
                }
                .multilineTextAlignment(.center)
                .padding(.top, 17)
            }
            .frame(maxWidth: 460)
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 30)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(FamilyPalette.canvas(scheme).ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showSettings) {
            CompanionSettingsView()
                .environmentObject(auth)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task { await auth.restoreSession() }
    }

    private var header: some View {
        HStack {
            HStack(spacing: 10) {
                Text("F")
                    .font(FamilyType.body(16, weight: "Figtree-700"))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(FamilyPalette.amber, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text("FamilyOS")
                    .font(FamilyType.body(18, weight: "Figtree-700"))
                    .foregroundStyle(FamilyPalette.ink(scheme))
            }
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(FamilyPalette.ink(scheme))
                    .frame(width: 42, height: 42)
                    .background(FamilyPalette.surface(scheme), in: Circle())
                    .overlay(Circle().stroke(FamilyPalette.line(scheme), lineWidth: 1))
            }
            .accessibilityLabel("Settings")
        }
        .frame(maxWidth: .infinity)
    }

    private var title: String {
        switch auth.screen {
        case .signIn, .signUp: "Your family, together"
        case .verifyEmail: "Check your email"
        case .forgotPassword: "Reset your password"
        case .resetPassword: "Choose a new password"
        case .account: "Your family, together"
        }
    }

    private var subtitle: String {
        switch auth.screen {
        case .signIn: "Sign in to keep your household connected across devices."
        case .signUp: "Create a parent account to start your FamilyOS household."
        case .verifyEmail: "Enter the six-digit code sent to your email address."
        case .forgotPassword: "We’ll send a reset code to the verified email on your account."
        case .resetPassword: "Enter your reset code, then choose a new password."
        case .account: ""
        }
    }

    private var environmentLabel: String {
        auth.serverAddress.contains("127.0.0.1") || auth.serverAddress.contains("localhost")
            ? "Local development only"
            : "Connected to configured server"
    }

    private var accountTabs: some View {
        HStack(spacing: 0) {
            tabButton("Sign in", screen: .signIn)
            tabButton("Create account", screen: .signUp)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(FamilyPalette.line(scheme)).frame(height: 1) }
    }

    private func tabButton(_ title: String, screen: AuthScreen) -> some View {
        let selected = auth.screen == screen
        return Button { auth.show(screen) } label: {
            VStack(spacing: 10) {
                Text(title).font(FamilyType.body(15, weight: "Figtree-600"))
                    .foregroundStyle(selected ? FamilyPalette.ink(scheme) : FamilyPalette.secondary(scheme))
                Rectangle().fill(selected ? FamilyPalette.amber : .clear).frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private var screenContent: some View {
        switch auth.screen {
        case .signIn: signInForm
        case .signUp: signUpForm
        case .verifyEmail: verifyForm
        case .forgotPassword: forgotForm
        case .resetPassword: resetForm
        case .account: signedInView
        }
    }

    private var signInForm: some View {
        VStack(spacing: 13) {
            AuthField(label: "Email address", placeholder: "you@example.com", text: $auth.email, contentType: .emailAddress, keyboard: .emailAddress)
            AuthField(label: "Password", placeholder: "Your password", text: $auth.password, contentType: .password, secure: true)
            actionButton("Sign in") { await auth.signIn() }
            linkButton("Forgot password?") { auth.show(.forgotPassword) }
        }
    }

    private var signUpForm: some View {
        VStack(spacing: 13) {
            AuthField(label: "Parent or guardian name", placeholder: "Your name", text: $auth.parentName, contentType: .name)
            AuthField(label: "Household name", placeholder: "The Parkers", text: $auth.householdName, contentType: .organizationName)
            AuthField(label: "Email address", placeholder: "you@example.com", text: $auth.email, contentType: .emailAddress, keyboard: .emailAddress)
            AuthField(label: "Create password", placeholder: "At least 12 characters", text: $auth.password, contentType: .newPassword, secure: true)
            Text("Children can be added as family profiles later; they won’t need email accounts.")
                .font(FamilyType.body(13))
                .lineSpacing(3)
                .foregroundStyle(FamilyPalette.secondary(scheme))
                .frame(maxWidth: .infinity, alignment: .leading)
            actionButton("Create parent account") { await auth.createAccount() }
        }
    }

    private var verifyForm: some View {
        VStack(spacing: 13) {
            Text(auth.email)
                .font(FamilyType.body(14, weight: "Figtree-600"))
                .foregroundStyle(FamilyPalette.ink(scheme))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            AuthField(label: "Six-digit verification code", placeholder: "000000", text: $auth.code, keyboard: .numberPad, contentType: .oneTimeCode)
            localCodeCard
            actionButton("Verify email") { await auth.verifyEmail() }
            linkButton("Send a new code") { Task { await auth.resendVerification() } }
            linkButton("Back to sign in") { auth.show(.signIn) }
        }
    }

    private var forgotForm: some View {
        VStack(spacing: 13) {
            AuthField(label: "Email address", placeholder: "you@example.com", text: $auth.email, contentType: .emailAddress, keyboard: .emailAddress)
            actionButton("Send reset code") { await auth.requestPasswordReset() }
            linkButton("Back to sign in") { auth.show(.signIn) }
        }
    }

    private var resetForm: some View {
        VStack(spacing: 13) {
            AuthField(label: "Six-digit reset code", placeholder: "000000", text: $auth.code, keyboard: .numberPad, contentType: .oneTimeCode)
            localCodeCard
            AuthField(label: "New password", placeholder: "At least 12 characters", text: $auth.newPassword, contentType: .newPassword, secure: true)
            actionButton("Save new password") { await auth.resetPassword() }
            linkButton("Cancel") { auth.show(.signIn) }
        }
    }

    private var localCodeCard: some View {
        Group {
            if let code = auth.localCode {
                VStack(alignment: .leading, spacing: 5) {
                    Text("LOCAL TEST EMAIL").font(FamilyType.body(11, weight: "Figtree-700"))
                    Text(code).font(FamilyType.body(23, weight: "Figtree-700")).tracking(4)
                    Text("This code is shown only by the local development server. No email was sent.")
                        .font(FamilyType.body(12)).lineSpacing(2)
                }
                .foregroundStyle(FamilyPalette.ink(scheme))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(13)
                .background(FamilyPalette.canvas(scheme), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var signedInView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "house.fill")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(FamilyPalette.amber)
                .frame(width: 48, height: 48)
                .background(FamilyPalette.canvas(scheme), in: RoundedRectangle(cornerRadius: 13))
            Text("Welcome, \(auth.account?.parentName ?? "Parent")")
                .font(FamilyType.display(28))
                .foregroundStyle(FamilyPalette.ink(scheme))
            Text(auth.account?.householdName ?? "Your household")
                .font(FamilyType.body(20, weight: "Figtree-700"))
                .foregroundStyle(FamilyPalette.ink(scheme))
            Text(auth.account?.email ?? "")
                .font(FamilyType.body(14))
                .foregroundStyle(FamilyPalette.secondary(scheme))
                .textSelection(.enabled)
            Divider().overlay(FamilyPalette.line(scheme))
            Text("Your Fire TV will pair separately. You won’t need to type your password with the remote.")
                .font(FamilyType.body(14))
                .lineSpacing(4)
                .foregroundStyle(FamilyPalette.secondary(scheme))
            actionButton("Sign out", secondary: true) { await auth.signOut() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func actionButton(_ title: String, secondary: Bool = false, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 8) {
                if auth.isBusy { ProgressView().tint(secondary ? FamilyPalette.ink(scheme) : .white) }
                Text(title).font(FamilyType.body(15, weight: "Figtree-700"))
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 48)
            .foregroundStyle(secondary ? FamilyPalette.ink(scheme) : .white)
            .background(secondary ? Color.clear : FamilyPalette.ink(scheme), in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(secondary ? FamilyPalette.line(scheme) : FamilyPalette.ink(scheme), lineWidth: 1))
        }
        .disabled(auth.isBusy)
        .buttonStyle(.plain)
    }

    private func linkButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(FamilyType.body(14, weight: "Figtree-600"))
                .foregroundStyle(FamilyPalette.ink(scheme))
                .underline(true, color: FamilyPalette.amber)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private func messageBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            RoundedRectangle(cornerRadius: 2).fill(auth.messageIsError ? FamilyPalette.error : FamilyPalette.amber).frame(width: 3)
            Text(text)
                .font(FamilyType.body(14))
                .lineSpacing(3)
                .foregroundStyle(FamilyPalette.ink(scheme))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(FamilyPalette.canvas(scheme), in: RoundedRectangle(cornerRadius: 8))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

private struct AuthField: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let placeholder: String
    @Binding var text: String
    var contentType: UITextContentType? = nil
    var keyboard: UIKeyboardType = .default
    var secure = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(FamilyType.body(14, weight: "Figtree-600"))
                .foregroundStyle(FamilyPalette.ink(scheme))
            Group {
                if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .font(FamilyType.body(16))
            .textContentType(contentType)
            .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .background(FamilyPalette.field(scheme), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(FamilyPalette.line(scheme), lineWidth: 1))
            .foregroundStyle(FamilyPalette.ink(scheme))
            .accessibilityLabel(label)
        }
    }
}

struct CompanionSettingsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @AppStorage("familyos.appearance") private var appearance = "system"
    @State private var serverAddress = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Picker("Theme", selection: $appearance) {
                        Text("System").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                }
                Section("FamilyOS server") {
                    TextField("https://… or local address", text: $serverAddress)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                    Text("Use HTTPS for a hosted server. For local testing, enter the computer’s private Wi-Fi address and port 8787. The server must be running and reachable from this iPhone.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                    Button("Save server") {
                        do {
                            try auth.updateServerAddress(serverAddress)
                            error = nil
                            dismiss()
                        } catch let saveError { error = saveError.localizedDescription }
                    }
                }
                Section {
                    Text("Account creation and sign-in are connected to the local FamilyOS preview API. AWS Cognito, production email, household sync, and Railway are not configured yet.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(FamilyPalette.canvas(scheme))
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .tint(FamilyPalette.amber)
            .onAppear { serverAddress = auth.serverAddress }
        }
    }
}
