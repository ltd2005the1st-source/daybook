package app.netlify.mydeardaybook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are cleared when the phone restarts or the app updates, so set them again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Reminders.rearm(c);
        SyncJob.schedule(c);
        SyncJob.runNow(c);
    }
}
