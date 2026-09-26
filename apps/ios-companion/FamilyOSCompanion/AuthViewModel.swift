import Foundation
import Combine
import Security

enum AuthScreen: Equatable {
    case signIn, signUp, verifyEmail, forgotPassword, resetPassword, account
}

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var screen: AuthScreen = .signIn
    @Published var account: FamilyAccount?
    @Published var email = ""
    @Published var password = ""
    @Published var parentName = ""
    @Published var householdName = ""
    @Published var code = ""
    @Published var newPassword = ""
    @Published var message: String?
    @Published var messageIsError = false
    @Published var localCode: String?
    @Published var isBusy = false

    @Published private(set) var serverAddress: String {
        didSet { UserDefaults.standard.set(serverAddress, forKey: Self.serverAddressKey) }
    }

    private static let serverAddressKey = "familyos.api-base-address"
    private var client: FamilyOSAPIClient?
    private var didRestoreSession = false

    var usesCognito: Bool { (try? requireClient().usesCognito) ?? false }

    init() {
        let configured = UserDefaults.standard.string(forKey: Self.serverAddressKey)
            ?? Bundle.main.object(forInfoDictionaryKey: "FAMILYOS_API_BASE_URL") as? String
            ?? "http://127.0.0.1:8787"
        serverAddress = configured
        client = try? FamilyOSAPIClient(baseAddress: configured)
    }

    func updateServerAddress(_ value: String) throws {
        let nextClient = try FamilyOSAPIClient(baseAddress: value)
        let normalized = FamilyOSAPIClient.validatedBaseURL(value)?.absoluteString ?? value
        client = nextClient
        SessionCredential.clear()
        serverAddress = normalized
        didRestoreSession = false
        account = nil
        screen = .signIn
        message = "Server saved. Sign in to this FamilyOS server."
        messageIsError = false
    }

    func show(_ next: AuthScreen) {
        screen = next
        message = nil
        localCode = nil
        messageIsError = false
        if next == .signIn { code = ""; newPassword = "" }
    }

    func restoreSession() async {
        guard !didRestoreSession else { return }
        didRestoreSession = true
        guard let client else { return }
        do {
            let state = try await client.sessionState()
            account = state.account
            screen = state.authenticated ? .account : .signIn
        } catch {
            screen = .signIn
            message = nil
        }
    }

    func createAccount() async {
        if usesCognito {
            await run {
                let account = try await self.requireClient().signInWithCognito(
                    emailHint: self.email.trimmingCharacters(in: .whitespacesAndNewlines),
                    parentName: self.parentName.trimmingCharacters(in: .whitespacesAndNewlines),
                    householdName: self.householdName.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                self.account = account
                self.password = ""
                self.screen = .account
                self.message = "Your parent account is ready. Email verification was handled securely by Cognito."
                self.messageIsError = false
            }
            return
        }
        await run {
            let result = try await self.requireClient().signUp(
                email: self.email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: self.password,
                parentName: self.parentName.trimmingCharacters(in: .whitespacesAndNewlines),
                householdName: self.householdName.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            self.email = result.email
            self.password = ""
            self.code = ""
            self.screen = .verifyEmail
            self.message = "Enter the six-digit email code to finish setting up \(result.householdName)."
            self.messageIsError = false
            await self.loadLocalCode(purpose: "verify_email")
        }
    }

    func verifyEmail() async {
        guard !usesCognito else { return }
        await run {
            let account = try await self.requireClient().verifyEmail(email: self.email, code: self.code)
            self.account = account
            self.screen = .account
            self.localCode = nil
            self.message = "Email verified. Your parent account is ready."
            self.messageIsError = false
        }
    }

    func resendVerification() async {
        guard !usesCognito else { return }
        await run {
            try await self.requireClient().resendVerification(email: self.email)
            self.message = "If that account needs verification, a new code has been issued."
            self.messageIsError = false
            await self.loadLocalCode(purpose: "verify_email")
        }
    }

    func signIn() async {
        await run {
            let api = try self.requireClient()
            let account: FamilyAccount
            if api.usesCognito {
                account = try await api.signInWithCognito(
                    emailHint: self.email.trimmingCharacters(in: .whitespacesAndNewlines),
                    parentName: self.parentName.trimmingCharacters(in: .whitespacesAndNewlines),
                    householdName: self.householdName.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            } else {
                account = try await api.signIn(
                    email: self.email.trimmingCharacters(in: .whitespacesAndNewlines), password: self.password
                )
            }
            self.account = account
            self.password = ""
            self.screen = .account
            self.message = "You’re signed in."
            self.messageIsError = false
        }
    }

    func requestPasswordReset() async {
        if usesCognito {
            await signIn()
            if account == nil {
                message = "Use “Forgot your password?” on the secure Cognito sign-in page. After resetting it, sign in there to return to FamilyOS."
                messageIsError = false
            }
            return
        }
        await run {
            try await self.requireClient().requestPasswordReset(email: self.email.trimmingCharacters(in: .whitespacesAndNewlines))
            self.code = ""
            self.newPassword = ""
            self.screen = .resetPassword
            self.message = "If an eligible account exists, a reset code has been issued."
            self.messageIsError = false
            await self.loadLocalCode(purpose: "reset_password")
        }
    }

    func resetPassword() async {
        guard !usesCognito else { return }
        await run {
            try await self.requireClient().resetPassword(email: self.email, code: self.code, newPassword: self.newPassword)
            self.password = ""
            self.newPassword = ""
            self.localCode = nil
            self.screen = .signIn
            self.message = "Password updated. Sign in with your new password."
            self.messageIsError = false
        }
    }

    func signOut() async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await requireClient().signOut(alsoCognito: usesCognito)
            finishSignOut(message: "You’ve been signed out.", isError: false)
        } catch {
            // Forget this device's credential even when offline. The server will expire
            // its session if the revocation request could not reach it.
            SessionCredential.clear()
            finishSignOut(message: "Signed out on this iPhone. FamilyOS couldn’t reach the server to revoke the session there.", isError: true)
        }
    }

    private func finishSignOut(message: String, isError: Bool) {
        account = nil
        password = ""
        screen = .signIn
        self.message = message
        messageIsError = isError
    }

    private func loadLocalCode(purpose: String) async {
        do { localCode = try await requireClient().localEmailCode(email: email, purpose: purpose)?.code }
        catch { localCode = nil }
    }

    private func requireClient() throws -> FamilyOSAPIClient {
        if let client { return client }
        let newClient = try FamilyOSAPIClient(baseAddress: serverAddress)
        client = newClient
        return newClient
    }

    private func run(_ action: () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        message = nil
        messageIsError = false
        do { try await action() }
        catch {
            message = error.localizedDescription
            messageIsError = true
        }
    }
}

/// Same Keychain entry as the API client; used to clear local access if the phone is offline.
private enum SessionCredential {
    static func clear() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.familyos.companion.session",
            kSecAttrAccount as String: "familyos_session",
        ] as CFDictionary)
    }
}
