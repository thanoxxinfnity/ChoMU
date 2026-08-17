package com.chomu.app;

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
import android.util.Base64;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs a TRELLIS generation entirely in native code, independent of the
 * WebView.
 *
 * The JS implementation could only ever survive the app being *backgrounded*
 * — once the user swipes the app away or the OS reclaims it, the WebView and
 * every pending JS promise are destroyed with it, so the request died and the
 * job sat "pending" until the stale-job watchdog gave up. A Service with its
 * own thread and wake lock is not tied to the WebView's lifecycle at all, so
 * the HTTP call, the retries, and writing the result to disk all continue
 * after the app is gone. The next time ChoMU opens it picks the finished
 * result up off disk.
 */
public class GenerationService extends Service {

    private static final String TAG = "ChomuGeneration";
    private static final String TRELLIS_URL = "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";

    private static final String CHANNEL_PROGRESS = "chomu-generation";
    private static final String CHANNEL_DONE = "chomu-generation-done";
    private static final int PROGRESS_NOTIFICATION_ID = 4301;

    /** Matches the JS-side cap so both paths behave identically. */
    private static final int MAX_ATTEMPTS = 10;
    private static final int TIMEOUT_MS = 300_000;

    public static final String EXTRA_JOB_ID = "jobId";
    public static final String EXTRA_PROMPT = "prompt";
    public static final String EXTRA_API_KEY = "apiKey";
    public static final String EXTRA_SS_STEPS = "ssSteps";
    public static final String EXTRA_SLAT_STEPS = "slatSteps";

    private ExecutorService executor;
    private PowerManager.WakeLock wakeLock;
    private int activeJobs = 0;

    /** Where finished jobs wait for the app to come back and collect them. */
    static File jobsDir(Context context) {
        File dir = new File(context.getFilesDir(), "chomu_jobs");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        executor = Executors.newSingleThreadExecutor();
        createChannels();

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChoMU::Generation");
        wakeLock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // Restarted by the OS with no work to redo.
            stopSelf();
            return START_NOT_STICKY;
        }

        final String jobId = intent.getStringExtra(EXTRA_JOB_ID);
        final String prompt = intent.getStringExtra(EXTRA_PROMPT);
        final String apiKey = intent.getStringExtra(EXTRA_API_KEY);
        final int ssSteps = intent.getIntExtra(EXTRA_SS_STEPS, 35);
        final int slatSteps = intent.getIntExtra(EXTRA_SLAT_STEPS, 35);

        if (jobId == null || prompt == null || apiKey == null) {
            Log.w(TAG, "Missing job parameters, ignoring start request");
            if (activeJobs == 0) stopSelf();
            return START_NOT_STICKY;
        }

        startAsForeground(prompt);
        if (!wakeLock.isHeld()) wakeLock.acquire(30 * 60 * 1000L);
        activeJobs++;

        writeJobState(jobId, "pending", prompt, null, null, 0);

        executor.execute(() -> {
            try {
                runJob(jobId, prompt, apiKey, ssSteps, slatSteps);
            } catch (Throwable t) {
                Log.e(TAG, "Job " + jobId + " crashed", t);
                writeJobState(jobId, "error", prompt, null, "Unexpected error: " + t.getMessage(), 0);
                notifyDone("Generation failed", prompt);
            } finally {
                finishJob();
            }
        });

