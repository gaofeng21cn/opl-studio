export type TeamBotsState = {
  state: "stopped" | "starting" | "running" | "error";
  url: string | null;
  error: string | null;
  dataDirectory: string;
};
export type TeamBotAction = { operation: "start" | "stop" };
