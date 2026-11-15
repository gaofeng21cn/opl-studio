import { inspectSelectedPath } from "./vendor/dsh-remote/rtc.mjs";

const CANDIDATES = new Set(["host", "srflx", "prflx", "relay"]);
const byteLength = data => typeof data === "string" ? Buffer.byteLength(data) : data?.byteLength ?? 0;
function selectedPair(stats) {
  const entries = [...stats];
  const selectedIds = new Set(entries.filter(([, item]) => item.type === "transport").map(([, item]) => item.selectedCandidatePairId));
  const pair = entries.find(([id, item]) => item.type === "candidate-pair" && item.state === "succeeded" && (item.selected === true || item.nominated === true || selectedIds.has(item.id ?? id)));
  if (!pair) return null;
  const subset = new Map(entries.filter(([id, item]) => item.type === "local-candidate" || item.type === "remote-candidate" || id === pair[0]));
  // The upstream classifier owns LAN/P2P/TURN semantics. Addresses never leave this call.
  const path = inspectSelectedPath(subset);
  if (!["lan", "p2p", "turn"].includes(path.transport) || !CANDIDATES.has(path.localCandidateType) || !CANDIDATES.has(path.remoteCandidateType)) return null;
  return { selectedTransport: path.transport, localCandidateType: path.localCandidateType, remoteCandidateType: path.remoteCandidateType, candidatePairState: "succeeded" };
}

/** Ephemeral observations over public RTC/WS APIs; never a transport or business-state owner. */
export function createLinkTransportEvidence() {
  const records = []; let attempted = false; let sequence = 0;
  const relay = { bytesSent: 0, bytesReceived: 0, sequence: 0 };
  function wrapChannel(channel, record) {
    return new Proxy(channel, {
      get(target, key) {
        if (key === "send") return data => { target.send(data); record.bytesSent += byteLength(data); record.sequence = ++sequence; };
        const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, key, value) {
        if (key === "onmessage") return Reflect.set(target, key, value === null ? null : event => { record.bytesReceived += byteLength(event.data); record.sequence = ++sequence; value(event); }, target);
        return Reflect.set(target, key, value, target);
      }
    });
  }
  function wrapFactory(factory) {
    return { create(configuration) {
      attempted = true;
      const pc = factory.create(configuration); const record = { pc, closed: false, path: null, bytesSent: 0, bytesReceived: 0, sequence: 0 };
      records.push(record); while (records.length > 64) records.shift();
      return new Proxy(pc, {
        get(target, key) {
          if (key === "createDataChannel") return (...args) => wrapChannel(target.createDataChannel(...args), record);
          if (key === "getStats") return async () => { const stats = await target.getStats(); record.path = selectedPair(stats) ?? record.path; return stats; };
          if (key === "close") return (...args) => { record.closed = true; return target.close(...args); };
          const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          if (key === "ondatachannel") return Reflect.set(target, key, value === null ? null : event => value({ ...event, channel: wrapChannel(event.channel, record) }), target);
          return Reflect.set(target, key, value, target);
        }
      });
    } };
  }
  function observeRelay(data, direction) {
    if (byteLength(data) > 1024 * 1024) return;
    try {
      const frame = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
      if (direction === "bytesReceived" && frame.type === "signal.offer") attempted = true;
      if (frame.type !== "relay" || typeof frame.payload?.ciphertext !== "string") return;
      relay[direction] += Buffer.from(frame.payload.ciphertext, "base64url").length; relay.sequence = ++sequence;
    } catch { /* The official carrier validates its own frames. */ }
  }
  function observeSocket(socket) {
    const send = socket.send;
    socket.send = function(data, ...args) { const result = send.call(this, data, ...args); observeRelay(data, "bytesSent"); return result; };
    if (typeof socket.on === "function") socket.on("message", data => observeRelay(data, "bytesReceived"));
    else socket.addEventListener?.("message", event => observeRelay(event.data, "bytesReceived"));
    return socket;
  }
  async function read({ authenticated, relayConnected }) {
    if (!authenticated) return null;
    await Promise.allSettled(records.filter(record => !record.closed).map(async record => {
      let timer;
      try { const stats = await Promise.race([record.pc.getStats(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("stats timeout")), 1000); })]); record.path = selectedPair(stats) ?? record.path; }
      finally { clearTimeout(timer); }
    }));
    const direct = records.filter(record => !record.closed && record.path && record.bytesSent > 0 && record.bytesReceived > 0).sort((a, b) => b.sequence - a.sequence)[0];
    if (direct && (!relayConnected || direct.sequence > relay.sequence)) return { ...direct.path, bytesSent: direct.bytesSent, bytesReceived: direct.bytesReceived, directAttempted: true, relayFallback: false };
    if (relayConnected && relay.bytesSent > 0 && relay.bytesReceived > 0) return { selectedTransport: "relay", localCandidateType: null, remoteCandidateType: null, candidatePairState: null, bytesSent: relay.bytesSent, bytesReceived: relay.bytesReceived, directAttempted: attempted, relayFallback: attempted };
    return null;
  }
  return { wrapFactory, observeSocket, read };
}
