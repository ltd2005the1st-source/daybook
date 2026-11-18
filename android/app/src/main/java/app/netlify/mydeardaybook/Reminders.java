package app.netlify.mydeardaybook;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Reminders are set as alarms on the phone, so they arrive even with no internet. */
final class Reminders {
    static final String TOKEN = "deviceToken";
    private static final String LIST = "scheduled";
    private static final String FIRED = "fired";
    private static final String CHANNEL = "reminders";

    private Reminders() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("daybook", Context.MODE_PRIVATE);
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_reminders_desc));
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent alarmIntent(Context c, JSONObject r) {
        Intent i = new Intent(c, AlarmReceiver.class)
            .setData(Uri.parse("daybook://reminder/" + Uri.encode(r.optString("key"))))
            .putExtra("key", r.optString("key"))
            .putExtra("title", r.optString("title"))
            .putExtra("body", r.optString("body"))
            .putExtra("url", r.optString("url", "/"));
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Replaces everything scheduled with this list of {key, when, title, body, url}. */
    static synchronized void schedule(Context c, JSONArray list) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        SharedPreferences p = prefs(c);
        try {
            JSONArray old = new JSONArray(p.getString(LIST, "[]"));
            for (int i = 0; i < old.length(); i++) am.cancel(alarmIntent(c, old.getJSONObject(i)));
        } catch (Exception ignored) {
        }

        long now = System.currentTimeMillis();
        Set<String> fired = new HashSet<>(p.getStringSet(FIRED, new HashSet<>()));
        Set<String> keep = new HashSet<>();
        JSONArray saved = new JSONArray();
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            long when = r.optLong("when");
            String key = r.optString("key");
            if (fired.contains(key)) { keep.add(key); continue; }
            if (when <= now) continue;
            PendingIntent pi = alarmIntent(c, r);
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            saved.put(r);
        }
        // Remember only fired reminders still in the window, so the list stays small.
        p.edit().putString(LIST, saved.toString()).putStringSet(FIRED, keep).apply();
    }

    /** Sets the saved alarms again (after a restart or an app update). */
    static void rearm(Context c) {
        try {
            schedule(c, new JSONArray(prefs(c).getString(LIST, "[]")));
        } catch (Exception ignored) {
        }
    }

    static synchronized void markFired(Context c, String key) {
        SharedPreferences p = prefs(c);
        Set<String> fired = new HashSet<>(p.getStringSet(FIRED, new HashSet<>()));
        fired.add(key);
        p.edit().putStringSet(FIRED, fired).apply();
    }

    static void show(Context c, String key, String title, String body, String url) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class)
            .setData(Uri.parse("daybook://open/" + Uri.encode(key)))
            .putExtra(MainActivity.EXTRA_PATH, url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String first = body == null ? "" : body.split("\n", 2)[0];
        Notification n = new Notification.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification_icon)
            .setColor(0xFFE0583F)
            .setContentTitle(title)
            .setContentText(first)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(tap)
            .build();
        try {
            c.getSystemService(NotificationManager.class).notify(key.hashCode(), n);
        } catch (SecurityException ignored) {
            // Notifications not allowed yet.
        }
    }
}
