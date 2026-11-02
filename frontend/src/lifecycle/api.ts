import { invoke } from "@tauri-apps/api/core";
export type BootStatus = { version: string; ready: boolean; library_path: string | null; recommended_path: string; config_directory: string; source: string; error: string | null; preferences: Record<string, unknown>; import_legacy_preferences: boolean };
export type UpdateStatus = { current_version: string; phase: string; version: string | null; notes: string | null; downloaded: number; total: number | null; error: string | null };
export const lifecycleApi = {
  startup: () => invoke<BootStatus>("startup_status"),
  chooseFolder: () => invoke<string | null>("choose_folder"),
  configure: (path: string, create: boolean) => invoke<BootStatus>("configure_library", { path, create }),
  backup: () => invoke<string>("create_backup"),
  updates: () => invoke<UpdateStatus>("update_status"),
  check: (manual: boolean) => invoke<UpdateStatus>("check_update", { manual }),
  download: () => invoke<UpdateStatus>("download_update"),
  install: () => invoke<void>("install_update"),
};
