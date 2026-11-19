package app.netlify.mydeardaybook;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** What the Daybook web page can ask the app to do (window.DaybookAndroid). */
public class Bridge {
    private final MainActivity activity;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String version() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public void setDeviceToken(String token) {
        Reminders.prefs(activity).edit().putString(Reminders.TOKEN, token).apply();
        SyncJob.runNow(activity);
    }

    @JavascriptInterface
    public boolean hasDeviceToken() {
        return Reminders.prefs(activity).getString(Reminders.TOKEN, null) != null;
    }

    @JavascriptInterface
    public void schedule(String json) {
        try {
            Reminders.schedule(activity, new JSONArray(json));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33
            && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return activity.getSystemService(android.app.NotificationManager.class).areNotificationsEnabled();
    }

    @JavascriptInterface
    public void requestNotifications() {
        activity.runOnUiThread(() -> {
            // Asking again only works until it has been refused twice; after that, open the settings page.
            if (Build.VERSION.SDK_INT >= 33 && activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                activity.askForNotifications();
            } else if (Build.VERSION.SDK_INT >= 33
                && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !Reminders.prefs(activity).getBoolean("asked", false)) {
                Reminders.prefs(activity).edit().putBoolean("asked", true).apply();
                activity.askForNotifications();
            } else {
                openNotificationSettings();
            }
        });
    }

    @JavascriptInterface
    public void openNotificationSettings() {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
    }

    @JavascriptInterface
    public void testNotification() {
        Reminders.show(activity, "test:" + System.currentTimeMillis(), "Daybook reminders work",
            "This is how your class and task reminders will look.", "/settings");
    }

    @JavascriptInterface
    public void setDark(boolean dark) {
        activity.runOnUiThread(() -> activity.applyBars(dark));
    }

    /** The page says whether a swipe down from the top may reload (see MainActivity.PULL_JS). */
    @JavascriptInterface
    public void pullAllowed(boolean ok) {
        activity.pullAllowed(ok);
    }

    @JavascriptInterface
    public void reload() {
        activity.runOnUiThread(activity::reload);
    }

    @JavascriptInterface
    public boolean saveFile(String name, String mime, String content) {
        try {
            ContentResolver cr = activity.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return false;
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) return false;
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            v.clear();
            v.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(uri, v, null, null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
