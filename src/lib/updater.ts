import { getVersion } from "@tauri-apps/api/app";

export type UpdateChannel = "stable" | "beta";

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface CheckOptions {
  timeout?: number;
  channel?: UpdateChannel;
}

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "";
  }
}

export async function checkForUpdate(
  _opts: CheckOptions = {},
): Promise<
  { status: "up-to-date" } | { status: "available"; info: UpdateInfo }
> {
  // Tauri v1: 使用 checkUpdate() 而非 check()
  const { checkUpdate } = await import("@tauri-apps/api/updater");

  const currentVersion = await getCurrentVersion();
  const update = await checkUpdate();

  if (!update.shouldUpdate) {
    return { status: "up-to-date" };
  }

  const info: UpdateInfo = {
    currentVersion,
    availableVersion: update.manifest?.version ?? "",
    notes: update.manifest?.body,
    pubDate: update.manifest?.date,
  };

  return { status: "available", info };
}
