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

  // Match reminders (Galatasaray & Turkey National Team)
  desktopMatches?: boolean;
  mobileMatches?: boolean;
  matchTeamGalatasaray?: boolean;
  matchTeamTurkey?: boolean;
  matchLeadMinutes?: number;
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
  desktopMatches: true,

  mobileTasks: true,
  mobileStudy: true,
  mobilePrayers: true,
  mobileDormMenu: true,
  mobileSubscriptions: true,
  mobileMatches: true,

  matchTeamGalatasaray: true,
  matchTeamTurkey: true,
  matchLeadMinutes: 30,
};

export function validNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<keyof NotificationPreferences, unknown>;
  const requiredBooleans: (keyof NotificationPreferences)[] = [
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
  const optionalBooleans: (keyof NotificationPreferences)[] = [
    "desktopMatches",
    "mobileMatches",
    "matchTeamGalatasaray",
    "matchTeamTurkey",
  ];
  const validLead =
    v.matchLeadMinutes === undefined ||
    (typeof v.matchLeadMinutes === "number" && [15, 30, 60].includes(v.matchLeadMinutes));
  return (
    requiredBooleans.every((k) => typeof v[k] === "boolean") &&
    optionalBooleans.every((k) => v[k] === undefined || typeof v[k] === "boolean") &&
    validLead
  );
}
