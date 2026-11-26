import { createMaterialsSpaceService } from "./materials-service.mjs";

export { createMaterialsSpaceService };

export const name = "opl-materials-space";
export const inject = ["oplFrameworkBridge"];

export function apply(ctx) {
  const framework = ctx.oplFrameworkBridge;
  const service = createMaterialsSpaceService({
    readAppState: () => framework.opl.readState("fast")
  });
  ctx.provide("oplMaterialsSpace", service);
}
