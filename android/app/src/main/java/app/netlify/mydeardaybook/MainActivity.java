package app.netlify.mydeardaybook;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

/** Shows Daybook full screen in the app's own WebView. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1;
    private static final int REQ_NOTIFY = 2;
    static final String EXTRA_PATH = "path";

    private WebView web;
    private PullRefresh pull;
    private FrameLayout root;
    private ValueCallback<Uri[]> pendingFiles;
    private boolean dark;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        root = new FrameLayout(this);
        web = new WebView(this);
        pull = new PullRefresh(this, web);
        pull.setListener(this::refresh);
        root.addView(pull, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyBars(dark);

        // Android 15+ draws apps edge to edge: keep the page clear of the status bar, the
        // navigation bar and the keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = bars.top; left = bars.left; right = bars.right;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft(); right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " DaybookAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(this), "DaybookAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }

        Reminders.ensureChannel(this);
        SyncJob.schedule(this);
        askForNotifications();

        if (state != null) web.restoreState(state);
        else web.loadUrl(urlFor(getIntent()));
    }

    private String urlFor(Intent intent) {
        String path = intent != null ? intent.getStringExtra(EXTRA_PATH) : null;
        if (path == null || !path.startsWith("/")) path = "/";
        return BuildConfig.SITE + path;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getStringExtra(EXTRA_PATH) != null) web.loadUrl(urlFor(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        goBack();
    }

    private void goBack() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    void askForNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
        }
    }

    /** Matches the system bars to the page's light or dark theme. */
    void applyBars(boolean isDark) {
        dark = isDark;
        if (pull != null) pull.setDark(isDark);
        int page = isDark ? Color.parseColor("#0C0F15") : Color.parseColor("#E6EBF3");
        root.setBackgroundColor(page);
        getWindow().getDecorView().setBackgroundColor(page);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(isDark ? 0 : light, light);
            }
        } else {
            int flags = getWindow().getDecorView().getSystemUiVisibility();
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(isDark ? flags & ~light : flags | light);
            getWindow().setStatusBarColor(page);
            getWindow().setNavigationBarColor(page);
        }
    }

    void reload() {
        web.loadUrl(BuildConfig.SITE + "/");
    }

    /** Swipe down from the top: reload the page you're on (or Daybook's home from the offline page). */
    private void refresh() {
        String url = web.getUrl();
        if (url == null || url.startsWith(BuildConfig.SITE + "/offline")) reload();
        else web.reload();
        // Never leave the spinner going if the page hangs.
        web.removeCallbacks(stopPull);
        web.postDelayed(stopPull, 15000);
    }

    private final Runnable stopPull = () -> pull.done();

    void pullAllowed(boolean ok) {
        pull.setPageAllows(ok);
    }

    // On each touch the page says whether a pull may start: only when the page is at the top, no
    // sheet or pop-up is open, no calendar drag is going on, and the finger isn't on a panel that
    // is itself scrolled down.
    private static final String PULL_JS =
        "(function(){if(window.__dbPull||!window.DaybookAndroid)return;window.__dbPull=1;" +
        "function ok(t){var d=document.scrollingElement||document.documentElement;if(d.scrollTop>0)return false;" +
        "var b=document.body;if(!b||b.classList.contains('cal-dragging'))return false;" +
        "if(document.querySelector('[data-scroll-contain],.fixed.inset-0'))return false;" +
        "for(var el=t instanceof Element?t:null;el&&el!==b&&el!==document.documentElement;el=el.parentElement){" +
        "if(el.scrollTop>0){var oy=getComputedStyle(el).overflowY;if(oy==='auto'||oy==='scroll')return false;}}return true;}" +
        "addEventListener('touchstart',function(e){DaybookAndroid.pullAllowed(e.touches.length===1&&ok(e.target))},{capture:true,passive:true});" +
        "new MutationObserver(function(){if(document.body.classList.contains('cal-dragging'))DaybookAndroid.pullAllowed(false)})" +
        ".observe(document.body,{attributes:true,attributeFilter:['class']});})()";

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_FILE && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFiles = null;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            String site = Uri.parse(BuildConfig.SITE).getHost();
            if (("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && site != null && site.equals(uri.getHost())) {
                return false;
            }
            // Anything outside Daybook (Spotify, maps, email, phone numbers) opens in its own app.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pull.resetPage();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pull.done();
            view.evaluateJavascript(PULL_JS, null);
            // Follow the page's light/dark switch so the status bar always matches.
            view.evaluateJavascript(
                "(function(){var h=document.documentElement;var f=function(){window.DaybookAndroid&&DaybookAndroid.setDark(h.dataset.theme==='dark')};" +
                "f();if(!window.__dbTheme){window.__dbTheme=new MutationObserver(f);window.__dbTheme.observe(h,{attributes:true,attributeFilter:['data-theme']});}})()",
                null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame()) return;
            String bg = dark ? "#0C0F15" : "#E6EBF3";
            String fg = dark ? "#ECEEF3" : "#181C25";
            String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>" +
                "<body style=\"margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
                "font-family:sans-serif;background:" + bg + ";color:" + fg + ";text-align:center;padding:24px;box-sizing:border-box\">" +
                "<p style='font-size:18px;font-weight:600;margin:0 0 8px'>You're offline</p>" +
                "<p style='opacity:.7;margin:0 0 20px'>Daybook needs the internet to load. Your reminders still work.</p>" +
                "<button onclick='DaybookAndroid.reload()' style='font:inherit;padding:10px 20px;border-radius:999px;border:0;background:#2F4FB5;color:#fff'>Try again</button></body>";
            view.loadDataWithBaseURL(BuildConfig.SITE + "/offline", html, "text/html", "utf-8", null);
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }
    }
}
