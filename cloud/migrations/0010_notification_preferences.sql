-- Notification preferences for desktop and mobile push channels
ALTER TABLE desktop_state ADD COLUMN notification_preferences TEXT;
