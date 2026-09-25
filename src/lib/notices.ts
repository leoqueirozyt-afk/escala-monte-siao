export const NOTICES_EVENT = "notices-updated";

export function notifyNoticesChanged() {
  window.dispatchEvent(new Event(NOTICES_EVENT));
}
