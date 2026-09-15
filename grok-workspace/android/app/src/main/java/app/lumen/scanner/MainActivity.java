package app.lumen.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
  static final String APP_HOST = "https://appassets.androidplatform.net/www/index.html";
  private static final String APP_SCHEME = "https";
  private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
  private static final String APP_ORIGIN = APP_SCHEME + "://" + APP_ASSET_HOST;
  private static final long MAX_TRANSFER_BYTES = 128L * 1024L * 1024L;
  private static final long MAX_TOTAL_TRANSFER_BYTES = 192L * 1024L * 1024L;
  private static final int MAX_CONCURRENT_TRANSFERS = 2;
  private WebView webView;
  private ValueCallback<Uri[]> filePathCallback;
  private PermissionRequest pendingWebPermission;
  private final PendingTransferSlot<NativeTransfer> pendingSave =
      new PendingTransferSlot<>(transfer -> transfer.id);
  private WebViewAssetLoader assetLoader;
  private final Map<String, NativeTransfer> transfers = new HashMap<>();

  private static final class NativeTransfer {
    final String id;
    final String action;
    final String filename;
    final String mime;
    final String title;
    final long expectedSize;
    final File file;
    final JavaScriptReplyProxy replyProxy;
    FileOutputStream output;
    long written;

    NativeTransfer(
        String id,
        String action,
        String filename,
        String mime,
        String title,
        long expectedSize,
        File file,
        FileOutputStream output,
        JavaScriptReplyProxy replyProxy) {
      this.id = id;
      this.action = action;
      this.filename = filename;
      this.mime = mime;
      this.title = title;
      this.expectedSize = expectedSize;
      this.file = file;
      this.output = output;
      this.replyProxy = replyProxy;
    }
  }

  private final ActivityResultLauncher<Intent> fileChooserLauncher =
      registerForActivityResult(
          new ActivityResultContracts.StartActivityForResult(),
          result -> {
            Uri[] uris = null;
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
              Intent data = result.getData();
              if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                uris = new Uri[n];
                for (int i = 0; i < n; i++) {
                  uris[i] = data.getClipData().getItemAt(i).getUri();
                }
              } else if (data.getData() != null) {
                uris = new Uri[] {data.getData()};
              }
            }
            if (filePathCallback != null) {
              filePathCallback.onReceiveValue(uris);
              filePathCallback = null;
            }
          });

  private final ActivityResultLauncher<String> cameraPermissionLauncher =
      registerForActivityResult(
          new ActivityResultContracts.RequestPermission(),
          granted -> {
            if (pendingWebPermission == null) return;
            if (granted) {
              pendingWebPermission.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
              pendingWebPermission.deny();
            }
            pendingWebPermission = null;
          });

  private final ActivityResultLauncher<String> storagePermissionLauncher =
      registerForActivityResult(
          new ActivityResultContracts.RequestPermission(),
          granted -> {
            NativeTransfer transfer = pendingSave.take();
            if (transfer == null) return;
            if (granted) {
              performSave(transfer);
            } else {
              failTransfer(transfer, "Storage permission is required to save on Android 8 or 9.");
            }
          });

  @Override
  @SuppressLint("SetJavaScriptEnabled")
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_main);
    NativeFilePolicy.pruneShareCache(new File(getCacheDir(), "share"), 0);
    webView = findViewById(R.id.webview);

    assetLoader =
        new WebViewAssetLoader.Builder()
            .setDomain(APP_ASSET_HOST)
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setSafeBrowsingEnabled(true);
    if (getPackageName().endsWith(".debug")) {
      // Android Studio runs should always display the web assets packaged by
      // the current build instead of a previously cached app shell.
      settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
      webView.clearCache(true);
    }

    webView.setWebViewClient(
        new WebViewClientCompat() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isTrustedAppUri(request.getUrl());
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isTrustedAppUri(uri)) return assetLoader.shouldInterceptRequest(uri);
            String scheme = uri == null ? null : uri.getScheme();
            if ("blob".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme)) return null;
            return blockedWebResponse();
          }
        });

    webView.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> handleWebPermission(request));
          }

          @Override
          public void onPermissionRequestCanceled(PermissionRequest request) {
            runOnUiThread(
                () -> {
                  if (pendingWebPermission == request) pendingWebPermission = null;
                });
          }

          @Override
          public boolean onShowFileChooser(
              WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            String currentUrl = view.getUrl();
            if (currentUrl == null || !isTrustedAppUri(Uri.parse(currentUrl))) return false;
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
              fileChooserLauncher.launch(params.createIntent());
            } catch (ActivityNotFoundException e) {
              filePathCallback = null;
              Toast.makeText(MainActivity.this, "No file picker available", Toast.LENGTH_SHORT)
                  .show();
              return false;
            }
            return true;
          }
        });

    configureNativeBridge();
    configureBackNavigation();
    webView.setBackgroundColor(0xFF09090B);
    webView.loadUrl(APP_HOST);
  }

  private void configureNativeBridge() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
    WebViewCompat.addWebMessageListener(
        webView,
        "LumenNativeBridge",
        Collections.singleton(APP_ORIGIN),
        (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
          if (!isMainFrame || !isTrustedAppUri(sourceOrigin)) return;
          handleNativeMessage(message, replyProxy);
        });
  }

  private void configureBackNavigation() {
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                if (webView == null) {
                  finishBackNavigation(this);
                  return;
                }
                webView.evaluateJavascript(
                    "Boolean(window.LumenHandleBack && window.LumenHandleBack())",
                    handled -> {
                      if ("true".equals(handled)) return;
                      if (webView.canGoBack()) webView.goBack();
                      else finishBackNavigation(this);
                    });
              }
            });
  }

  private void finishBackNavigation(OnBackPressedCallback callback) {
    callback.setEnabled(false);
    getOnBackPressedDispatcher().onBackPressed();
    callback.setEnabled(true);
  }

  private void handleNativeMessage(WebMessageCompat message, JavaScriptReplyProxy replyProxy) {
    String id = "";
    String type = "";
    try {
      String data = message.getData();
      if (data == null) return;
      JSONObject command = new JSONObject(data);
      id = command.optString("id", "");
      if (id.isEmpty() || id.length() > 100) return;
      type = command.getString("type");
      switch (type) {
        case "begin":
          beginTransfer(command, replyProxy);
          break;
        case "chunk":
          appendChunk(command);
          break;
        case "finish":
          finishTransfer(id);
          break;
        case "abort":
          abortTransfer(id);
          break;
        default:
          reply(replyProxy, id, "complete", false, "Unsupported native operation.");
      }
    } catch (Exception e) {
      NativeTransfer transfer = transfers.remove(id);
      JavaScriptReplyProxy proxy = transfer == null ? replyProxy : transfer.replyProxy;
      if (transfer != null) cleanupTransfer(transfer);
      String phase = "begin".equals(type) ? "ready" : ("chunk".equals(type) ? "chunk" : "complete");
      if (!id.isEmpty()) reply(proxy, id, phase, false, "The file transfer was invalid.");
    }
  }

  private void beginTransfer(JSONObject command, JavaScriptReplyProxy replyProxy) throws Exception {
    String id = command.getString("id");
    String action = command.getString("action");
    long size = command.getLong("size");
    long reservedBytes = reservedTransferBytes();
    if ((!"save".equals(action) && !"share".equals(action))
        || size < 0
        || size > MAX_TRANSFER_BYTES
        || activeTransferCount() >= MAX_CONCURRENT_TRANSFERS
        || reservedBytes > MAX_TOTAL_TRANSFER_BYTES - size
        || transfers.containsKey(id)) {
      throw new IllegalArgumentException("transfer");
    }

    String filename = safeName(command.optString("filename", "scan.pdf"));
    String mime = limited(command.optString("mime", "application/octet-stream"), 128);
    String title = limited(command.optString("title", filename), 512);
    File dir = new File(getCacheDir(), "native-transfer");
    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("transfer dir");
    File file = new File(dir, safeName(id) + ".part");
    FileOutputStream output = new FileOutputStream(file, false);
    NativeTransfer transfer =
        new NativeTransfer(
            id, action, filename, mime, title, size, file, output, replyProxy);
    transfers.put(id, transfer);
    reply(replyProxy, id, "ready", true, null);
  }

  private void appendChunk(JSONObject command) throws Exception {
    String id = command.getString("id");
    NativeTransfer transfer = transfers.get(id);
    if (transfer == null || transfer.output == null) throw new IllegalStateException("transfer");
    byte[] bytes = Base64.decode(command.getString("data"), Base64.DEFAULT);
    if (transfer.written + bytes.length > transfer.expectedSize) {
      throw new IllegalArgumentException("size");
    }
    transfer.output.write(bytes);
    transfer.written += bytes.length;
    reply(transfer.replyProxy, id, "chunk", true, null);
  }

  private void finishTransfer(String id) throws Exception {
    NativeTransfer transfer = transfers.remove(id);
    if (transfer == null || transfer.output == null) throw new IllegalStateException("transfer");
    try {
      transfer.output.close();
      transfer.output = null;
    } catch (Exception e) {
      failTransfer(transfer, "Could not finalize the file transfer.");
      return;
    }
    if (transfer.written != transfer.expectedSize) {
      failTransfer(transfer, "The file transfer was incomplete.");
      return;
    }
    if ("save".equals(transfer.action)) startSave(transfer);
    else performShare(transfer);
  }

  private void startSave(NativeTransfer transfer) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
        && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
            != PackageManager.PERMISSION_GRANTED) {
      if (!pendingSave.offer(transfer)) {
        failTransfer(transfer, "Finish the current save first.");
        return;
      }
      storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE);
      return;
    }
    performSave(transfer);
  }

  private void performSave(NativeTransfer transfer) {
    try {
      writeToDownloads(transfer.file, transfer.filename, transfer.mime);
      transfer.file.delete();
      reply(transfer.replyProxy, transfer.id, "complete", true, null);
    } catch (Exception e) {
      failTransfer(transfer, "Could not save the file.");
    }
  }

  private void performShare(NativeTransfer transfer) {
    File out = null;
    try {
      File dir = new File(getCacheDir(), "share");
      if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("share dir");
      NativeFilePolicy.pruneShareCache(dir, transfer.expectedSize);
      out = new File(dir, safeName(transfer.id + "-" + transfer.filename));
      copyFile(transfer.file, new FileOutputStream(out));
      transfer.file.delete();
      Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", out);
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType(transfer.mime);
      send.putExtra(Intent.EXTRA_STREAM, uri);
      send.putExtra(Intent.EXTRA_SUBJECT, transfer.title);
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      startActivity(Intent.createChooser(send, transfer.title));
      reply(transfer.replyProxy, transfer.id, "complete", true, null);
    } catch (Exception e) {
      if (out != null) out.delete();
      failTransfer(transfer, "Could not share the file.");
    }
  }

  private void abortTransfer(String id) {
    NativeTransfer transfer = transfers.remove(id);
    if (transfer != null) {
      cleanupTransfer(transfer);
      return;
    }
    transfer = pendingSave.abort(id);
    if (transfer != null) cleanupTransfer(transfer);
  }

  private void failTransfer(NativeTransfer transfer, String error) {
    cleanupTransfer(transfer);
    reply(transfer.replyProxy, transfer.id, "complete", false, error);
  }

  private int activeTransferCount() {
    return transfers.size() + (pendingSave.peek() == null ? 0 : 1);
  }

  private long reservedTransferBytes() {
    NativeTransfer pending = pendingSave.peek();
    long total = pending == null ? 0 : pending.expectedSize;
    for (NativeTransfer transfer : transfers.values()) {
      if (Long.MAX_VALUE - total < transfer.expectedSize) return Long.MAX_VALUE;
      total += transfer.expectedSize;
    }
    return total;
  }

  private static void cleanupTransfer(NativeTransfer transfer) {
    if (transfer.output != null) {
      try {
        transfer.output.close();
      } catch (Exception ignored) {
        // Best-effort cleanup.
      }
      transfer.output = null;
    }
    transfer.file.delete();
  }

  // Reply proxies only enter this class through a listener registered after the matching
  // WebView feature check in configureNativeBridge().
  @SuppressLint("RequiresFeature")
  private static void reply(
      JavaScriptReplyProxy proxy, String id, String phase, boolean ok, String error) {
    try {
      JSONObject response = new JSONObject();
      response.put("id", id);
      response.put("phase", phase);
      response.put("ok", ok);
      if (error != null) response.put("error", error);
      proxy.postMessage(response.toString());
    } catch (Exception ignored) {
      // The JavaScript timeout handles a reply channel failure.
    }
  }

  private void handleWebPermission(PermissionRequest request) {
    if (!isTrustedAppUri(request.getOrigin())) {
      request.deny();
      return;
    }
    boolean wantsCamera = false;
    for (String resource : request.getResources()) {
      if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
        wantsCamera = true;
        break;
      }
    }
    if (!wantsCamera) {
      request.deny();
      return;
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED) {
      request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
    } else {
      if (pendingWebPermission != null) pendingWebPermission.deny();
      pendingWebPermission = request;
      cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
    }
  }

  private static boolean isTrustedAppUri(Uri uri) {
    return uri != null
        && APP_SCHEME.equalsIgnoreCase(uri.getScheme())
        && APP_ASSET_HOST.equalsIgnoreCase(uri.getHost())
        && uri.getPort() == -1
        && uri.getUserInfo() == null;
  }

  private static WebResourceResponse blockedWebResponse() {
    return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        403,
        "Blocked",
        Collections.emptyMap(),
        new ByteArrayInputStream(new byte[0]));
  }

  private void writeToDownloads(File source, String filename, String mime) throws Exception {
    String name = safeName(filename);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ContentValues values = new ContentValues();
      values.put(MediaStore.Downloads.DISPLAY_NAME, name);
      values.put(MediaStore.Downloads.MIME_TYPE, mime);
      values.put(MediaStore.Downloads.IS_PENDING, 1);
      Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) throw new IllegalStateException("insert");
      try {
        OutputStream output = getContentResolver().openOutputStream(uri);
        if (output == null) throw new IllegalStateException("stream");
        copyFile(source, output);
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContentResolver().update(uri, values, null, null);
      } catch (Exception e) {
        getContentResolver().delete(uri, null, null);
        throw e;
      }
    } else {
      File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
      if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("downloads");
      copyFile(source, new FileOutputStream(uniqueLegacyDownload(dir, name)));
    }
  }

  private static File uniqueLegacyDownload(File directory, String filename) {
    File candidate = new File(directory, filename);
    if (!candidate.exists()) return candidate;

    int dot = filename.lastIndexOf('.');
    String base = dot > 0 ? filename.substring(0, dot) : filename;
    String extension = dot > 0 ? filename.substring(dot) : "";
    for (int suffix = 1; suffix < 10_000; suffix++) {
      candidate = new File(directory, base + " (" + suffix + ")" + extension);
      if (!candidate.exists()) return candidate;
    }
    throw new IllegalStateException("Could not choose a unique download name.");
  }

  private static void copyFile(File source, OutputStream output) throws Exception {
    try (InputStream input = new FileInputStream(source); OutputStream target = output) {
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = input.read(buffer)) != -1) target.write(buffer, 0, read);
    }
  }

  private static String limited(String value, int maxLength) {
    String normalized = value == null || value.isEmpty() ? "application/octet-stream" : value;
    return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
  }

  private static String safeName(String filename) {
    String trimmed = filename == null ? "" : filename.replaceAll("[\\\\/]+", "_").trim();
    if (trimmed.isEmpty()) return "scan.pdf";
    return trimmed.length() <= 180 ? trimmed : trimmed.substring(trimmed.length() - 180);
  }

  @Override
  protected void onDestroy() {
    for (NativeTransfer transfer : transfers.values()) cleanupTransfer(transfer);
    transfers.clear();
    NativeTransfer pending = pendingSave.take();
    if (pending != null) cleanupTransfer(pending);
    super.onDestroy();
  }

}
