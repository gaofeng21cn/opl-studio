/** DSH apps/web's browser loader seam: this Node-only path must stay unreachable. */
export const createRequire = () => {
  throw new Error("node:module is not available in the browser");
};
