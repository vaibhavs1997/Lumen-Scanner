package app.lumen.scanner;

import java.io.File;
import java.util.Arrays;

final class NativeFilePolicy {
  private static final long MAX_SHARE_CACHE_BYTES = 128L * 1024L * 1024L;
  private static final int MAX_SHARE_CACHE_FILES = 8;
  private static final long SHARE_CACHE_MAX_AGE_MS = 24L * 60L * 60L * 1000L;

  private NativeFilePolicy() {}

  static void pruneShareCache(File directory, long incomingBytes) {
    pruneShareCache(
        directory,
        incomingBytes,
        System.currentTimeMillis(),
        SHARE_CACHE_MAX_AGE_MS,
        MAX_SHARE_CACHE_BYTES,
        MAX_SHARE_CACHE_FILES);
  }

  static void pruneShareCache(
      File directory,
      long incomingBytes,
      long now,
      long maxAgeMs,
      long maxBytes,
      int maxFiles) {
    File[] files = directory.listFiles(File::isFile);
    if (files == null || files.length == 0) return;

    for (File file : files) {
      long modified = file.lastModified();
      if (modified <= 0 || (now >= modified && now - modified > maxAgeMs)) file.delete();
    }

    files = directory.listFiles(File::isFile);
    if (files == null || files.length == 0) return;
    Arrays.sort(files, (left, right) -> Long.compare(left.lastModified(), right.lastModified()));
    long totalBytes = 0;
    for (File file : files) totalBytes += file.length();
    int maxExistingFiles = incomingBytes > 0 ? maxFiles - 1 : maxFiles;
    long maxExistingBytes = Math.max(0, maxBytes - incomingBytes);
    int firstRemaining = 0;
    while (firstRemaining < files.length
        && (files.length - firstRemaining > maxExistingFiles || totalBytes > maxExistingBytes)) {
      File oldest = files[firstRemaining++];
      long length = oldest.length();
      if (oldest.delete()) totalBytes -= length;
    }
  }
}
