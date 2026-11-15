export type BotTemplate = { id: string; name: string; role: string; cwd: string; model: string; permissions: string; skills: string[] };
export type TeamBotsState = {
  revision: number; bots: BotTemplate[]; teams: { id: string; title: string; botId: string }[];
  teamId?: string; memberId?: string;
  members?: { id: string; path?: string; activity?: string }[];
  tasks?: { id: string; subject: string; description: string; status: string; revision: number; ownerName?: string; ready: boolean }[];
  messages?: { seq: number; type: string; data: Record<string, any> }[];
  execution?: { threadId?: string; status?: string };
};
export type TeamBotAction = { operation: "save_bot" | "delete_bot" | "create_team" | "add_member" | "send_message" | "cancel_member"; input: Record<string, unknown> };
