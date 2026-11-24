package be.adriano.rebornbf;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
import android.view.MotionEvent;
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
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
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

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reborn BF : le jeu rebornbf.com dans sa propre appli, plein écran, avec un panneau
 * pour activer / couper les bots proprement.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://rebornbf.com/home";
    private static final Set<String> ORIGINS =
            new HashSet<>(Arrays.asList("https://rebornbf.com", "https://*.rebornbf.com"));

    // Bots intégrés : id, titre, description, fichier, lancé dès le début du chargement
    private static final String[][] BOTS = {
            {"farm", "Farm quête",
                    "Relance la même quête par séries de 30 jusqu'à l'objectif. Ouvre une quête puis touche le badge « Farm » en haut à droite pour démarrer.",
                    "farm.js", "0"},
            {"aventure", "Aventure auto",
                    "Avance seul dans l'histoire, en AUTO et x2. Attend l'énergie, ne dépense jamais de gemmes. Badge en bas à gauche.",
                    "aventure.js", "1"},
    };

    private SharedPreferences prefs;
    private WebView web;
    private TextView fab;
    private Dialog panel;
    private Dialog popup;
    private ScriptHandler scriptHandler;
    private String injection = "";
    private boolean docStartSupported;
    private boolean dirty;

    // ───────────────────────────── Cycle de vie ─────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("rbf", MODE_PRIVATE);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        setupWeb(web);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        fab = buildFab();
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(46), dp(46), Gravity.BOTTOM | Gravity.END);
        lp.setMargins(0, 0, dp(14), dp(70));
        root.addView(fab, lp);
        setContentView(root);

        docStartSupported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
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
        if (!opt("antipause", true)) web.onPause();
    }

    @Override
    protected void onDestroy() {
        if (popup != null) popup.dismiss();
        if (panel != null) panel.dismiss();
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
        w.setWebViewClient(new GameClient(false));
        w.setWebChromeClient(new GameChrome());
    }

    /** Domaines qui restent dans l'appli (le jeu + la connexion Google). */
    private static boolean inApp(Uri u) {
        String h = u.getHost();
        if (h == null) return true;
        h = h.toLowerCase();
        return h.equals("rebornbf.com") || h.endsWith(".rebornbf.com")
                || h.equals("google.com") || h.endsWith(".google.com") || h.contains(".google.")
                || h.endsWith(".gstatic.com") || h.endsWith(".googleusercontent.com")
                || h.endsWith(".googleapis.com") || h.endsWith(".firebaseapp.com")
                || h.equals("accounts.youtube.com");
    }

    private class GameClient extends WebViewClient {
        private final boolean isPopup;

        GameClient(boolean isPopup) { this.isPopup = isPopup; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("http") || scheme.equals("https")) {
                // Redirections et navigations du jeu (connexion…) : on reste dans l'appli.
                // Un lien touché vers un autre site s'ouvre dans le navigateur.
                if (inApp(u) || req.isRedirect() || !req.hasGesture()) {
                    // Popup de connexion revenue sur le jeu → on ramène tout dans la fenêtre principale
                    if (isPopup && isGame(u) && popup != null) {
                        web.loadUrl(u.toString());
                        popup.dismiss();
                        return true;
                    }
                    return false;
                }
            }
            openExternal(u);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!isPopup && !docStartSupported && url != null && isGame(Uri.parse(url))) {
                view.evaluateJavascript(injection, null);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Le moteur du jeu a planté : on relance proprement au lieu de fermer l'appli
            if (!isPopup) recreate();
            return true;
        }
    }

    private static boolean isGame(Uri u) {
        String h = u.getHost();
        return h != null && (h.equals("rebornbf.com") || h.endsWith(".rebornbf.com"));
    }

    private class GameChrome extends WebChromeClient {
        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, Message resultMsg) {
            // Fenêtre de connexion (popup Google) ouverte par-dessus le jeu
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
            popup.setContentView(child);
            popup.setOnDismissListener(d -> {
                child.destroy();
                popup = null;
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
        String body = "try{\n" + code + "\n}catch(e){console.error('[RBF] " + label + "',e)}\n";
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
        // Petites compatibilités Tampermonkey pour les scripts ajoutés à la main
        sb.append("window.unsafeWindow=window;")
          .append("window.GM_addStyle=window.GM_addStyle||function(c){var s=document.createElement('style');s.textContent=c;(document.head||document.documentElement).appendChild(s);return s;};")
          .append("window.GM_getValue=window.GM_getValue||function(k,d){try{var v=localStorage.getItem('gm_'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}};")
          .append("window.GM_setValue=window.GM_setValue||function(k,v){try{localStorage.setItem('gm_'+k,JSON.stringify(v));}catch(e){}};")
          .append("window.GM_deleteValue=window.GM_deleteValue||function(k){try{localStorage.removeItem('gm_'+k);}catch(e){}};\n");

        if (opt("antipause", true)) sb.append(wrap(asset("antipause.js"), true, "anti-pause"));
        if (opt("hd", false)) sb.append(wrap(asset("hd.js"), false, "filtre HD"));
        for (String[] b : BOTS) {
            if (botOn(b[0])) sb.append(wrap(asset(b[3]), "1".equals(b[4]), b[1]));
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
        sb.append("})();");
        return sb.toString();
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
        int target = prefs.getInt("farm_target", 300);
        String js = "try{"
                + "localStorage.setItem('rbf_adv_actif','" + (botOn("aventure") ? "1" : "0") + "');"
                + "var k='bfrRepeatBot',s=JSON.parse(localStorage.getItem(k)||'{}');"
                + "s.target=" + target + ";" + (botOn("farm") ? "" : "s.on=false;")
                + "localStorage.setItem(k,JSON.stringify(s));"
                + "}catch(e){}";
        String url = web.getUrl();
        if (url != null && isGame(Uri.parse(url))) web.evaluateJavascript(js, v -> web.reload());
        else web.loadUrl(HOME);
        toast("Réglages appliqués");
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
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams a = w.getAttributes();
            a.layoutInDisplayCutoutMode = full
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
            w.setAttributes(a);
        }
    }

    // ───────────────────────────── Bouton flottant ─────────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    private TextView buildFab() {
        TextView b = new TextView(this);
        b.setText("☰");
        b.setTextColor(0xFFF0B03C);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xE60E1016);
        bg.setStroke(dp(1), 0x66F0B03C);
        b.setBackground(bg);
        b.setAlpha(0.8f);
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
                        if (!dragging && Math.hypot(dx, dy) > slop) dragging = true;
                        if (dragging) {
                            v.setTranslationX(startTx + dx);
                            v.setTranslationY(startTy + dy);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        v.setAlpha(0.8f);
                        if (!dragging) openPanel();
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        v.setAlpha(0.8f);
                        return true;
                }
                return false;
            }
        });
        return b;
    }

    // ───────────────────────────── Panneau des bots ─────────────────────────────

    private static final int C_BG = 0xFF14161D, C_CARD = 0xFF1C1F28, C_TEXT = 0xFFE6E8EE,
            C_SUB = 0xFF8A8FA0, C_GOLD = 0xFFF0B03C, C_LINE = 0xFF262A36;

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
        TextView title = text("Reborn BF", 20, C_TEXT, true);
        box.addView(title);
        box.addView(text("Les changements s'appliquent quand tu fermes ce panneau (le jeu se recharge).", 12, C_SUB, false));

        section(box, "BOTS");
        final Switch[] botSwitches = new Switch[BOTS.length];
        for (int i = 0; i < BOTS.length; i++) {
            final String[] b = BOTS[i];
            final int idx = i;
            botSwitches[i] = switchRow(box, b[1], b[2], botOn(b[0]), on -> {
                prefs.edit().putBoolean("bot_" + b[0], on).apply();
                dirty = true;
                // Un seul bot de navigation à la fois (ils se gêneraient)
                if (on) for (int j = 0; j < BOTS.length; j++) {
                    if (j != idx && botSwitches[j] != null && botSwitches[j].isChecked()) botSwitches[j].setChecked(false);
                }
            });
        }
        numberRow(box, "Objectif du farm", "Nombre total de combats avant l'arrêt", prefs.getInt("farm_target", 300), v -> {
            prefs.edit().putInt("farm_target", v).apply();
            dirty = true;
        });

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

        section(box, "OPTIONS");
        optionRow(box, "antipause", "Anti-pause", "Le jeu continue même si l'appli passe derrière ou si une notification arrive.", true);
        optionRow(box, "screen_on", "Écran toujours allumé", "L'écran ne se met pas en veille pendant que le jeu est ouvert.", true);
        optionRow(box, "fullscreen", "Plein écran", "Cache les barres du téléphone.", true);
        optionRow(box, "hd", "Filtre HD", "Images un peu plus nettes et colorées.", false);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(16), 0, 0);
        Button home = button("Accueil", false, v -> {
            web.loadUrl(HOME);
            panel.dismiss();
        });
        Button reload = button("Recharger", false, v -> {
            dirty = true;
            panel.dismiss();
        });
        Button close = button("Fermer", true, v -> panel.dismiss());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(44), 1f);
        p.setMargins(dp(3), 0, dp(3), 0);
        actions.addView(home, p);
        actions.addView(reload, new LinearLayout.LayoutParams(p));
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
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(primary ? C_GOLD : C_CARD);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), primary ? C_GOLD : C_LINE);
        b.setBackground(bg);
        b.setStateListAnimator(null);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(44));
        lp.setMargins(0, dp(6), 0, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
