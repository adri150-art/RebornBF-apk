package be.adriano.bfreborn;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;

/**
 * Le jeu Brave Frontier: Reborn, tel que le site le propose : aucune modification, aucun script ajouté.
 * L'appli ne fait qu'afficher rebornbf.com en plein écran, aux bonnes proportions, avec la connexion Google.
 */
public class PlayActivity extends Activity {
    private static final String HOME = "https://rebornbf.com/";
    /** Seul petit ajout : couper le son du jeu quand on quitte l'appli (et le remettre au retour). */
    private static final String AUDIO_PAUSE = "// Coupe le son du jeu quand on quitte l'appli, et le remet au retour.\n// On garde une trace des \u00ab moteurs audio \u00bb cr\u00e9\u00e9s par le jeu pour pouvoir les mettre en pause.\n(function () {\n  'use strict';\n  if (window.__rbfMute) return;\n  const ctxs = new Set();\n  ['AudioContext', 'webkitAudioContext'].forEach((k) => {\n    const C = window[k];\n    if (!C) return;\n    const W = function (...a) { const c = new C(...a); ctxs.add(c); return c; };\n    W.prototype = C.prototype;\n    Object.setPrototypeOf(W, C);\n    window[k] = W;\n  });\n  let muted = false;\n  window.__rbfMute = function (off) {\n    muted = !!off;\n    ctxs.forEach((c) => { try { if (off) c.suspend(); else c.resume(); } catch (e) { /* rien */ } });\n    document.querySelectorAll('audio,video').forEach((m) => {\n      if (off) { if (!m.paused) { m.__rbfWas = true; m.pause(); } }\n      else if (m.__rbfWas) { m.__rbfWas = false; m.play().catch(() => {}); }\n    });\n  };\n  // Un son lanc\u00e9 pendant que l'appli est cach\u00e9e reste coup\u00e9\n  document.addEventListener('play', (e) => { if (muted && e.target.pause) { e.target.__rbfWas = true; e.target.pause(); } }, true);\n})();\n";
    private boolean docStart;

