import { registerOplHttpRoutes } from "./service.mjs";
import { registerOplFrontend } from "./frontend-static.mjs";

export const name = "opl-web-routes";
export const inject = ["webServer", "oplHostCore", "oplStudioHostOptions"];

export async function apply(ctx) {
  ctx.effect(
    () => registerOplHttpRoutes(ctx.webServer, ctx.oplHostCore, ctx.oplStudioHostOptions),
    "opl-web-routes: HTTP bridge"
  );
  await registerOplFrontend(ctx, ctx.oplStudioHostOptions);
}
