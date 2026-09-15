package app.lumen.scanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PendingTransferSlotTest {
  private static final class Transfer {
    final String id;

    Transfer(String id) {
      this.id = id;
    }
  }

  @Test
  public void abortOnlyTakesMatchingTransfer() {
    PendingTransferSlot<Transfer> slot = new PendingTransferSlot<>(transfer -> transfer.id);
    Transfer transfer = new Transfer("save-1");

    assertTrue(slot.offer(transfer));
    assertNull(slot.abort("another-transfer"));
    assertSame(transfer, slot.peek());
    assertSame(transfer, slot.abort("save-1"));
    assertNull(slot.peek());
  }

  @Test
  public void rejectsASecondPermissionPendingTransfer() {
    PendingTransferSlot<Transfer> slot = new PendingTransferSlot<>(transfer -> transfer.id);

    assertTrue(slot.offer(new Transfer("first")));
    assertFalse(slot.offer(new Transfer("second")));
    assertEquals("first", slot.take().id);
    assertNull(slot.take());
  }
}
