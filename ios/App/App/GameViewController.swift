import Capacitor
import UIKit
import WebKit

// Bridge view controller that disables WebKit text interaction: the iOS
// text-selection loupe (magnifier) otherwise appears during rapid taps on
// the puzzle, and CSS user-select rules don't fully suppress it in
// WKWebView. Typing in form fields still works; only selection gestures
// and the loupe are disabled.
class GameViewController: CAPBridgeViewController {
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        if #available(iOS 14.5, *) {
            configuration.preferences.isTextInteractionEnabled = false
        }
        return super.webView(with: frame, configuration: configuration)
    }
}
