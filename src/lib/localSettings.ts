"use client";

export const SETTINGS_STORAGE_KEY = "postliminal.localSettings.v1";

export type LocalSettings = {
  openaiApiKey: string;
};

export const defaultSettings: LocalSettings = {
  openaiApiKey: "",
};

export function normalizeSettings(
  settings: Partial<LocalSettings> = {},
): LocalSettings {
  return {
    openaiApiKey:
      typeof settings.openaiApiKey === "string" ? settings.openaiApiKey : "",
  };
}

export function readLocalSettings(): LocalSettings {
  if (typeof window === "undefined") return defaultSettings;

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return defaultSettings;

  try {
    return normalizeSettings(JSON.parse(raw) as Partial<LocalSettings>);
  } catch {
    return defaultSettings;
  }
}

export function writeLocalSettings(settings: LocalSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeSettings(settings)),
  );
}
