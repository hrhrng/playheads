import Foundation

/// Subset of the better-auth user shape we actually use on iOS. Defined here
/// so the auth + session layers don't all drag in the full backend schema.
struct User: Equatable, Decodable {
    let id: String
    let email: String?
    let name: String?
    let image: String?
}

/// Whole-app auth lifecycle.
enum AuthState: Equatable {
    /// Haven't checked yet (first launch, pre-network).
    case unknown
    /// Confirmed signed out.
    case signedOut
    /// SIWA sheet is up / exchange in flight.
    case signingIn
    case signedIn(User)
    case error(String)

    var user: User? {
        if case let .signedIn(u) = self { return u }
        return nil
    }

    var isSignedIn: Bool { user != nil }
}
