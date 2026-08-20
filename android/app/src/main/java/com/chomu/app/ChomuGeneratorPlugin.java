package com.chomu.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Bridge between the web UI and {@link GenerationService}.
 *
 * The service owns the request once it starts, so the UI's job is only to
 * hand work over and, on the next launch, collect whatever finished while it
 * was gone.
 */
@CapacitorPlugin(name = "ChomuGenerator")
public class ChomuGeneratorPlugin extends Plugin {

    private static final String TAG = "ChomuGeneratorPlugin";

    @PluginMethod
    public void startGeneration(PluginCall call) {
        String jobId = call.getString("jobId");
        String prompt = call.getString("prompt");
        String apiKey = call.getString("apiKey");
        Integer ssSteps = call.getInt("ssSteps", 35);
        Integer slatSteps = call.getInt("slatSteps", 35);

        if (jobId == null || prompt == null || apiKey == null) {
            call.reject("jobId, prompt and apiKey are required");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, GenerationService.class);
        intent.putExtra(GenerationService.EXTRA_JOB_ID, jobId);
        intent.putExtra(GenerationService.EXTRA_PROMPT, prompt);
        intent.putExtra(GenerationService.EXTRA_API_KEY, apiKey);
        intent.putExtra(GenerationService.EXTRA_SS_STEPS, ssSteps);
        intent.putExtra(GenerationService.EXTRA_SLAT_STEPS, slatSteps);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Could not start generation service", e);
            call.reject("Could not start the background generation service: " + e.getMessage(), e);
        }
    }

    /** Every job the service has written state for, finished or still running. */
    @PluginMethod
    public void getJobs(PluginCall call) {
        JSArray jobs = new JSArray();
        File dir = GenerationService.jobsDir(getContext());
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));

        if (files != null) {
            for (File f : files) {
                try {
                    JSONObject json = new JSONObject(readFile(f));
                    jobs.put(json);
                } catch (Exception e) {
                    Log.w(TAG, "Skipping unreadable job file " + f.getName(), e);
                }
            }
        }

        JSObject result = new JSObject();
        result.put("jobs", jobs);
        // Lets the web layer tell a live job apart from one whose process was
        // killed — a "pending" file with no service behind it is orphaned.
        result.put("serviceRunning", GenerationService.isRunning());
        call.resolve(result);
    }

    /**
     * Clears an ongoing-generation notification left behind by a process that
     * was killed mid-job. Because the service's running flag is per-process,
     * a false here after a restart means nothing is actually generating and
     * any surviving notification is stale.
     */
    @PluginMethod
    public void clearOrphanedNotifications(PluginCall call) {
        JSObject result = new JSObject();
        if (GenerationService.isRunning()) {
            result.put("cleared", false);
            call.resolve(result);
            return;
        }
        try {
            NotificationManager nm =
                    (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(GenerationService.PROGRESS_NOTIFICATION_ID);
            result.put("cleared", true);
        } catch (Exception e) {
            Log.w(TAG, "Could not clear orphaned notification", e);
            result.put("cleared", false);
        }
        call.resolve(result);
    }

    /**
     * Returns a finished job's GLB as base64 and deletes it from disk — the
     * web layer copies it into its own IndexedDB history, so keeping a second
     * copy here would just leak storage.
     */
    @PluginMethod
    public void consumeJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("jobId is required");
            return;
        }

        File dir = GenerationService.jobsDir(getContext());
        File stateFile = new File(dir, jobId + ".json");
        File glbFile = new File(dir, jobId + ".glb");

        JSObject result = new JSObject();
        try {
            if (glbFile.exists()) {
                byte[] bytes = readFileBytes(glbFile);
                result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            }
            if (stateFile.exists()) {
                JSONObject json = new JSONObject(readFile(stateFile));
                result.put("status", json.optString("status"));
                result.put("prompt", json.optString("prompt"));
                result.put("seed", json.optInt("seed", 0));
                if (json.has("error")) result.put("error", json.optString("error"));
            }
        } catch (Exception e) {
            call.reject("Could not read the finished job: " + e.getMessage(), e);
            return;
        }

        // Best-effort cleanup; a leftover file just reappears next listing.
        //noinspection ResultOfMethodCallIgnored
        glbFile.delete();
        //noinspection ResultOfMethodCallIgnored
        stateFile.delete();

        call.resolve(result);
    }

    private static String readFile(File f) throws Exception {
        return new String(readFileBytes(f), StandardCharsets.UTF_8);
    }

    private static byte[] readFileBytes(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int read;
            while ((read = in.read(buf)) != -1) out.write(buf, 0, read);
            return out.toByteArray();
        }
    }
}
