package be.adriano.rebornbf;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.RoundedCorner;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.ScriptHandler;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reborn BF : le jeu rebornbf.com dans sa propre appli, plein écran, avec un menu rapide
 * pour se déplacer dans le jeu et un panneau pour activer / couper les bots proprement.
 */
public class MainActivity extends Activity {

    private static final String SITE = "https://rebornbf.com";
    private static final String HOME = SITE + "/home";
    private static final Set<String> ORIGINS =
            new HashSet<>(Arrays.asList("https://rebornbf.com", "https://*.rebornbf.com"));

    // Bots intégrés : id, titre, description, fichier, lancé dès le début du chargement
    private static final String[][] BOTS = {
            {"farm", "Farm quête",
                    "Relance ta quête en boucle, sans limite, jusqu'à ce que tu l'arrêtes. Ouvre une quête puis ☰ → « Farmer cette quête ».",
                    "farm.js", "0"},
            {"aventure", "Aventure auto",
                    "Avance seul dans l'histoire, en AUTO et x2. Attend l'énergie, ne dépense jamais de gemmes.",
                    "aventure.js", "1"},
    };

    private static final int C_BG = 0xFF14161D, C_CARD = 0xFF1C1F28, C_TEXT = 0xFFE6E8EE,
            C_SUB = 0xFF8A8FA0, C_GOLD = 0xFFF0B03C, C_LINE = 0xFF262A36;

    private SharedPreferences prefs;
    private WebView web;
    private FrameLayout root;
    private TextView fab;
    private boolean fabInBand;
    private LinearLayout bar;
    private TextView barCtx;
    private boolean barOn;
    private LinearLayout topBar;
    private TextView topFarm, topAdv;
    private boolean topOn;
    private int cutTop, cutBottom, cornerTop, cornerBottom;
    private ProgressBar progress;
    private View splash;
    private View errorView;
    private Dialog panel;
    private Dialog quick;
    private Dialog popup;
    private ScriptHandler scriptHandler;
    private String injection = "";
    private boolean docStartSupported;
    private boolean dirty;
    private int notifId = 1;

