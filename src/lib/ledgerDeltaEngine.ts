// src/lib/ledgerDeltaEngine.ts

/**
 * Tries to extract a contractId from various shapes.
 * Adjust this if your actual event shape differs.
 */
export function extractRawContractId(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  const candidates = [
    obj.contractId,
    obj.contract_id,
    obj.contract_id?.coid,
    obj.contract?.contractId,
    obj.contract?.contract_id,
    obj.payload?.contractId,
    obj.payload?.contract_id,
    obj.created_event?.contract_id,
    obj.created_event?.contractId,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }

  return null;
}

/**
 * Normalize a Canton contract ID so snapshot vs v2 updates match.
 * Tailor to your actual CID format (strip "#", remove domain suffix, etc).
 */
export function normalizeContractId(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let cid = raw.trim();

  // Strip leading '#'
  if (cid.startsWith("#")) cid = cid.slice(1);

  // If your snapshot CIDs look like "<hash>:<package>:<module>:<entity>",
  // but updates only have "<hash>", keep just the first component.
  if (cid.includes(":")) {
    cid = cid.split(":")[0];
  }

  return cid.toLowerCase();
}

/**
 * Builds a baseline state (Map<CID, contractObj>) from an array of contracts.
 * Expects each `contract` to either already be a contract,
 * or at least have some extractable contractId.
 */
export function buildBaselineState(contractsArray: any[]): Map<string, any> {
  const state = new Map<string, any>();

  for (const c of contractsArray) {
    const rawId =
      extractRawContractId(c) ||
      extractRawContractId(c.contract) ||
      extractRawContractId(c.payload);
    const cid = normalizeContractId(rawId);

    if (!cid) continue;

    state.set(cid, c);
  }

  return state;
}

/**
 * Applies one incremental "chunk" of deltas to the state.
 * A chunk is expected to look like:
 *   { created: [...events], archived: [...events] }
 */
export function applyIncrementalChunk(
  state: Map<string, any>,
  chunk: any
): void {
  if (!chunk || typeof chunk !== "object") return;

  const created = Array.isArray(chunk.created) ? chunk.created : [];
  const archived = Array.isArray(chunk.archived) ? chunk.archived : [];

  // Apply creations
  for (const ev of created) {
    const rawId =
      extractRawContractId(ev) ||
      extractRawContractId(ev.created_event) ||
      extractRawContractId(ev.contract) ||
      extractRawContractId(ev.payload);
    const cid = normalizeContractId(rawId);
    if (!cid) continue;

    // In many cases, ev.created_event.create_arguments is the "payload"
    // You can decide what shape you want stored here.
    const contractObj = ev.created_event || ev;
    state.set(cid, contractObj);
  }

  // Apply archives
  for (const ev of archived) {
    const rawId =
      extractRawContractId(ev) ||
      extractRawContractId(ev.archived_event) ||
      extractRawContractId(ev.contract) ||
      extractRawContractId(ev.payload);
    const cid = normalizeContractId(rawId);
    if (!cid) continue;

    state.delete(cid);
  }
}

/**
 * Applies an array of incremental chunks to the state.
 */
export function applyIncrementalChunks(
  state: Map<string, any>,
  chunks: any[]
): void {
  for (const chunk of chunks) {
    applyIncrementalChunk(state, chunk);
  }
}
