import Foundation
import Security

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
    case server(String)
    case unexpectedResponse

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            "Enter a valid HTTPS address, or a local development address such as http://127.0.0.1:8787."
        case .missingSessionCookie:
            "The server signed you in but did not return a session. Please try again."
        case .server(let message): message
        case .unexpectedResponse: "FamilyOS could not read the server response. Please try again."
        }
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

    func signOut() async throws {
        let _: MessageReply = try await post("v1/auth/sign-out", body: EmptyBody(), needsSession: true)
        tokenStore.clear()
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