    private FrameLayout root;
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorView;
    private Dialog popup;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        web = new WebView(this);
        setupWeb(web);
        docStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (docStart) {
            WebViewCompat.addDocumentStartJavaScript(web, AUDIO_PAUSE,
                    new HashSet<>(java.util.Arrays.asList("https://rebornbf.com", "https://*.rebornbf.com")));
        }
        root.addView(web, new FrameLayout.LayoutParams(-1, -1, Gravity.TOP));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));

        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.BLACK);
        TextView msg = new TextView(this);
        msg.setText("Pas de connexion au jeu.\nTouche pour réessayer.");
        msg.setTextColor(0xFFF1EAD8);
        msg.setTextSize(16);
        msg.setGravity(Gravity.CENTER);
        errorView.addView(msg);
        errorView.setVisibility(View.GONE);
        errorView.setOnClickListener(v -> { errorView.setVisibility(View.GONE); web.reload(); });
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1));

        setContentView(root);
        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> layoutGame());
        immersive();

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(HOME);
    }

    /** Plein écran : barres du téléphone cachées (elles reviennent d'un glissement). */
    private void immersive() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Le jeu garde ses proportions (16:9 en hauteur) : rien n'est étiré, bandes noires si l'écran est plus long. */
    private void layoutGame() {
        int w = root.getWidth(), h = root.getHeight();
        if (w == 0 || h == 0) return;
        int ideal = Math.round(w * 16f / 9f);
        int webH = Math.min(h, ideal);
        int top = (h - webH) / 2;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
        if (lp.height != webH || lp.topMargin != top) {
            lp.height = webH;
            lp.topMargin = top;
            web.setLayoutParams(lp);
            FrameLayout.LayoutParams pl = (FrameLayout.LayoutParams) progress.getLayoutParams();
            pl.topMargin = top;
            progress.setLayoutParams(pl);
        }
    }

    private void setupWeb(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // Google refuse la connexion dans les « WebView » : l'appli se présente comme Chrome mobile
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", ""));
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
        w.setBackgroundColor(Color.BLACK);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new Client(false));
        w.setWebChromeClient(new Chrome());
    }

    private static boolean isGame(Uri u) {
        String h = u.getHost();
        return h != null && (h.equals("rebornbf.com") || h.endsWith(".rebornbf.com"));
    }

    /** Liens vers des sites sans rapport avec le jeu (réseaux, vidéos…) : ouverts dans le navigateur. */
    private static boolean openOutside(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        String p = u.getPath() == null ? "" : u.getPath();
        if (h.equals("discord.gg") || ((h.equals("discord.com") || h.endsWith(".discord.com")) && p.startsWith("/invite"))) return true;
        String[] out = {"youtube.com", "youtu.be", "twitter.com", "x.com", "reddit.com", "facebook.com", "instagram.com",
                "tiktok.com", "wikipedia.org", "fandom.com", "play.google.com", "apps.apple.com", "patreon.com", "ko-fi.com", "github.com"};
        for (String d : out) if (h.equals(d) || h.endsWith("." + d)) return !h.equals("accounts.youtube.com");
        return false;
    }

    private class Client extends WebViewClient {
        private final boolean isPopup;

        Client(boolean isPopup) { this.isPopup = isPopup; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("http") || scheme.equals("https")) {
                if (isPopup || req.isRedirect() || !req.hasGesture() || !openOutside(u)) return false;
            }
            try {
                Intent i = "intent".equals(scheme) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) { /* rien */ }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!isPopup) {
                if (!docStart) view.evaluateJavascript(AUDIO_PAUSE, null);
                return;
            }
            Uri u = url == null ? null : Uri.parse(url);
            String p = u == null || u.getPath() == null ? "" : u.getPath();
            // La fenêtre de connexion revient sur le jeu : connexion faite
            if (u != null && isGame(u) && !p.contains("auth") && !p.contains("callback")) {
                view.postDelayed(() -> { if (popup != null) popup.dismiss(); }, 2500);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (!isPopup && req.isForMainFrame()) errorView.setVisibility(View.VISIBLE);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (!isPopup) recreate();
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int p) {
            if (view != web) return;
            progress.setProgress(p);
            progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, Message resultMsg) {
            // Fenêtre de connexion (Google) par-dessus le jeu
            WebView child = new WebView(PlayActivity.this);
            setupWeb(child);
            child.setWebViewClient(new Client(true));
            child.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView w) { if (popup != null) popup.dismiss(); }
            });
            if (popup != null) popup.dismiss();
            popup = new Dialog(PlayActivity.this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            LinearLayout frame = new LinearLayout(PlayActivity.this);
            frame.setOrientation(LinearLayout.VERTICAL);
            frame.setBackgroundColor(0xFF06080F);
            LinearLayout bar = new LinearLayout(PlayActivity.this);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(dp(16), 0, dp(4), 0);
            TextView title = new TextView(PlayActivity.this);
            title.setText("Connexion");
            title.setTextColor(0xFFF1EAD8);
            title.setTextSize(15);
            bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
            TextView close = new TextView(PlayActivity.this);
            close.setText("✕");
            close.setTextColor(0xFFA99F88);
            close.setTextSize(20);
            close.setGravity(Gravity.CENTER);
            close.setOnClickListener(v -> { if (popup != null) popup.dismiss(); });
            bar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
            frame.addView(bar, new LinearLayout.LayoutParams(-1, dp(48)));
            frame.addView(child, new LinearLayout.LayoutParams(-1, 0, 1f));
            popup.setContentView(frame);
            popup.setOnDismissListener(d -> {
                child.destroy();
                popup = null;
                web.postDelayed(() -> web.reload(), 2000);
            });
            popup.show();
            WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
            t.setWebView(child);
            resultMsg.sendToTarget();
            return true;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Appli quittée : le jeu s'arrête (son coupé, plus rien ne tourne). Il reprend au retour. */
    @Override
    protected void onStop() {
        web.evaluateJavascript("window.__rbfMute&&window.__rbfMute(true)", null);
        web.onPause();
        web.pauseTimers();
        super.onStop();
    }

    @Override
    protected void onStart() {
        super.onStart();
        web.resumeTimers();
        web.onResume();
        web.evaluateJavascript("window.__rbfMute&&window.__rbfMute(false)", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (popup != null) popup.dismiss();
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
