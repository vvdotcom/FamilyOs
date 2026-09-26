import Foundation
import Security
import AuthenticationServices
import CryptoKit
import UIKit

struct FamilyAccount: Decodable, Sendable {
    let accountId: String
    let email: String
    let parentName: String
    let emailVerified: Bool
    let householdId: String
    let householdName: String
}

private struct Envelope<Value: Decodable>: Decodable {
    let data: Value
}

private struct ErrorEnvelope: Decodable {
    struct Detail: Decodable { let message: String }
    let error: Detail
}

struct SignUpReply: Decodable {
    let verificationRequired: Bool
    let email: String
    let householdName: String
}

struct SessionReply: Decodable {
    let authenticated: Bool
    let account: FamilyAccount?
}

struct DevEmailReply: Decodable {
    let purpose: String
    let code: String
    let expiresAt: String
}

private struct MessageReply: Decodable {
    let message: String?
    let signedOut: Bool?
    let passwordReset: Bool?
}

private struct SignUpBody: Encodable {
    let email: String
    let password: String
    let parentName: String
    let householdName: String
}

private struct SignInBody: Encodable { let email: String; let password: String }
private struct EmailBody: Encodable { let email: String }
private struct VerifyBody: Encodable { let email: String; let code: String }
private struct ResetBody: Encodable { let email: String; let code: String; let newPassword: String }
private struct EmptyBody: Encodable {}

enum FamilyOSAPIError: LocalizedError {
    case invalidServerAddress
    case missingSessionCookie
    case cognitoNotConfigured
    case server(String)
    case unexpectedResponse

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            "Enter a valid HTTPS address, or a local development address such as http://127.0.0.1:8787."
        case .missingSessionCookie:
            "The server signed you in but did not return a session. Please try again."
        case .cognitoNotConfigured:
            "Secure sign-in is not configured in this iOS build yet."
        case .server(let message): message
        case .unexpectedResponse: "FamilyOS could not read the server response. Please try again."
        }
    }
}

private struct CognitoSettings {
    let hostedDomain: URL
    let clientID: String
    let redirectURI: URL

    init?() {
        guard
            let rawDomain = Bundle.main.object(forInfoDictionaryKey: "FAMILYOS_COGNITO_HOSTED_DOMAIN") as? String,
            let hostedDomain = URL(string: rawDomain), hostedDomain.scheme == "https",
            let clientID = Bundle.main.object(forInfoDictionaryKey: "FAMILYOS_COGNITO_CLIENT_ID") as? String,
            !clientID.isEmpty,
            let rawRedirect = Bundle.main.object(forInfoDictionaryKey: "FAMILYOS_COGNITO_REDIRECT_URI") as? String,
            let redirectURI = URL(string: rawRedirect), let scheme = redirectURI.scheme, !scheme.isEmpty
        else { return nil }
        self.hostedDomain = hostedDomain
        self.clientID = clientID
        self.redirectURI = redirectURI
    }

    var callbackScheme: String { redirectURI.scheme ?? "" }

    func endpoint(_ path: String) -> URL? {
        guard var components = URLComponents(url: hostedDomain, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return components.url
    }
}

private struct CognitoTokenReply: Decodable {
    let id_token: String?
    let error: String?
    let error_description: String?
}

private struct CognitoExchangeBody: Encodable {
    let idToken: String
    let parentName: String
    let householdName: String
}

private struct CognitoExchangeReply: Decodable {
    let authenticated: Bool
    let account: FamilyAccount
}

/// Presents Cognito's managed login in iOS Authentication Services, with PKCE and no client secret.
@MainActor
private final class HostedAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = HostedAuthSession()
    private var activeSession: ASWebAuthenticationSession?

    func present(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
                self?.activeSession = nil
                if let error { continuation.resume(throwing: error) }
                else if let callbackURL { continuation.resume(returning: callbackURL) }
                else { continuation.resume(throwing: FamilyOSAPIError.unexpectedResponse) }
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            activeSession = authSession
            if !authSession.start() {
                activeSession = nil
                continuation.resume(throwing: FamilyOSAPIError.server("iOS could not open the secure sign-in window."))
            }
        }
    }

    func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? UIWindow()
    }
}

private struct CognitoHostedLogin {
    private let settings: CognitoSettings

    init() throws {
        guard let settings = CognitoSettings() else { throw FamilyOSAPIError.cognitoNotConfigured }
        self.settings = settings
    }

