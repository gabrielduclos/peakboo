export const APP_ORIGIN =
  (import.meta as unknown as { env: { VITE_APP_URL?: string } }).env
    .VITE_APP_URL || "https://main.peakboo.workers.dev";
export const inviteLink = (code: string) =>
  APP_ORIGIN + "/#invite=" + encodeURIComponent(code);
