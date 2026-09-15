package app.lumen.scanner;

final class PendingTransferSlot<T> {
  interface IdReader<T> {
    String idOf(T value);
  }

  private final IdReader<T> idReader;
  private T value;

  PendingTransferSlot(IdReader<T> idReader) {
    this.idReader = idReader;
  }

  synchronized boolean offer(T next) {
    if (value != null) return false;
    value = next;
    return true;
  }

  synchronized T peek() {
    return value;
  }

  synchronized T take() {
    T current = value;
    value = null;
    return current;
  }

  synchronized T abort(String id) {
    if (value == null || !idReader.idOf(value).equals(id)) return null;
    return take();
  }
}