    func signIn(emailHint: String?) async throws -> String {
        let verifier = try Self.randomURLSafeValue()
        let state = try Self.randomURLSafeValue()
        let nonce = try Self.randomURLSafeValue()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        guard let authorizeEndpoint = settings.endpoint("oauth2/authorize") else { throw FamilyOSAPIError.cognitoNotConfigured }
        var components = URLComponents(url: authorizeEndpoint, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: settings.clientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email"),
            URLQueryItem(name: "redirect_uri", value: settings.redirectURI.absoluteString),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
        ]
        if let emailHint, !emailHint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            components?.queryItems?.append(URLQueryItem(name: "login_hint", value: emailHint))
        }
        guard let authorizationURL = components?.url else { throw FamilyOSAPIError.cognitoNotConfigured }

        let callback = try await HostedAuthSession.shared.present(url: authorizationURL, callbackScheme: settings.callbackScheme)
        guard callback.scheme == settings.callbackScheme,
              callback.path == settings.redirectURI.path else { throw FamilyOSAPIError.unexpectedResponse }
        let callbackParts = URLComponents(url: callback, resolvingAgainstBaseURL: false)
        let values = Dictionary((callbackParts?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
        guard values["state"] == state else {
            throw FamilyOSAPIError.server("The sign-in response could not be verified. Please try again.")
        }
        if let error = values["error_description"] ?? values["error"] {
            throw FamilyOSAPIError.server(String(error.prefix(240)))
        }
        guard let code = values["code"], !code.isEmpty else { throw FamilyOSAPIError.unexpectedResponse }
        return try await exchangeAuthorizationCode(code, verifier: verifier, expectedNonce: nonce)
    }

    func signOut() async throws {
        guard let logoutEndpoint = settings.endpoint("logout") else { throw FamilyOSAPIError.cognitoNotConfigured }
        var components = URLComponents(url: logoutEndpoint, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: settings.clientID),
            URLQueryItem(name: "logout_uri", value: settings.redirectURI.absoluteString),
        ]
        guard let url = components?.url else { throw FamilyOSAPIError.cognitoNotConfigured }
        _ = try await HostedAuthSession.shared.present(url: url, callbackScheme: settings.callbackScheme)
    }

    private func exchangeAuthorizationCode(_ code: String, verifier: String, expectedNonce: String) async throws -> String {
        guard let tokenURL = settings.endpoint("oauth2/token") else { throw FamilyOSAPIError.cognitoNotConfigured }
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "client_id", value: settings.clientID),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: settings.redirectURI.absoluteString),
            URLQueryItem(name: "code_verifier", value: verifier),
        ]
        request.httpBody = body.percentEncodedQuery?.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse,
              let tokenReply = try? JSONDecoder().decode(CognitoTokenReply.self, from: data) else {
            throw FamilyOSAPIError.unexpectedResponse
        }
        guard (200..<300).contains(response.statusCode), let idToken = tokenReply.id_token, !idToken.isEmpty else {
            throw FamilyOSAPIError.server(String((tokenReply.error_description ?? "Cognito could not complete sign-in.").prefix(240)))
        }
        guard Self.idToken(idToken, containsNonce: expectedNonce) else {
            throw FamilyOSAPIError.server("The sign-in response could not be verified. Please try again.")
        }
        return idToken
    }

    private static func idToken(_ token: String, containsNonce expectedNonce: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return false }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return claims["nonce"] as? String == expectedNonce
    }

    private static func randomURLSafeValue() throws -> String {
        var bytes = Data(count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw FamilyOSAPIError.server("iOS could not start secure sign-in.") }
        return bytes.base64URLEncodedString()
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Keeps the session cookie in iOS Keychain instead of a web view or ordinary preferences.
private struct SessionTokenStore {
    private let service = "com.familyos.companion.session"
    private let account = "familyos_session"

    func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String) throws {
        let data = Data(token.utf8)
        let query = baseQuery
        let attributes: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard updateStatus == errSecSuccess || updateStatus == errSecItemNotFound else {
            throw KeychainError(status: updateStatus)
        }
        if updateStatus == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(insert as CFDictionary, nil)
            guard status == errSecSuccess else { throw KeychainError(status: status) }
        }
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

private struct KeychainError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? { "iPhone could not safely store the FamilyOS session (Keychain error \(status))." }
}

struct FamilyOSAPIClient {
    private let rootURL: URL
    private let session: URLSession
    private let tokenStore = SessionTokenStore()
    private let hostedLogin = try? CognitoHostedLogin()

    var usesCognito: Bool { rootURL.scheme == "https" }

    init(baseAddress: String) throws {
        guard let root = Self.validatedBaseURL(baseAddress) else { throw FamilyOSAPIError.invalidServerAddress }
        rootURL = root
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        session = URLSession(configuration: configuration)
    }

    static func validatedBaseURL(_ address: String) -> URL? {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(),
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              (scheme == "https" || (scheme == "http" && isPrivateDevelopmentHost(host))) else { return nil }
        components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path += components.path.isEmpty ? "" : "/"
        return components.url
    }

