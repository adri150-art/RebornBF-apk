package be.adriano.rebornbf;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Garde l'appli éveillée quand elle passe en arrière-plan (écran éteint compris),
 * pour que le jeu et les bots continuent de tourner. Une notification indique que c'est actif.
 */
public class KeepAliveService extends Service {
    private PowerManager.WakeLock lock;

    public static void start(Context c) {
        Intent i = new Intent(c, KeepAliveService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception e) { /* refusé par le système : tant pis */ }
    }

    public static void stop(Context c) {
        try { c.stopService(new Intent(c, KeepAliveService.class)); } catch (Exception e) { /* rien */ }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(new NotificationChannel("keepalive", "Jeu en arrière-plan", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "keepalive")
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("Reborn BF continue de jouer")
                .setContentText("Le jeu et tes bots tournent en arrière-plan. Touche pour revenir.")
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(42, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (lock == null) {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RebornBF:jeu");
                lock.setReferenceCounted(false);
                lock.acquire(6 * 60 * 60 * 1000L); // 6 h maximum par sécurité
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        super.onDestroy();
    }

    /** L'appli est fermée depuis les applis récentes : tout s'arrête, notification comprise. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopForeground(true);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
