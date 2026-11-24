package io.github.mqt3.saldo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "SaldoAndroid")
public class SaldoAndroidPlugin extends Plugin {
    private static final String RELEASES = "https://github.com/1mqt3/Saldo/releases/download/";
    private static final int MAX_APK_BYTES = 80 * 1024 * 1024;
    private static final List<String> DOWNLOAD_HOSTS = Arrays.asList(
        "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
    );
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean installing = new AtomicBoolean();

    private record Release(String version, int code, String url, String digest) {}

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = ownPackage(0);
            JSObject result = new JSObject();
            result.put("version", info.versionName);
            result.put("code", PackageInfoCompat.getLongVersionCode(info));
            result.put("hasUpdateBackup", updateBackup().getBaseFile().isFile());
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Не удалось прочитать версию приложения.");
        }
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        String json = call.getString("json");
        String name = call.getString("name", "saldo.json");
        if (json == null || json.isEmpty() || !name.matches("saldo(-[0-9-]+)?\\.json")) {
            call.reject("Не удалось подготовить файл копии.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "saveBackupResult");
        } catch (ActivityNotFoundException error) {
            call.reject("На устройстве недоступен выбор места сохранения.");
        }
    }

    @ActivityCallback
    private void saveBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            call.resolve(cancelled);
            return;
        }
        io.execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new IOException();
                stream.write(call.getString("json").getBytes(StandardCharsets.UTF_8));
            } catch (IOException | SecurityException error) {
                call.reject("Не удалось записать файл копии.");
                return;
            }
            JSObject saved = new JSObject();
            saved.put("saved", true);
            call.resolve(saved);
        });
    }

    @PluginMethod
    public void readUpdateBackup(PluginCall call) {
        io.execute(() -> {
            try {
                JSObject result = new JSObject();
                result.put("json", new String(updateBackup().readFully(), StandardCharsets.UTF_8));
                call.resolve(result);
            } catch (IOException error) {
                call.reject("Не удалось прочитать копию перед обновлением.");
            }
        });
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        if (!installing.compareAndSet(false, true)) {
            call.reject("Обновление уже загружается.");
            return;
        }
        try {
            readRelease(call);
            if (!canInstall()) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                startActivityForResult(call, intent, "installPermissionResult");
                return;
            }
            prepareInstaller(call);
        } catch (ActivityNotFoundException | SecurityException error) {
            rejectInstall(call, "Не удалось открыть настройки установки приложений.");
        } catch (IllegalArgumentException error) {
            rejectInstall(call, "Данные о выпуске Android не прошли проверку.");
        }
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            installing.set(false);
            return;
        }
        if (!canInstall()) {
            rejectInstall(call, "Разрешите установку приложений из «Сальдо» и повторите попытку.");
            return;
        }
        prepareInstaller(call);
    }

    private void prepareInstaller(PluginCall call) {
        io.execute(() -> {
            try {
                Release release = readRelease(call);
                int signingFlag = Build.VERSION.SDK_INT >= 28
                    ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
                PackageInfo installed = ownPackage(signingFlag);
                if (release.code() <= PackageInfoCompat.getLongVersionCode(installed)) {
                    rejectInstall(call, "Эта версия уже установлена или устарела.");
                    return;
                }

                File directory = new File(getContext().getCacheDir(), "saldo-updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException();
                File pending = new File(directory, "update-part.apk");
                File apk = new File(directory, "update.apk");
                try {
                    download(release, pending);
                    verifyApk(pending, release, signingFlag, installed);
                    if (!pending.renameTo(apk)) throw new IOException();
                } finally {
                    pending.delete();
                }

                try {
                    writeUpdateBackup(call.getString("backup"));
                } catch (IOException error) {
                    rejectInstall(call, "Не удалось сохранить копию перед обновлением.");
                    return;
                }
                getActivity().runOnUiThread(() -> openInstaller(call, apk));
            } catch (IllegalArgumentException error) {
                rejectInstall(call, "APK не прошёл проверку версии или подписи.");
            } catch (IOException | GeneralSecurityException | PackageManager.NameNotFoundException | SecurityException error) {
                rejectInstall(call, "Не удалось скачать APK. Проверьте интернет и свободное место.");
            }
        });
    }

    private void openInstaller(PluginCall call, File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            installing.set(false);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException | IllegalArgumentException error) {
            rejectInstall(call, "Не удалось открыть системный установщик Android.");
        }
    }

    private void rejectInstall(PluginCall call, String message) {
        installing.set(false);
        call.reject(message);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private static Release readRelease(PluginCall call) {
        JSObject release = call.getObject("release");
        if (release == null || call.getString("backup", "").isEmpty()) throw new IllegalArgumentException();
        String version = release.optString("version");
        String url = release.optString("url");
        String digest = release.optString("digest", "");
        int code = release.optInt("code");
        if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || code < 1 || code > 2_100_000_000
            || !url.equals(RELEASES + "android-v" + version + "/saldo-" + version + "-vc" + code + ".apk")
            || (!digest.isEmpty() && !digest.matches("[a-f0-9]{64}"))) {
            throw new IllegalArgumentException();
        }
        return new Release(version, code, url, digest);
    }

    private static void download(Release release, File destination) throws IOException, GeneralSecurityException {
        URL url = new URL(release.url());
        long start = SystemClock.elapsedRealtime();
        for (int redirect = 0; redirect < 6; redirect++) {
            if (!"https".equals(url.getProtocol()) || !DOWNLOAD_HOSTS.contains(url.getHost())
                || url.getUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443)) {
                throw new IllegalArgumentException();
            }
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15_000);
                connection.setReadTimeout(15_000);
                connection.setRequestProperty("User-Agent", "Saldo Android");
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException();
                    url = new URL(url, location);
                    continue;
                }
                if (status != 200 || connection.getContentLength() > MAX_APK_BYTES) throw new IOException();
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(destination)) {
                    byte[] buffer = new byte[32768];
                    int received = 0;
                    for (int count; (count = input.read(buffer)) != -1;) {
                        received += count;
                        if (received > MAX_APK_BYTES || SystemClock.elapsedRealtime() - start > 180_000
                            || Thread.currentThread().isInterrupted()) throw new IOException();
                        output.write(buffer, 0, count);
                        hash.update(buffer, 0, count);
                    }
                }
                if (!release.digest().isEmpty()) {
                    StringBuilder actual = new StringBuilder();
                    for (byte value : hash.digest()) actual.append(String.format(Locale.ROOT, "%02x", value));
                    if (!release.digest().contentEquals(actual)) throw new IllegalArgumentException();
                }
                return;
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException();
    }

    private void verifyApk(File file, Release release, int flags, PackageInfo installed) {
        PackageInfo candidate = getContext().getPackageManager().getPackageArchiveInfo(file.getPath(), flags);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)
            || PackageInfoCompat.getLongVersionCode(candidate) != release.code()
            || !release.version().equals(candidate.versionName)) throw new IllegalArgumentException();
        Signature[] existing = signatures(installed);
        Signature[] incoming = signatures(candidate);
        if (existing == null || existing.length == 0 || !Arrays.equals(existing, incoming)) {
            throw new IllegalArgumentException();
        }
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT < 28) return info.signatures;
        return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
    }

    @SuppressWarnings("deprecation")
    private PackageInfo ownPackage(int flags) throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags);
    }

    private AtomicFile updateBackup() {
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "before-update.json"));
    }

    private void writeUpdateBackup(String json) throws IOException {
        AtomicFile file = updateBackup();
        FileOutputStream output = file.startWrite();
        try {
            output.write(json.getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (IOException | RuntimeException error) {
            file.failWrite(output);
            throw error;
        }
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
    }
}
