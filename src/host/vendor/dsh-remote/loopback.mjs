// loopback.ts
import { z } from "zod";
var LOOPBACK_CHUNK_BYTES = 64 * 1024;
var LOOPBACK_MAX_BODY_BYTES = 1024 * 1024;
var LOOPBACK_MAX_WS_BYTES = 256 * 1024;
var LOOPBACK_MAX_CONNECTIONS = 16;
var id = z.string().uuid();
var data = z.string().max(Math.ceil(LOOPBACK_MAX_BODY_BYTES / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
var target = {
  port: z.number().int().min(1024).max(65535),
  path: z.string().min(1).max(8192).regex(/^\/(?!\/)[^\x00-\x20\x7f\\]*$/),
  headers: z.array(z.tuple([z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/), z.string().max(8192).regex(/^[^\x00-\x08\x0a-\x1f\x7f]*$/)])).max(64)
};
var loopbackRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("describe") }).strict(),
  z.object({ op: z.literal("http.open"), id, ...target, method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]), body: data.optional() }).strict(),
  z.object({ op: z.literal("http.read"), id }).strict(),
  z.object({ op: z.literal("close"), id }).strict(),
  z.object({ op: z.literal("ws.open"), id, ...target, protocols: z.array(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/)).max(16) }).strict(),
  z.object({ op: z.literal("ws.read"), id }).strict(),
  z.object({ op: z.literal("ws.send"), id, data, binary: z.boolean() }).strict()
]);
export {
  LOOPBACK_CHUNK_BYTES,
  LOOPBACK_MAX_BODY_BYTES,
  LOOPBACK_MAX_CONNECTIONS,
  LOOPBACK_MAX_WS_BYTES,
  loopbackRequestSchema
};
