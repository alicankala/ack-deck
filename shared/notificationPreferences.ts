export type NotificationPreferences = {
  // Master toggles
  desktopMaster: boolean;
  mobileMaster: boolean;

  // Desktop channels
  desktopTasks: boolean;
  desktopStudy: boolean;
  desktopPrayers: boolean;
  desktopPomodoro: boolean;
  desktopDormMenu: boolean;
  desktopSubscriptions: boolean;

  // Mobile push channels
  mobileTasks: boolean;
  mobileStudy: boolean;
  mobilePrayers: boolean;
  mobileDormMenu: boolean;
  mobileSubscriptions: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  desktopMaster: true,
  mobileMaster: true,

  desktopTasks: true,
  desktopStudy: true,
  desktopPrayers: true,
  desktopPomodoro: true,
  desktopDormMenu: true,
  desktopSubscriptions: true,

  mobileTasks: true,
  mobileStudy: true,
  mobilePrayers: true,
  mobileDormMenu: true,
  mobileSubscriptions: true,
};

export function validNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<keyof NotificationPreferences, unknown>;
  const keys: (keyof NotificationPreferences)[] = [
    "desktopMaster",
    "mobileMaster",
    "desktopTasks",
    "desktopStudy",
    "desktopPrayers",
    "desktopPomodoro",
    "desktopDormMenu",
    "desktopSubscriptions",
    "mobileTasks",
    "mobileStudy",
    "mobilePrayers",
    "mobileDormMenu",
    "mobileSubscriptions",
  ];
  return keys.every((k) => typeof v[k] === "boolean");
}