        // START_REDELIVER_INTENT would re-run a job the user can no longer see
        // the progress of; a job that dies with the process is reported as a
        // failure on next launch instead of being silently retried.
        return START_NOT_STICKY;
    }

    private void runJob(String jobId, String prompt, String apiKey, int ssSteps, int slatSteps) {
        String lastError = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            updateProgress(prompt, attempt);
            writeJobState(jobId, "pending", prompt, null, null, attempt);

            HttpURLConnection conn = null;
            try {
                JSONObject body = new JSONObject();
                body.put("prompt", prompt);
                body.put("ss_sampling_steps", ssSteps);
                body.put("slat_sampling_steps", slatSteps);

                conn = (HttpURLConnection) new URL(TRELLIS_URL).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(60_000);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setDoOutput(true);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int status = conn.getResponseCode();

                if (status == 200) {
                    String response = readStream(conn.getInputStream());
                    JSONObject json = new JSONObject(response);
                    JSONArray artifacts = json.optJSONArray("artifacts");
                    if (artifacts == null || artifacts.length() == 0) {
                        lastError = "NVIDIA returned no model data.";
                        break;
                    }
                    JSONObject artifact = artifacts.getJSONObject(0);
                    String finishReason = artifact.optString("finishReason", "");
                    String base64 = artifact.optString("base64", "");

                    if ("CONTENT_FILTERED".equals(finishReason) || base64.isEmpty()) {
                        lastError = "NVIDIA's safety filter rejected this prompt, so no model was produced. "
                                + "Try rewording it.";
                        break;
                    }

                    File glb = new File(jobsDir(this), jobId + ".glb");
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    try (FileOutputStream fos = new FileOutputStream(glb)) {
                        fos.write(bytes);
                    }

                    writeJobState(jobId, "success", prompt, glb.getAbsolutePath(), null,
                            artifact.optInt("seed", 0));
                    notifyDone("Your 3D model is ready", prompt);
                    return;
                }

                if (status >= 500) {
                    lastError = "NVIDIA's servers returned an error after " + MAX_ATTEMPTS + " attempts "
                            + "(their hosted endpoint failing, not a ChoMU bug). Wait a while and try again.";
                    // fall through to retry
                } else if (status == 401 || status == 403) {
                    lastError = "Invalid or expired NVIDIA API key. Update it in Settings.";
                    break;
                } else if (status == 429) {
                    lastError = "Rate limited by NVIDIA. Wait a moment and try again.";
                    // worth retrying
                } else {
                    lastError = "NVIDIA rejected the request (HTTP " + status + "): "
                            + readStream(conn.getErrorStream());
                    break;
                }
            } catch (Exception e) {
                // Connection-level failure (TLS reset on a network handoff,
                // DNS, timeout) — a fresh connection on the next attempt
                // routinely succeeds.
                lastError = "Network error reaching NVIDIA: " + e.getMessage();
                Log.w(TAG, "Attempt " + attempt + " failed for " + jobId, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }

        writeJobState(jobId, "error", prompt, null,
                lastError != null ? lastError : "Generation failed.", 0);
        notifyDone("Generation failed", prompt);
    }

    private void finishJob() {
        activeJobs--;
        if (activeJobs <= 0) {
            activeJobs = 0;
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private static String readStream(InputStream in) {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        } catch (Exception e) {
            Log.w(TAG, "Failed reading response stream", e);
        }
        return sb.toString();
    }

    /** One JSON file per job, so results survive the process dying. */
    private void writeJobState(String jobId, String status, String prompt, String glbPath,
                               String error, int attemptOrSeed) {
        try {
            JSONObject json = new JSONObject();
            json.put("jobId", jobId);
            json.put("status", status);
            json.put("prompt", prompt);
            json.put("updatedAt", System.currentTimeMillis());
            if (glbPath != null) json.put("glbPath", glbPath);
            if (error != null) json.put("error", error);
            if ("success".equals(status)) {
                json.put("seed", attemptOrSeed);
            } else {
                json.put("attempt", attemptOrSeed);
            }

            File f = new File(jobsDir(this), jobId + ".json");
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed writing job state for " + jobId, e);
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        NotificationChannel progress = new NotificationChannel(
                CHANNEL_PROGRESS, "Generation progress", NotificationManager.IMPORTANCE_LOW);
        progress.setDescription("Shown while ChoMU is generating in the background");
        progress.setSound(null, null);
        nm.createNotificationChannel(progress);

        NotificationChannel done = new NotificationChannel(
                CHANNEL_DONE, "Generation finished", NotificationManager.IMPORTANCE_DEFAULT);
        done.setDescription("Alerts you when a generation completes");
        nm.createNotificationChannel(done);
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 0, intent, flags);
    }

    private Notification buildProgressNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_PROGRESS)
                .setContentTitle("ChoMU is generating")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_chomu)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(openAppIntent())
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void startAsForeground(String prompt) {
        Notification notification = buildProgressNotification(prompt);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(PROGRESS_NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(PROGRESS_NOTIFICATION_ID, notification);
        }
    }

    private void updateProgress(String prompt, int attempt) {
        String text = attempt > 1 ? "Server busy — retry " + attempt + " of " + MAX_ATTEMPTS : prompt;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(PROGRESS_NOTIFICATION_ID, buildProgressNotification(text));
    }

    private void notifyDone(String title, String prompt) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_DONE)
                .setContentTitle(title)
                .setContentText(prompt)
                .setSmallIcon(R.drawable.ic_stat_chomu)
                .setAutoCancel(true)
                .setContentIntent(openAppIntent())
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();
        nm.notify((int) (System.currentTimeMillis() % 100000), n);
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (executor != null) executor.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
