export type SuperagentState = {
  state: "stopped" | "starting" | "running" | "error";
  url: string | null;
  error: string | null;
  dataDirectory: string;
  teamDependency: false;
};
