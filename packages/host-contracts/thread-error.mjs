// Plugin payloads are separate bundles; their HTTP error ABI must survive that boundary.
const threadAdapterError = Symbol.for("one-person-lab.thread-adapter-error.v1");
export class ThreadAdapterError extends Error {
  static [Symbol.hasInstance](value) {
    return value instanceof Error && value[threadAdapterError] === true;
  }
  constructor(code, message, details = {}, httpStatus = 409) {
    super(message);
    this.name = "ThreadAdapterError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
    Object.defineProperty(this, threadAdapterError, { value: true });
  }
}
