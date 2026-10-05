package com.caladay.app;

import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Caladay has no dark theme. Stay in light mode so the system bars keep
    // dark icons over the parchment background when the device is dark.
    // Set before the activity's context is attached: Capacitor reads the
    // night mode while it starts up, so onCreate is too late.
    static {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
    }
}
