import XCTest

final class ARIAUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunchShowsSignInOrWorkspace() throws {
        let app = XCUIApplication()
        app.launch()

        let kivoLabel = app.staticTexts["KIVO"]
        XCTAssertTrue(kivoLabel.waitForExistence(timeout: 5))

        let hasEmailField = app.textFields["Email"].exists
        let hasStartButton = app.buttons["START"].exists
        XCTAssertTrue(hasEmailField || hasStartButton)
    }
}
