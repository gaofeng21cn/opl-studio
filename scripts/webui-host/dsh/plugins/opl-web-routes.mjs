import { registerOplHttpRoutes } from "../../http-routes.mjs";

export const name = "opl-web-routes";
export const inject = ["webServer", "oplHostCore", "oplStudioHostOptions"];

export function apply(ctx) {
  ctx.effect(
    () => registerOplHttpRoutes(ctx.webServer, ctx.oplHostCore, ctx.oplStudioHostOptions),
    "opl-web-routes: HTTP bridge"
  );
}
