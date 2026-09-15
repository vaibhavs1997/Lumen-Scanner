package app.lumen.scanner;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class NativeFilePolicyTest {
  @Rule public final TemporaryFolder temporaryFolder = new TemporaryFolder();

  @Test
  public void removesExpiredShareFiles() throws Exception {
    File directory = temporaryFolder.newFolder("share");
    long now = 1_000_000L;
    File expired = file(directory, "expired.pdf", 2, now - 101);
    File recent = file(directory, "recent.pdf", 2, now - 100);

    NativeFilePolicy.pruneShareCache(directory, 0, now, 100, 100, 8);

    assertFalse(expired.exists());
    assertTrue(recent.exists());
  }

  @Test
  public void reservesFileAndByteCapacityForIncomingShare() throws Exception {
    File directory = temporaryFolder.newFolder("share");
    long now = 1_000_000L;
    File oldest = file(directory, "oldest.pdf", 4, now - 30);
    File middle = file(directory, "middle.pdf", 4, now - 20);
    File newest = file(directory, "newest.pdf", 4, now - 10);

    NativeFilePolicy.pruneShareCache(directory, 4, now, 1_000, 12, 3);

    assertFalse(oldest.exists());
    assertTrue(middle.exists());
    assertTrue(newest.exists());
  }

  private static File file(File directory, String name, int size, long modified) throws Exception {
    File file = new File(directory, name);
    try (FileOutputStream output = new FileOutputStream(file)) {
      output.write(new byte[size]);
    }
    if (!file.setLastModified(modified)) throw new IllegalStateException("Could not set timestamp");
    return file;
  }
}
