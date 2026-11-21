package tech.morgado.nexttram;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;
import com.google.androidbrowserhelper.trusted.TwaProviderPicker;
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity;

/**
 * Defensive TWA launcher. Guards against null browser providers (which otherwise
 * crash inside TwaLauncher's Token.create(null, pm) call) and falls back cleanly
 * to WebViewFallbackActivity if TWA launch throws on startup.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final String TAG = "NextTramLauncher";

    @Override
    protected void launchTwa() {
        TwaProviderPicker.Action action = TwaProviderPicker.pickProvider(getPackageManager());
        if (action == null || action.provider == null) {
            Log.w(TAG, "No TWA/browser provider found; opening WebView fallback.");
            openWebViewFallback();
            return;
        }
        try {
            super.launchTwa();
        } catch (RuntimeException e) {
            Log.e(TAG, "TWA launch failed; opening WebView fallback.", e);
            openWebViewFallback();
        }
    }

    private void openWebViewFallback() {
        Uri url = getLaunchingUrl();
        LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);
        Intent intent = WebViewFallbackActivity.createLaunchIntent(this, url, metadata);
        startActivity(intent);
        finish();
    }
}