    // ───────────────────────────── Cycle de vie ─────────────────────────────

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("rbf", MODE_PRIVATE);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        root = new FrameLayout(this);
        // Bandes autour du jeu : dégradé sombre assorti au jeu plutôt qu'un noir plat
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xFF0E1222, 0xFF07060C, 0xFF07060C, 0xFF16101E}));

        // Le jeu se croit toujours affiché : en arrière-plan, Android ne coupe ni l'affichage ni les minuteries du jeu
        web = new WebView(this) {
            @Override
            protected void onWindowVisibilityChanged(int visibility) {
                super.onWindowVisibilityChanged(opt("background", true) ? View.VISIBLE : visibility);
            }
        };
        setupWeb(web);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1, Gravity.TOP));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(C_GOLD));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(Color.TRANSPARENT));
        progress.setVisibility(View.GONE);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(4), Gravity.TOP));

        errorView = buildErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1));

        splash = buildSplash();
        root.addView(splash, new FrameLayout.LayoutParams(-1, -1));

        fab = buildFab();
        root.addView(fab, new FrameLayout.LayoutParams(0, 0, Gravity.BOTTOM | Gravity.END));
        fab.setVisibility(View.GONE); // le menu ☰ est maintenant dans le jeu, au style du jeu
        // Barre sous le jeu (dans la bande noire) : menu ☰ + bouton de la page (Infos quête, Taux, Boss…)
        bar = buildBar();
        root.addView(bar, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(42), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
        bar.setVisibility(View.GONE);
        // Bande au-dessus du jeu : état des bots en cours (farm, aventure), touche pour les arrêter
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER);
        topFarm = barButton("");
        topFarm.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        topFarm.setVisibility(View.GONE);
        topFarm.setOnClickListener(v -> { tap(); web.evaluateJavascript("window.__rbfFarm&&window.__rbfFarm.stop()", null); });
        topAdv = barButton("");
        topAdv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        topAdv.setVisibility(View.GONE);
        topAdv.setOnClickListener(v -> { tap(); web.evaluateJavascript("window.__rbfAdv&&window.__rbfAdv.stop()", null); });
        topBar.addView(topFarm);
        topBar.addView(topAdv);
        root.addView(topBar, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(38), Gravity.TOP | Gravity.CENTER_HORIZONTAL));
        setContentView(root);

        // Encoche, coins arrondis : on mesure les zones à éviter puis on place le jeu
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            cutTop = cutBottom = cornerTop = cornerBottom = 0;
            if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                cutTop = insets.getDisplayCutout().getSafeInsetTop();
                cutBottom = insets.getDisplayCutout().getSafeInsetBottom();
            }
            if (Build.VERSION.SDK_INT >= 31) {
                RoundedCorner tl = insets.getRoundedCorner(RoundedCorner.POSITION_TOP_LEFT);
                RoundedCorner bl = insets.getRoundedCorner(RoundedCorner.POSITION_BOTTOM_LEFT);
                if (tl != null) cornerTop = tl.getRadius();
                if (bl != null) cornerBottom = bl.getRadius();
            }
            root.post(this::layoutGame);
            return insets;
        });
        root.addOnLayoutChangeListener((v, l, t, rr, b, ol, ot, or, ob) -> {
            if (rr - l != or - ol || b - t != ob - ot) root.post(this::layoutGame);
        });

        docStartSupported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "rbfNative", ORIGINS,
                    (view, message, sourceOrigin, isMainFrame, reply) -> onWebMessage(message.getData()));
        }
        applyWindowOptions();
        applyScripts();

        if (saved != null) web.restoreState(saved);
        if (web.getUrl() == null) web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onStart() {
        super.onStart();
        KeepAliveService.stop(this);
        if (web != null) web.evaluateJavascript("window.__rbfMute&&window.__rbfMute(false)", null);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Appli quittée : plus de musique (le jeu et les bots peuvent continuer sans le son)
        if (web != null) web.evaluateJavascript("window.__rbfMute&&window.__rbfMute(true)", null);
        // On quitte l'appli : le jeu continue en arrière-plan (notification « Reborn BF continue de jouer »)
        if (opt("background", true) && !isFinishing()) KeepAliveService.start(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        applyWindowOptions();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        // Avec l'anti-pause, on laisse le jeu tourner quand l'appli passe derrière.
        if (!opt("antipause", true) && !opt("background", true)) web.onPause();
    }

    @Override
    protected void onDestroy() {
        KeepAliveService.stop(this);
        if (popup != null) popup.dismiss();
        if (panel != null) panel.dismiss();
        if (quick != null) quick.dismiss();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyWindowOptions();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (errorView.getVisibility() == View.VISIBLE) { retry(); return; }
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true); // on ne ferme pas le jeu, on le met juste derrière
    }

    // ───────────────────────────── WebView ─────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
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
        // Se présenter comme Chrome mobile (sans la marque « WebView ») pour la connexion Google
        String ua = s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", "");
        s.setUserAgentString(ua);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(s, Collections.<String>emptySet());
        }
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
        w.setBackgroundColor(Color.BLACK);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new GameClient(false));
        w.setWebChromeClient(new GameChrome());
    }

    /** Liens à ouvrir hors de l'appli : seulement des sites sans rapport avec le jeu ou la connexion. */
    private static boolean openOutside(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        String p = u.getPath() == null ? "" : u.getPath();
        if (h.equals("discord.gg") || ((h.equals("discord.com") || h.endsWith(".discord.com")) && p.startsWith("/invite"))) return true;
        String[] out = {"youtube.com", "youtu.be", "twitter.com", "x.com", "reddit.com", "facebook.com", "instagram.com",
                "tiktok.com", "wikipedia.org", "fandom.com", "play.google.com", "apps.apple.com", "patreon.com", "ko-fi.com", "github.com"};
        for (String d : out) if (h.equals(d) || h.endsWith("." + d)) return !h.equals("accounts.youtube.com");
        return false;
    }

    private static String shortUrl(Uri u) {
        String p = u.getPath() == null ? "" : u.getPath();
        if (p.length() > 40) p = p.substring(0, 40) + "…";
        return (u.getHost() == null ? u.getScheme() : u.getHost()) + p;
    }

    /** Petit journal des pages visitées (sans les paramètres, donc sans jeton) pour diagnostiquer la connexion. */
    private void log(String line) {
        String t = new java.text.SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new java.util.Date());
        String old = prefs.getString("journal", "");
        String all = t + "  " + line + "\n" + old;
        if (all.length() > 4000) all = all.substring(0, 4000);
        prefs.edit().putString("journal", all).apply();
    }

    private static boolean isGame(Uri u) {
        String h = u.getHost();
        return h != null && (h.equals("rebornbf.com") || h.endsWith(".rebornbf.com"));
    }

    private boolean onGame() {
        String url = web.getUrl();
        return url != null && isGame(Uri.parse(url));
    }

    // Interface de combat en HD : images agrandies (fournies dans l'appli) servies à la place de celles du jeu
    private static final String ORIG = "https://assets.rebornbf.com/assets/original/";
    private java.util.Set<String> hdFiles;

    private java.util.Set<String> hdFiles() {
        if (hdFiles == null) {
            hdFiles = new HashSet<>();
            try (InputStream in = getAssets().open("hd/use.txt")) {
                for (String l : new String(readAll(in), "UTF-8").split("\n")) if (!l.trim().isEmpty()) hdFiles.add(l.trim());
            } catch (Exception e) { /* pas de pack HD */ }
        }
        return hdFiles;
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toByteArray();
    }

    private WebResourceResponse hdImage(String url) {
        if (url == null || !url.startsWith(ORIG) || !opt("hdui", true)) return null;
        String path = url.substring(ORIG.length());
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (!hdFiles().contains(path)) return null;
        try {
            InputStream in = getAssets().open("hd/" + path);
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "max-age=31536000");
            return new WebResourceResponse("image/png", null, 200, "OK", h, in);
        } catch (Exception e) {
            return null;
        }
    }

    private class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            WebResourceResponse r = hdImage(req.getUrl().toString());
            return r != null ? r : super.shouldInterceptRequest(view, req);
        }

        private final boolean isPopup;

        GameClient(boolean isPopup) { this.isPopup = isPopup; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("http") || scheme.equals("https")) {
                if (req.isForMainFrame()) log((isPopup ? "fenêtre → " : "→ ") + shortUrl(u));
                // Tout reste dans l'appli (le jeu, Google, Discord, le service de connexion…).
                // Seuls les liens touchés vers des sites sans rapport (YouTube, invitation Discord…) sortent.
                if (isPopup || req.isRedirect() || !req.hasGesture() || !openOutside(u)) return false;
            }
            openExternal(u);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (isPopup) {
                Uri u = url == null ? null : Uri.parse(url);
                String p = u == null || u.getPath() == null ? "" : u.getPath();
                // La page de retour de connexion (/__/auth/…, /api/auth/…, /auth/…) doit finir son travail
                // seule. Si la fenêtre atterrit sur une vraie page du jeu, la connexion est faite.
                if (u != null && isGame(u) && !p.contains("auth") && !p.contains("callback")) {
                    view.postDelayed(() -> { if (popup != null) popup.dismiss(); }, 2500);
                }
                return;
            }
            if (!docStartSupported && url != null && isGame(Uri.parse(url))) {
                view.evaluateJavascript(injection, null);
            }
            hideSplash();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) log("✖ erreur " + err.getErrorCode() + " sur " + shortUrl(req.getUrl()));
            if (!isPopup && req.isForMainFrame()) {
                hideSplash();
                errorView.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Le moteur du jeu a planté : on relance proprement au lieu de fermer l'appli
            if (!isPopup) recreate();
            return true;
        }
    }

    private class GameChrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int p) {
            if (view != web) return;
            progress.setProgress(p);
            progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            if (p >= 85) hideSplash();
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, Message resultMsg) {
            // Fenêtre de connexion (popup Google) ouverte par-dessus le jeu
            log("fenêtre de connexion ouverte");
            WebView child = new WebView(MainActivity.this);
            setupWeb(child);
            child.setWebViewClient(new GameClient(true));
            child.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView w) {
                    if (popup != null) popup.dismiss();
                }
            });
            if (popup != null) popup.dismiss();
            popup = new Dialog(MainActivity.this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            LinearLayout frame = new LinearLayout(MainActivity.this);
            frame.setOrientation(LinearLayout.VERTICAL);
            frame.setBackgroundColor(C_BG);
            LinearLayout bar = new LinearLayout(MainActivity.this);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(dp(16), 0, dp(4), 0);
            TextView title = text("Connexion", 15, C_TEXT, true);
            bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
            TextView close = text("✕", 20, C_SUB, false);
            close.setGravity(Gravity.CENTER);
            close.setOnClickListener(v -> { if (popup != null) popup.dismiss(); });
            bar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
            frame.addView(bar, new LinearLayout.LayoutParams(-1, dp(48)));
            frame.addView(child, new LinearLayout.LayoutParams(-1, 0, 1f));
            popup.setContentView(frame);
            popup.setOnDismissListener(d -> {
                log("fenêtre de connexion fermée");
                child.destroy();
                popup = null;
                // Le jeu relit la session (connexion faite dans la fenêtre)
                web.postDelayed(() -> web.reload(), 2000);
            });
            popup.show();
            WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
            t.setWebView(child);
            resultMsg.sendToTarget();
            return true;
        }
    }

    private void openExternal(Uri u) {
        try {
            Intent i;
            if ("intent".equals(u.getScheme())) i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
            else i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("Impossible d'ouvrir ce lien");
        }
    }

    private void retry() {
        errorView.setVisibility(View.GONE);
        if (web.getUrl() == null || "about:blank".equals(web.getUrl())) web.loadUrl(HOME);
        else web.reload();
    }

    /** Messages envoyés par les scripts du jeu (vibration, notifications des bots). */
    private void onWebMessage(String data) {
        if (data == null) return;
        if (data.equals("tap")) {
            if (opt("haptic", true)) {
                web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY,
                        HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING);
            }
        } else if (data.startsWith("notify:")) {
            notifyUser(data.substring(7));
        } else if (data.startsWith("ctx:")) {
            final String label = data.substring(4);
            runOnUiThread(() -> { barCtx.setText(label); barCtx.setVisibility(label.isEmpty() ? View.GONE : View.VISIBLE); });
        } else if (data.startsWith("fstat:") || data.startsWith("astat:")) {
            final boolean farm = data.startsWith("f");
            final String label = data.substring(6);
            runOnUiThread(() -> {
                TextView t = farm ? topFarm : topAdv;
                t.setText(label);
                t.setVisibility(label.isEmpty() ? View.GONE : View.VISIBLE);
            });
        } else if (data.equals("bar?")) {
            runOnUiThread(this::tellBar);
        } else if (data.startsWith("save:")) {
            final String json = data.substring(5);
            runOnUiThread(() -> saveFromPage(json));
        } else if (data.equals("action:fullscreen")) {
            runOnUiThread(() -> { prefs.edit().putBoolean("opt_fullscreen", !opt("fullscreen", true)).apply(); applyWindowOptions(); });
        } else if (data.matches("farm:\\d+(:\\d+)?")) {
            final String[] p = data.split(":");
            final int target = p.length > 2 ? Integer.parseInt(p[2]) : 0;
            runOnUiThread(() -> farmQuest(p[1], target));
        }
    }

    private void notifyUser(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            toast(text);
            return;
        }
        nm.createNotificationChannel(new NotificationChannel("bots", "Bots", NotificationManager.IMPORTANCE_DEFAULT));
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "bots")
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("Reborn BF")
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        nm.notify(notifId++, n);
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
    }

    // ───────────────────────────── Scripts ─────────────────────────────

    private boolean opt(String key, boolean def) { return prefs.getBoolean("opt_" + key, def); }

    private boolean botOn(String id) { return prefs.getBoolean("bot_" + id, false); }

    private String asset(String name) {
        try (InputStream in = getAssets().open("scripts/" + name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private static String wrap(String code, boolean atStart, String label) {
        // Le nom sert seulement dans les messages d'erreur : on le rend sûr pour JavaScript
        String safe = JSONObject.quote("[RBF] " + label);
        String body = "try{\n" + code + "\n}catch(e){console.error(" + safe + ",e)}\n";
        if (atStart) return "(function(){" + body + "})();\n";
        // Attend que la page soit prête (comme Tampermonkey « document-idle »)
        return "(function __rbfRun(){if(document.readyState==='loading'||!document.body){"
                + "document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}"
                + body + "})();\n";
    }

    private String buildInjection() {
        StringBuilder sb = new StringBuilder();
        sb.append("(function(){if(window.top!==window)return;")
          .append("if(!/(^|\\.)rebornbf\\.com$/.test(location.hostname))return;")
          .append("if(window.__rbfApp)return;window.__rbfApp=1;\n");
        sb.append("window.__rbfBar=" + prefs.getBoolean("bar_on", false) + ";window.__rbfTop=" + prefs.getBoolean("top_on", false) + ";");
        // Nouvelle page : on efface l'état des bots affiché au-dessus du jeu, les bots actifs le renverront
        sb.append("try{rbfNative.postMessage('fstat:');rbfNative.postMessage('astat:')}catch(e){}\n");
        // Petites compatibilités Tampermonkey pour les scripts ajoutés à la main
        sb.append("window.unsafeWindow=window;")
          .append("window.GM_addStyle=window.GM_addStyle||function(c){var s=document.createElement('style');s.textContent=c;(document.head||document.documentElement).appendChild(s);return s;};")
          .append("window.GM_getValue=window.GM_getValue||function(k,d){try{var v=localStorage.getItem('gm_'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}};")
          .append("window.GM_setValue=window.GM_setValue||function(k,v){try{localStorage.setItem('gm_'+k,JSON.stringify(v));}catch(e){}};")
          .append("window.GM_deleteValue=window.GM_deleteValue||function(k){try{localStorage.removeItem('gm_'+k);}catch(e){}};\n");

        sb.append(wrap(asset("perf.js"), true, "performance"));
        sb.append(wrap(asset("audiopause.js"), true, "son"));
        if (opt("antipause", true) || opt("background", true)) sb.append(wrap(asset("antipause.js"), true, "anti-pause"));
        if (opt("appfeel", true)) sb.append(wrap(asset("appfeel.js"), false, "style appli"));
        sb.append(wrap(asset("nav.js"), false, "menu rapide"));
        sb.append(wrap(asset("gamedata.js"), false, "données du jeu"));
        if (opt("remaster", true)) sb.append(wrap(asset("unitplus.js"), false, "fiche d'unité"));
        if (opt("infos", true)) sb.append(wrap(asset("gameinfo.js"), false, "infos du jeu"));
        if (opt("hd", false)) sb.append(wrap(asset("hd.js"), false, "filtre HD"));
        boolean auto = opt("always_auto", false), x2 = opt("always_x2", true);
        String turbo = opt("turbo2", false) ? "2" : opt("turbo15", false) ? "1.5" : "1";
        {
            String c = asset("combat.js").replace("__AUTO__", String.valueOf(auto)).replace("__X2__", String.valueOf(x2)).replace("__TURBO__", turbo);
            sb.append(wrap(c, false, "combat"));
        }
        for (String[] b : BOTS) {
            if (botOn(b[0]) || "farm".equals(b[0])) sb.append(wrap(asset(b[3]), "1".equals(b[4]), b[1]));
        }
        JSONArray custom = customScripts();
        for (int i = 0; i < custom.length(); i++) {
            JSONObject c = custom.optJSONObject(i);
            if (c != null && c.optBoolean("on", true)) {
                String code = c.optString("code", "");
                boolean start = code.contains("@run-at") && code.contains("document-start");
                sb.append(wrap(code, start, c.optString("name", "script").replace("'", " ")));
            }
        }
        // Menu ☰ et réglages dans le style du jeu (même interface que sur PC), reliés à l'appli
        sb.append("window.rbfApp={platform:'android',settings:function(){return JSON.parse(")
          .append(JSONObject.quote(settingsJson().toString()))
          .append(")},save:function(s,u){try{rbfNative.postMessage('save:'+JSON.stringify({s:s,url:u||null}))}catch(e){}},")
          .append("action:function(a){if(a==='back')history.back();else if(a==='reload')location.reload();else try{rbfNative.postMessage('action:'+a)}catch(e){}},")
          .append("postMessage:function(m){try{rbfNative.postMessage(m)}catch(e){}}};\n");
        sb.append(wrap(asset("ui.js"), false, "interface"));
        sb.append("})();");
        return sb.toString();
    }

    private static final String[] OPTS = {"remaster", "infos", "appfeel", "haptic", "antipause", "screen_on", "fullscreen",
            "format169", "hd", "always_x2", "always_auto", "notifications", "turbo15", "turbo2", "background", "hdui"};
    private static final boolean[] OPT_DEF = {true, true, true, true, true, true, true, true, false, true, false, true, false, false, true, true};

    /** Réglages au format de l'interface (bots, options, scripts). */
    private JSONObject settingsJson() {
        JSONObject o = new JSONObject();
        try {
            JSONObject bots = new JSONObject();
            for (String[] b : BOTS) bots.put(b[0], botOn(b[0]));
            JSONObject opt = new JSONObject();
            for (int i = 0; i < OPTS.length; i++) opt.put(OPTS[i], opt(OPTS[i], OPT_DEF[i]));
            o.put("bots", bots).put("opt", opt).put("custom", customScripts()).put("farm_target", 0);
        } catch (Exception e) { /* rien */ }
        return o;
    }

    /** Réglages envoyés par l'interface du jeu : on les enregistre puis on recharge. */
    private void saveFromPage(String json) {
        try {
            JSONObject m = new JSONObject(json);
            JSONObject s = m.optJSONObject("s");
            if (s == null) return;
            SharedPreferences.Editor e = prefs.edit();
            JSONObject bots = s.optJSONObject("bots");
            boolean farmOn = false;
            if (bots != null) for (String[] b : BOTS) {
                boolean on = bots.optBoolean(b[0], false);
                e.putBoolean("bot_" + b[0], on);
                if (on) farmOn = true;
            }
            JSONObject opt = s.optJSONObject("opt");
            if (opt != null) for (int i = 0; i < OPTS.length; i++) e.putBoolean("opt_" + OPTS[i], opt.optBoolean(OPTS[i], OPT_DEF[i]));
            JSONArray custom = s.optJSONArray("custom");
            if (custom != null) e.putString("custom", custom.toString());
            e.apply();
            if (farmOn) askNotificationPermission();
            applyScripts();
            applyWindowOptions();
            String url = m.isNull("url") ? null : m.optString("url", null);
            if (url != null && url.startsWith("/")) web.loadUrl(SITE + url);
            else web.reload();
        } catch (Exception ex) { /* rien */ }
    }

    /** Enregistre les scripts actifs : ils seront lancés à chaque chargement d'une page du jeu. */
    private void applyScripts() {
        injection = buildInjection();
        if (docStartSupported) {
            if (scriptHandler != null) {
                scriptHandler.remove();
                scriptHandler = null;
            }
            scriptHandler = WebViewCompat.addDocumentStartJavaScript(web, injection, ORIGINS);
        }
    }

    private JSONArray customScripts() {
        try {
            return new JSONArray(prefs.getString("custom", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private void saveCustom(JSONArray a) { prefs.edit().putString("custom", a.toString()).apply(); }

    /** Applique les changements du panneau puis recharge le jeu. */
    private void applyAndReload() {
        applyScripts();
        applyWindowOptions();
        String js = "try{"
                + "localStorage.setItem('rbf_adv_actif','" + (botOn("aventure") ? "1" : "0") + "');"
                + "var k='bfrRepeatBot',s=JSON.parse(localStorage.getItem(k)||'{}');"
                + (botOn("farm") ? "" : "s.on=false;")
                + "localStorage.setItem(k,JSON.stringify(s));"
                + "}catch(e){}";
        if (onGame()) web.evaluateJavascript(js, v -> web.reload());
        else web.loadUrl(HOME);
        toast("Réglages appliqués");
    }

    /** Démarre le farm sur la quête ouverte, sans passer par les réglages. */
    private void farmQuest(String questId, int target) {
        prefs.edit().putBoolean("bot_farm", true).putBoolean("bot_aventure", false).apply();
        askNotificationPermission();
        applyScripts();
        String js = "try{"
                + "localStorage.setItem('rbf_adv_actif','0');"
                + "var k='bfrRepeatBot',s=JSON.parse(localStorage.getItem(k)||'{}');"
                + "if(s.quest!==" + JSONObject.quote(questId) + "){s.maxRuns=null;s.single=false;}"
                + "s.quest=" + JSONObject.quote(questId) + ";"
                + "s.slot=null;s.on=true;s.target=" + Math.max(0, target) + ";s.fights=0;s.curRun=0;s.loops=0;s.day=new Date().toDateString();"
                + "localStorage.setItem(k,JSON.stringify(s));"
                + "}catch(e){}";
        web.evaluateJavascript(js, v -> web.loadUrl(SITE + "/start/" + questId));
        toast(target > 0 ? "Farm lancé : " + target + " combats" : "Farm lancé : il tourne jusqu'à ce que tu l'arrêtes");
    }

    /** Va sur une rubrique du jeu en utilisant sa propre navigation (rapide, sans recharger). */
    private void goTo(String path) {
        if (!onGame()) { web.loadUrl(SITE + path); return; }
        String p = JSONObject.quote(path);
        web.evaluateJavascript("(function(p){"
                + "var a=[].slice.call(document.querySelectorAll('a[href]')).find(function(x){return (x.getAttribute('href')||'').split(/[?#]/)[0]===p;});"
                + "if(a){a.click();return;}"
                + "try{if(window.next&&window.next.router&&window.next.router.push){window.next.router.push(p);return;}}catch(e){}"
                + "location.assign(p);})(" + p + ")", null);
    }

    // ───────────────────────────── Fenêtre ─────────────────────────────

    @SuppressWarnings("deprecation")
    private void applyWindowOptions() {
        Window w = getWindow();
        if (opt("screen_on", true)) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        boolean full = opt("fullscreen", true);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(!full);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                if (full) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    c.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            }
        } else {
            View d = w.getDecorView();
            d.setSystemUiVisibility(full
                    ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    : View.SYSTEM_UI_FLAG_VISIBLE);
        }
        if (root != null) root.post(this::layoutGame);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams a = w.getAttributes();
            a.layoutInDisplayCutoutMode = full
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
            w.setAttributes(a);
        }
    }

    // ───────────────────────────── Placement du jeu ─────────────────────────────

    /**
     * Le jeu est dessiné pour un écran 16:9. Sur un téléphone plus allongé, on garde ce format
     * (bandes discrètes en haut et en bas, comme une console) au lieu d'un grand vide noir,
     * et on évite l'encoche de la caméra et les coins arrondis.
     */
    private void layoutGame() {
        int w = root.getWidth(), h = root.getHeight();
        if (w == 0 || h == 0) return;
        boolean full = opt("fullscreen", true);
        // Coins arrondis : la partie utile commence à environ 30 % du rayon
        int safeTop = full ? Math.max(cutTop, Math.round(cornerTop * 0.3f)) : 0;
        int safeBottom = full ? Math.max(cutBottom, Math.round(cornerBottom * 0.3f)) : 0;
        int avail = h - safeTop - safeBottom;
        int webH = avail, top = safeTop;
        if (opt("format169", true)) {
            int ideal = Math.round(w * 16f / 9f);
            if (avail > ideal) {
                webH = ideal;
                top = safeTop + (avail - ideal) / 2;
            }
        }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
        if (lp.height != webH || lp.topMargin != top) {
            lp.height = webH;
            lp.topMargin = top;
            lp.gravity = Gravity.TOP;
            web.setLayoutParams(lp);
            FrameLayout.LayoutParams pl = (FrameLayout.LayoutParams) progress.getLayoutParams();
            pl.topMargin = top;
            progress.setLayoutParams(pl);
        }
        // Barre sous le jeu : seulement s'il y a la place dans la bande du bas, sinon les boutons restent dans la page
        int band = h - (top + webH);
        boolean on = band >= dp(52);
        FrameLayout.LayoutParams bl = (FrameLayout.LayoutParams) bar.getLayoutParams();
        bl.bottomMargin = Math.max(safeBottom, (band - dp(42)) / 2);
        bar.setLayoutParams(bl);
        bar.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on != barOn) {
            barOn = on;
            prefs.edit().putBoolean("bar_on", on).apply();
            tellBar();
        }
        // Bande du haut : état des bots, en dehors de l'écran du jeu
        int topBand = top - safeTop;
        boolean tOn = topBand >= dp(46);
        FrameLayout.LayoutParams tl = (FrameLayout.LayoutParams) topBar.getLayoutParams();
        tl.topMargin = safeTop + Math.max(0, (topBand - dp(38)) / 2);
        topBar.setLayoutParams(tl);
        topBar.setVisibility(tOn ? View.VISIBLE : View.GONE);
        if (tOn != topOn) {
            topOn = tOn;
            prefs.edit().putBoolean("top_on", tOn).apply();
            tellBar();
        }
        FrameLayout.LayoutParams fl = (FrameLayout.LayoutParams) fab.getLayoutParams();
        boolean inBand = band >= dp(50);
        if (inBand != fabInBand || fl.width == 0) {
            fabInBand = inBand;
            if (inBand) {
                fl.width = dp(40);
                fl.height = dp(40);
                fl.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
                fl.setMargins(0, 0, 0, Math.max(0, (band - dp(40)) / 2));
                fab.setTranslationX(0);
                fab.setTranslationY(0);
                fab.setAlpha(0.9f);
            } else {
                fl.width = dp(48);
                fl.height = dp(48);
                fl.gravity = Gravity.BOTTOM | Gravity.END;
                fl.setMargins(0, 0, dp(14), dp(70));
                fab.setTranslationX(prefs.getFloat("fab_x", 0f));
                fab.setTranslationY(prefs.getFloat("fab_y", 0f));
                fab.setAlpha(0.65f);
            }
            fab.setLayoutParams(fl);
        }
    }

    // ───────────────────────────── Démarrage / erreur ─────────────────────────────

    private View buildSplash() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER);
        v.setBackgroundColor(0xFF0B0A14);
        v.setClickable(true);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        v.addView(icon, new LinearLayout.LayoutParams(dp(96), dp(96)));
        TextView t = text("Reborn BF", 22, C_TEXT, true);
        t.setPadding(0, dp(16), 0, dp(4));
        v.addView(t);
        v.addView(text("Chargement du jeu…", 13, C_SUB, false));
        return v;
    }

    private void hideSplash() {
        if (splash == null || splash.getVisibility() != View.VISIBLE) return;
        splash.animate().alpha(0f).setDuration(250).withEndAction(() -> splash.setVisibility(View.GONE)).start();
    }

    private View buildErrorView() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER);
        v.setBackgroundColor(0xFF0B0A14);
        v.setPadding(dp(32), 0, dp(32), 0);
        v.setClickable(true);
        TextView t = text("Pas de connexion au jeu", 20, C_TEXT, true);
        t.setGravity(Gravity.CENTER);
        v.addView(t);
        TextView s = text("Vérifie ton Wi-Fi ou tes données mobiles, puis réessaie.", 14, C_SUB, false);
        s.setGravity(Gravity.CENTER);
        s.setPadding(0, dp(8), 0, dp(20));
        v.addView(s);
        Button b = button("Réessayer", true, x -> retry());
        v.addView(b, new LinearLayout.LayoutParams(dp(200), dp(48)));
        return v;
    }

    // ───────────────────────────── Bouton flottant ─────────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    /** Prévient la page : boutons dans la barre native (true) ou dans la page (false). */
    private void tellBar() {
        if (web == null) return;
        web.evaluateJavascript("window.__rbfBar=" + barOn + ";window.__rbfTop=" + topOn + ";try{window.dispatchEvent(new Event('rbfbar'))}catch(e){}", null);
    }

    private TextView barButton(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(C_GOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(18), 0, dp(18), 0);
        b.setShadowLayer(3, 0, 2, 0xFF1A1006);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        bg.setColors(new int[]{0xFF2A2012, 0xFF120E08});
        bg.setStroke(dp(1), 0xB3FFD278);
        b.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(42));
        lp.setMargins(dp(5), 0, dp(5), 0);
        b.setLayoutParams(lp);
        return b;
    }

    private LinearLayout buildBar() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER);
        TextView menu = barButton("☰  Menu");
        menu.setOnClickListener(v -> { tap(); web.evaluateJavascript("window.__rbfUI&&window.__rbfUI.quick()", null); });
        menu.setOnLongClickListener(v -> { web.evaluateJavascript("window.__rbfUI&&window.__rbfUI.settings()", null); return true; });
        barCtx = barButton("");
        barCtx.setVisibility(View.GONE);
        barCtx.setOnClickListener(v -> { tap(); web.evaluateJavascript("window.__rbfInfo&&window.__rbfInfo.open()", null); });
        l.addView(barCtx);
        l.addView(menu);
        return l;
    }

    private void tap() {
        if (opt("haptic", true)) web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING);
    }

    private TextView buildFab() {
        TextView b = new TextView(this);
        b.setText("☰");
        b.setTextColor(C_GOLD);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xE60E1016);
        bg.setStroke(dp(1), 0x66F0B03C);
        b.setBackground(bg);
        b.setAlpha(0.65f);
        b.setElevation(dp(6));
        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        b.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY, startTx, startTy;
            boolean dragging;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startTx = v.getTranslationX();
                        startTy = v.getTranslationY();
                        dragging = false;
                        v.setAlpha(1f);
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                        if (!dragging && !fabInBand && Math.hypot(dx, dy) > slop) dragging = true;
                        if (dragging) {
                            v.setTranslationX(startTx + dx);
                            v.setTranslationY(startTy + dy);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        v.setAlpha(fabInBand ? 0.9f : 0.65f);
                        if (dragging) {
                            prefs.edit().putFloat("fab_x", v.getTranslationX()).putFloat("fab_y", v.getTranslationY()).apply();
                        } else {
                            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                            if (e.getEventTime() - e.getDownTime() > 450) openPanel(); // appui long : réglages
                            else openQuick();
                        }
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        v.setAlpha(fabInBand ? 0.9f : 0.65f);
                        return true;
                }
                return false;
            }
        });
        return b;
    }

    // ───────────────────────────── Menu rapide ─────────────────────────────

    private void openQuick() {
        if (quick != null && quick.isShowing()) return;
        String js = "(function(){var n={},q=null,s=null;"
                + "try{n=JSON.parse(localStorage.getItem('rbf_nav')||'{}')}catch(e){}"
                + "try{var b=JSON.parse(localStorage.getItem('bfrRepeatBot')||'{}');q=b.quest||null;}catch(e){}"
                + "try{s=new URLSearchParams(location.search).get('slot')}catch(e){}"
                + "return JSON.stringify({nav:n,path:location.pathname,quest:q,slot:s});})()";
        if (!onGame()) { showQuick(new JSONObject()); return; }
        web.evaluateJavascript(js, res -> {
            JSONObject info = new JSONObject();
            try {
                Object o = new JSONTokener(res).nextValue();
                if (o instanceof String) info = new JSONObject((String) o);
            } catch (Exception ignored) { }
            showQuick(info);
        });
    }

    private static String iconFor(String path, String label) {
        String k = (path + " " + label).toLowerCase(Locale.ROOT);
        if (k.contains("arena") || k.contains("arène") || k.contains("pvp") || k.contains("colis")) return "⚔️";
        if (k.contains("summon") || k.contains("invoc") || k.contains("gacha")) return "✨";
        if (k.contains("unit") || k.contains("unité") || k.contains("squad") || k.contains("équipe") || k.contains("team")) return "👥";
        if (k.contains("item") || k.contains("objet") || k.contains("inventa") || k.contains("sac")) return "🎒";
        if (k.contains("shop") || k.contains("boutique") || k.contains("store") || k.contains("market")) return "🛒";
        if (k.contains("friend") || k.contains("ami") || k.contains("social")) return "🤝";
        if (k.contains("account") || k.contains("compte") || k.contains("profil") || k.contains("summoner")) return "👤";
        if (k.contains("gift") || k.contains("cadeau") || k.contains("present") || k.contains("mail")) return "🎁";
        if (k.contains("mission") || k.contains("achiev") || k.contains("quotid") || k.contains("daily")) return "📜";
        if (k.contains("vortex") || k.contains("dungeon") || k.contains("donjon") || k.contains("event")) return "🌀";
        if (k.contains("fusion") || k.contains("evol") || k.contains("craft") || k.contains("forge")) return "🔨";
        if (k.contains("quest") || k.contains("quête") || k.contains("aventure")) return "🗺️";
        if (k.contains("rank") || k.contains("classement") || k.contains("leader")) return "🏆";
        if (k.contains("setting") || k.contains("option") || k.contains("param")) return "⚙️";
        return "🔹";
    }

    private void showQuick(JSONObject info) {
        quick = new Dialog(this);
        quick.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(14), dp(10), dp(14), dp(18));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(C_BG);
        float r = dp(22);
        bg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});
        bg.setStroke(dp(1), C_LINE);
        box.setBackground(bg);

        View grip = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF3A3F4E);
        g.setCornerRadius(dp(3));
        grip.setBackground(g);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(dp(40), dp(5));
        glp.gravity = Gravity.CENTER_HORIZONTAL;
        glp.bottomMargin = dp(12);
        box.addView(grip, glp);

        String path = info.optString("path", "");
        String quest = info.isNull("quest") ? null : info.optString("quest", null);
        String slot = info.isNull("slot") ? null : info.optString("slot", null);

        // Action principale selon l'écran
        Matcher qm = Pattern.compile("^/start/(\\d+)").matcher(path);
        if (qm.find()) {
            final String id = qm.group(1);
            box.addView(button("🔁  Farmer cette quête", true, v -> {
                quick.dismiss();
                // Le jeu demande combien de combats (fenêtre de l'appli dans la page), sinon farm sans fin
                web.evaluateJavascript("(function(){if(window.rbfData&&rbfData.farm){rbfData.farm(" + JSONObject.quote(id) + ");return 1}return 0})()",
                        res -> { if (!"1".equals(res)) farmQuest(id, 0); });
            }));
        } else if (quest != null && !quest.isEmpty()) {
            final String id = quest;
            box.addView(button("▶  Reprendre ma dernière quête", true, v -> {
                quick.dismiss();
                web.loadUrl(SITE + "/start/" + id);
            }));
        }

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setPadding(0, dp(8), 0, 0);
        box.addView(grid, new LinearLayout.LayoutParams(-1, -2));

        tile(grid, "⬅️", "Retour", () -> { if (web.canGoBack()) web.goBack(); });
        tile(grid, "🏠", "Accueil", () -> goTo("/home"));
        tile(grid, "🗺️", "Quêtes", () -> goTo("/quests"));

        // Rubriques apprises dans le menu du jeu, les plus utilisées d'abord
        List<String[]> nav = new ArrayList<>();
        JSONObject n = info.optJSONObject("nav");
        if (n != null) {
            Iterator<String> it = n.keys();
            while (it.hasNext()) {
                String p = it.next();
                JSONObject o = n.optJSONObject(p);
                if (o == null || p.equals("/home") || p.equals("/quests")) continue;
                nav.add(new String[]{p, o.optString("l", p), String.valueOf(o.optInt("n", 0))});
            }
        }
        Collections.sort(nav, (a, b) -> Integer.parseInt(b[2]) - Integer.parseInt(a[2]));
        for (int i = 0; i < nav.size() && i < 9; i++) {
            final String p = nav.get(i)[0];
            tile(grid, iconFor(p, nav.get(i)[1]), nav.get(i)[1], () -> goTo(p));
        }
        tile(grid, "🔄", "Recharger", () -> web.reload());
        tile(grid, "📋", "Copier pour Claude", this::copyStructure);
        tile(grid, "🤖", "Bots & réglages", this::openPanel);

        if (nav.isEmpty()) {
            TextView hint = text("Les autres rubriques du jeu (arène, unités, invocation…) apparaîtront ici dès que tu auras ouvert le menu du jeu une fois.", 12, C_SUB, false);
            hint.setPadding(dp(4), dp(10), dp(4), 0);
            box.addView(hint);
        }

        quick.setContentView(box);
        Window w = quick.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setGravity(Gravity.BOTTOM);
            w.setLayout(Math.min(getResources().getDisplayMetrics().widthPixels, dp(520)), ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setDimAmount(0.45f);
            w.getAttributes().windowAnimations = android.R.style.Animation_InputMethod;
        }
        quick.setOnDismissListener(d -> applyWindowOptions());
        quick.show();
    }

    /** Copie le relevé des derniers écrans visités, à coller dans la discussion avec Claude. */
    private void copyStructure() {
        if (!onGame()) { toast("Ouvre d'abord le jeu"); return; }
        web.evaluateJavascript("(function(){return localStorage.getItem('rbf_struct')||'[]';})()", res -> {
            String data = "[]";
            try {
                Object o = new JSONTokener(res).nextValue();
                if (o instanceof String) data = (String) o;
            } catch (Exception ignored) { }
            int n = 0;
            try { n = new JSONArray(data).length(); } catch (Exception ignored) { }
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Reborn BF", "RBF-PAGES " + data));
            toast(n + " écran(s) copié(s) : colle-les dans la discussion avec Claude");
        });
    }

    private void tile(GridLayout grid, String icon, String label, Runnable action) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(4), dp(10), dp(4), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(C_CARD);
        bg.setCornerRadius(dp(14));
        t.setBackground(bg);
        TextView i = text(icon, 22, C_TEXT, false);
        i.setGravity(Gravity.CENTER);
        t.addView(i);
        TextView l = text(label, 11, C_TEXT, false);
        l.setGravity(Gravity.CENTER);
        l.setMaxLines(2);
        l.setPadding(0, dp(4), 0, 0);
        t.addView(l);
        t.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            if (quick != null) quick.dismiss();
            action.run();
        });
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams(
                GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
        lp.width = 0;
        lp.height = dp(78);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        grid.addView(t, lp);
    }

    // ───────────────────────────── Panneau des bots ─────────────────────────────

    private void openPanel() {
        if (panel != null && panel.isShowing()) return;
        dirty = false;
        panel = new Dialog(this);
        panel.requestWindowFeature(Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(18), dp(18), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(C_BG);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), C_LINE);
        scroll.setBackground(bg);
        scroll.addView(box);
        fillPanel(box);
        panel.setContentView(scroll);
        Window w = panel.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int width = Math.min(getResources().getDisplayMetrics().widthPixels - dp(24), dp(460));
            w.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        panel.setOnDismissListener(d -> {
            if (dirty) applyAndReload();
            applyWindowOptions();
        });
        panel.show();
    }

    private void fillPanel(LinearLayout box) {
        box.removeAllViews();
        box.addView(text("Bots & réglages", 20, C_TEXT, true));
        box.addView(text("Les changements s'appliquent quand tu fermes ce panneau (le jeu se recharge).", 12, C_SUB, false));

        section(box, "BOTS");
        final Switch[] botSwitches = new Switch[BOTS.length];
        for (int i = 0; i < BOTS.length; i++) {
            final String[] b = BOTS[i];
            final int idx = i;
            botSwitches[i] = switchRow(box, b[1], b[2], botOn(b[0]), on -> {
                prefs.edit().putBoolean("bot_" + b[0], on).apply();
                dirty = true;
                if (on) askNotificationPermission();
                // Un seul bot de navigation à la fois (ils se gêneraient)
                if (on) for (int j = 0; j < BOTS.length; j++) {
                    if (j != idx && botSwitches[j] != null && botSwitches[j].isChecked()) botSwitches[j].setChecked(false);
                }
            });
        }

        section(box, "COMBAT");
        optionRow(box, "always_x2", "Toujours en x2", "Chaque combat passe en vitesse x2 tout seul.", true);
        optionRow(box, "always_auto", "Toujours en AUTO", "Chaque combat démarre en AUTO.", false);

        section(box, "MES SCRIPTS");
        JSONArray custom = customScripts();
        if (custom.length() == 0) {
            box.addView(text("Aucun. Ajoute ici ton bot d'arène ou un autre script Tampermonkey.", 12, C_SUB, false));
        }
        for (int i = 0; i < custom.length(); i++) {
            final int idx = i;
            JSONObject c = custom.optJSONObject(i);
            if (c == null) continue;
            final String name = c.optString("name", "Script");
            Switch sw = switchRow(box, name, "Appui long pour supprimer", c.optBoolean("on", true), on -> {
                JSONArray a = customScripts();
                try { a.getJSONObject(idx).put("on", on); } catch (Exception ignored) { }
                saveCustom(a);
                dirty = true;
            });
            View row = (View) sw.getParent();
            row.setOnLongClickListener(v -> {
                new AlertDialog.Builder(this)
                        .setTitle("Supprimer « " + name + " » ?")
                        .setPositiveButton("Supprimer", (d, x) -> {
                            JSONArray a = customScripts();
                            a.remove(idx);
                            saveCustom(a);
                            dirty = true;
                            fillPanel(box);
                        })
                        .setNegativeButton("Annuler", null)
                        .show();
                return true;
            });
        }
        box.addView(button("+ Ajouter un script", false, v -> addScriptDialog(box)));

        section(box, "CONFORT");
        optionRow(box, "remaster", "Remaster des fiches d'unité", "Nouvelle fiche moderne : grande illustration, stats en cartes, compétences lisibles, actions groupées.", true);
        optionRow(box, "infos", "Infos du jeu", "Butin, captures et vagues avant une quête, taux d'invocation (données officielles du jeu).", true);
        optionRow(box, "appfeel", "Style appli", "Boutons qui réagissent, transitions douces, plus de sélection de texte par erreur.", true);
        optionRow(box, "haptic", "Vibrations", "Petite vibration quand tu touches un bouton.", true);
        optionRow(box, "antipause", "Anti-pause", "Le jeu continue même si l'appli passe derrière ou si une notification arrive.", true);
        optionRow(box, "screen_on", "Écran toujours allumé", "L'écran ne se met pas en veille pendant que le jeu est ouvert.", true);
        optionRow(box, "fullscreen", "Plein écran", "Cache les barres du téléphone.", true);
        optionRow(box, "format169", "Format du jeu (16:9)", "Garde les proportions prévues par le jeu : plus de grand vide noir, rien sous la caméra. Le bouton ☰ se range dans la bande du bas.", true);
        optionRow(box, "hd", "Filtre HD", "Images un peu plus nettes et colorées.", false);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(16), 0, 0);
        box.addView(button("Journal de connexion (diagnostic)", false, v -> {
            TextView j = text(prefs.getString("journal", "(vide)"), 11, C_TEXT, false);
            j.setTypeface(Typeface.MONOSPACE);
            j.setTextIsSelectable(true);
            j.setPadding(dp(18), dp(8), dp(18), dp(8));
            ScrollView sv = new ScrollView(this);
            sv.addView(j);
            new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                    .setTitle("Journal de connexion")
                    .setView(sv)
                    .setPositiveButton("Fermer", null)
                    .setNeutralButton("Vider", (d, x) -> prefs.edit().remove("journal").apply())
                    .show();
        }));
        Button reset = button("Oublier le menu", false, v -> {
            if (onGame()) web.evaluateJavascript("try{localStorage.removeItem('rbf_nav')}catch(e){}", null);
            toast("Le menu rapide va réapprendre les rubriques");
        });
        Button close = button("Fermer", true, v -> panel.dismiss());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(44), 1f);
        p.setMargins(dp(3), 0, dp(3), 0);
        actions.addView(reset, p);
        actions.addView(close, new LinearLayout.LayoutParams(p));
        box.addView(actions);
    }

    private void addScriptDialog(LinearLayout box) {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setPadding(dp(18), dp(8), dp(18), 0);
        final EditText code = new EditText(this);
        code.setHint("Colle ici le code du script (tout le texte, de // ==UserScript== jusqu'à la fin)");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setTypeface(Typeface.MONOSPACE);
        code.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        code.setMinLines(6);
        code.setMaxLines(12);
        code.setGravity(Gravity.TOP | Gravity.START);
        Button paste = button("Coller depuis le presse-papiers", false, x -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = cm == null ? null : cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                if (t != null) code.setText(t);
            } else {
                toast("Le presse-papiers est vide");
            }
        });
        v.addView(paste, new LinearLayout.LayoutParams(-1, dp(44)));
        v.addView(code, new LinearLayout.LayoutParams(-1, -2));
        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle("Ajouter un script")
                .setView(v)
                .setPositiveButton("Ajouter", (d, x) -> {
                    String src = code.getText().toString().trim();
                    if (src.isEmpty()) return;
                    String name = "Mon script";
                    Matcher m = Pattern.compile("@name\\s+(.+)").matcher(src);
                    if (m.find()) name = m.group(1).trim();
                    try {
                        JSONArray a = customScripts();
                        JSONObject o = new JSONObject();
                        o.put("name", name);
                        o.put("code", src);
                        o.put("on", true);
                        a.put(o);
                        saveCustom(a);
                    } catch (Exception e) {
                        toast("Script non enregistré");
                        return;
                    }
                    dirty = true;
                    fillPanel(box);
                    toast("« " + name + " » ajouté");
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    // ───────────────────────────── Petits éléments d'interface ─────────────────────────────

    interface OnToggle { void set(boolean on); }

    interface OnNumber { void set(int v); }

    private void section(LinearLayout box, String label) {
        TextView t = text(label, 11, C_GOLD, true);
        t.setLetterSpacing(0.12f);
        t.setPadding(0, dp(18), 0, dp(6));
        box.addView(t);
    }

    private void optionRow(LinearLayout box, String key, String title, String sub, boolean def) {
        switchRow(box, title, sub, opt(key, def), on -> {
            prefs.edit().putBoolean("opt_" + key, on).apply();
            dirty = true;
        });
    }

    private Switch switchRow(LinearLayout box, String title, String sub, boolean checked, OnToggle cb) {
        LinearLayout row = card();
        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.addView(text(title, 15, C_TEXT, true));
        TextView s = text(sub, 12, C_SUB, false);
        s.setPadding(0, dp(2), 0, 0);
        texts.addView(s);
        row.addView(texts, new LinearLayout.LayoutParams(0, -2, 1f));
        Switch sw = new Switch(this);
        sw.setChecked(checked);
        sw.setPadding(dp(10), 0, 0, 0);
        sw.setThumbTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{C_GOLD, 0xFFB0B4C0}));
        sw.setTrackTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{0x88F0B03C, 0xFF3A3F4E}));
        sw.setOnCheckedChangeListener((b, on) -> cb.set(on));
        row.addView(sw);
        row.setOnClickListener(v -> sw.toggle());
        box.addView(row);
        return sw;
    }

    private void numberRow(LinearLayout box, String title, String sub, int value, OnNumber cb) {
        LinearLayout row = card();
        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.addView(text(title, 15, C_TEXT, true));
        texts.addView(text(sub, 12, C_SUB, false));
        row.addView(texts, new LinearLayout.LayoutParams(0, -2, 1f));
        EditText e = new EditText(this);
        e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setText(String.valueOf(value));
        e.setTextColor(C_GOLD);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setGravity(Gravity.CENTER);
        e.setMinWidth(dp(72));
        e.setSelectAllOnFocus(true);
        e.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) { }

            public void onTextChanged(CharSequence s, int a, int b, int c) { }

            public void afterTextChanged(android.text.Editable s) {
                try {
                    int v = Integer.parseInt(s.toString());
                    if (v > 0) cb.set(v);
                } catch (NumberFormatException ignored) { }
            }
        });
        row.addView(e);
        box.addView(row);
    }

    private LinearLayout card() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(12), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(C_CARD);
        bg.setCornerRadius(dp(12));
        row.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(4), 0, dp(4));
        row.setLayoutParams(lp);
        return row;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String label, boolean primary, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTextColor(primary ? 0xFF14161D : C_TEXT);
        if (primary) b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(primary ? C_GOLD : C_CARD);
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), primary ? C_GOLD : C_LINE);
        b.setBackground(bg);
        b.setStateListAnimator(null);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(46));
        lp.setMargins(0, dp(6), 0, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
