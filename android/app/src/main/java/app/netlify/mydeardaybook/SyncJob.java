package app.netlify.mydeardaybook;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * About every 15 minutes (whenever there's internet), fetches the next two days of reminders
 * from Daybook, so changes made on another device reach this phone's alarms.
 */
public class SyncJob extends JobService {
    private static final int PERIODIC = 1;
    private static final int ONCE = 2;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js.getPendingJob(PERIODIC) != null) return;
        js.schedule(new JobInfo.Builder(PERIODIC, new ComponentName(c, SyncJob.class))
            .setPeriodic(15 * 60 * 1000L)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .build());
    }

    static void runNow(Context c) {
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(ONCE, new ComponentName(c, SyncJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setOverrideDeadline(60 * 1000L)
            .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        String token = Reminders.prefs(this).getString(Reminders.TOKEN, null);
        if (token == null) return false;
        new Thread(() -> {
            boolean retry = false;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(BuildConfig.SITE + "/api/device").openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(20000);
                conn.setRequestProperty("Authorization", "Bearer " + token);
                int code = conn.getResponseCode();
                if (code == 200) {
                    JSONArray list = new JSONObject(read(conn.getInputStream())).getJSONArray("reminders");
                    Reminders.schedule(this, list);
                } else if (code == 401) {
                    // The key no longer works: the web page will hand over a new one next time it opens.
                    Reminders.prefs(this).edit().remove(Reminders.TOKEN).apply();
                } else {
                    retry = true;
                }
                conn.disconnect();
            } catch (Exception e) {
                retry = true;
            }
            jobFinished(params, retry && params.getJobId() == ONCE);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString(StandardCharsets.UTF_8.name());
    }
}
