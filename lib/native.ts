"use client";
/**
 * The Daybook Android app (android/) loads this site in its own WebView and exposes a small
 * bridge as `window.DaybookAndroid`. In a normal browser it is absent and everything here is a no-op.
 */
export type NativeBridge = {
  version(): string;
  /** Saves the per-device key the app uses to refresh reminders in the background. */
  setDeviceToken(token: string): void;
  hasDeviceToken(): boolean;
  /** Replaces the reminders scheduled on the phone with this JSON list of NativeReminder. */
  schedule(json: string): void;
  notificationsAllowed(): boolean;
  requestNotifications(): void;
  openNotificationSettings(): void;
  testNotification(): void;
  /** Writes a text file to the phone's Downloads folder. Returns false if it couldn't. */
  saveFile(name: string, mime: string, content: string): boolean;
};

export type NativeReminder = { key: string; when: number; title: string; body: string; url: string };

export function native(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { DaybookAndroid?: NativeBridge }).DaybookAndroid ?? null);
}
