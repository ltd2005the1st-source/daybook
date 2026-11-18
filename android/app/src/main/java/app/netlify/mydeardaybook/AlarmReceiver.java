package app.netlify.mydeardaybook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires when a reminder's time comes. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String key = i.getStringExtra("key");
        if (key == null) return;
        Reminders.markFired(c, key);
        Reminders.show(c, key, i.getStringExtra("title"), i.getStringExtra("body"), i.getStringExtra("url"));
    }
}
