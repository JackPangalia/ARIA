import Foundation

/// Feature flags mirroring `src/lib/features.ts`. Flip when shipping post-beta features.
enum Features {
    /// App connectors (Composio). Off for beta — see docs/connectors.md.
    static let connectorsEnabled = false
}