    private static func isPrivateDevelopmentHost(_ host: String) -> Bool {
        if ["localhost", "127.0.0.1", "::1"].contains(host) || host.hasSuffix(".local") { return true }
        let octets = host.split(separator: ".").compactMap { UInt8($0) }
        guard octets.count == 4 else { return false }
        return octets[0] == 10
            || (octets[0] == 192 && octets[1] == 168)
            || (octets[0] == 172 && (16...31).contains(octets[1]))
    }

    func signUp(email: String, password: String, parentName: String, householdName: String) async throws -> SignUpReply {
        try await post("v1/auth/sign-up", body: SignUpBody(
            email: email, password: password, parentName: parentName, householdName: householdName
        ))
    }

    func verifyEmail(email: String, code: String) async throws -> FamilyAccount {
        try await post("v1/auth/verify-email", body: VerifyBody(email: email, code: code), createsSession: true)
    }

    func resendVerification(email: String) async throws {
        let _: MessageReply = try await post("v1/auth/resend-verification", body: EmailBody(email: email))
    }

    func signIn(email: String, password: String) async throws -> FamilyAccount {
        try await post("v1/auth/sign-in", body: SignInBody(email: email, password: password), createsSession: true)
    }

    func signInWithCognito(emailHint: String, parentName: String, householdName: String) async throws -> FamilyAccount {
        guard let hostedLogin else { throw FamilyOSAPIError.cognitoNotConfigured }
        let idToken = try await hostedLogin.signIn(emailHint: emailHint)
        let reply: CognitoExchangeReply = try await post(
            "v1/auth/exchange",
            body: CognitoExchangeBody(idToken: idToken, parentName: parentName, householdName: householdName),
            createsSession: true
        )
        guard reply.authenticated else { throw FamilyOSAPIError.unexpectedResponse }
        return reply.account
    }

    func signOut(alsoCognito: Bool = false) async throws {
        let _: MessageReply = try await post("v1/auth/sign-out", body: EmptyBody(), needsSession: true)
        tokenStore.clear()
        if alsoCognito, let hostedLogin { try await hostedLogin.signOut() }
    }

    func sessionState() async throws -> SessionReply {
        try await get("v1/auth/session", needsSession: true)
    }

    func requestPasswordReset(email: String) async throws {
        let _: MessageReply = try await post("v1/auth/forgot-password", body: EmailBody(email: email))
    }

    func resetPassword(email: String, code: String, newPassword: String) async throws {
        let _: MessageReply = try await post(
            "v1/auth/reset-password",
            body: ResetBody(email: email, code: code, newPassword: newPassword)
        )
        tokenStore.clear()
    }

    func localEmailCode(email: String, purpose: String) async throws -> DevEmailReply? {
        var components = URLComponents(url: rootURL.appendingPathComponent("v1/auth/dev-email/latest"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "email", value: email), URLQueryItem(name: "purpose", value: purpose)]
        guard let url = components?.url else { throw FamilyOSAPIError.invalidServerAddress }
        return try await request(url: url, method: "GET", body: nil, needsSession: false, createsSession: false)
    }

    private func post<Response: Decodable, Body: Encodable>(
        _ path: String,
        body: Body,
        needsSession: Bool = false,
        createsSession: Bool = false
    ) async throws -> Response {
        let data = try JSONEncoder().encode(body)
        return try await request(
            url: rootURL.appendingPathComponent(path), method: "POST", body: data,
            needsSession: needsSession, createsSession: createsSession
        )
    }

    private func get<Response: Decodable>(_ path: String, needsSession: Bool) async throws -> Response {
        try await request(url: rootURL.appendingPathComponent(path), method: "GET", body: nil, needsSession: needsSession, createsSession: false)
    }

    private func request<Response: Decodable>(
        url: URL,
        method: String,
        body: Data?,
        needsSession: Bool,
        createsSession: Bool
    ) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if needsSession, let token = tokenStore.read() {
            request.setValue("familyos_session=\(token)", forHTTPHeaderField: "Cookie")
        }

        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw FamilyOSAPIError.unexpectedResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data).error.message)
                ?? "FamilyOS couldn’t complete that request. Please check the server and try again."
            throw FamilyOSAPIError.server(message)
        }

        let envelope: Envelope<Response>
        do { envelope = try JSONDecoder().decode(Envelope<Response>.self, from: data) }
        catch { throw FamilyOSAPIError.unexpectedResponse }

        if createsSession {
            guard let header = response.value(forHTTPHeaderField: "Set-Cookie"),
                  let pair = header.split(separator: ";", maxSplits: 1).first,
                  let separator = pair.firstIndex(of: "="),
                  String(pair[..<separator]) == "familyos_session" else { throw FamilyOSAPIError.missingSessionCookie }
            try tokenStore.save(String(pair[pair.index(after: separator)...]))
        }
        return envelope.data
    }
}
