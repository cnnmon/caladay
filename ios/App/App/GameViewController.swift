import Capacitor
import UIKit
import WebKit

// Bridge view controller that keeps WebKit text interaction off: the iOS
// text-selection loupe (magnifier) otherwise appears during rapid taps on
// the puzzle, and CSS user-select rules don't fully suppress it in
// WKWebView. Turning it off also removes the caret and selection in form
// fields, so the web app switches it back on while the name dialog is open
// (setTextInteraction in lib/native.ts).
class GameViewController: CAPBridgeViewController {
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        configuration.preferences.isTextInteractionEnabled = false
        return super.webView(with: frame, configuration: configuration)
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TextInteractionPlugin())
    }
}

@objc(TextInteractionPlugin)
class TextInteractionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TextInteractionPlugin"
    let jsName = "TextInteraction"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        DispatchQueue.main.async {
            self.webView?.configuration.preferences.isTextInteractionEnabled = enabled
            call.resolve()
        }
    }
}
