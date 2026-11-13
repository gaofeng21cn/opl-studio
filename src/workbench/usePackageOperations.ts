import { useCallback, useEffect, useRef, useState } from 'react';
import type { OplActionReceipt, OplBridge } from '../bridge/oplBridge';
import { packageOperationResult, readPackageOperation, type PackageOperation } from './packageOperations';

export function usePackageOperations(bridge: OplBridge, onCompleted: () => void, visible = true) {
  const [operations, setOperations] = useState<PackageOperation[]>([]);
  const [readError, setReadError] = useState(false);
  const [supported, setSupported] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const observed = useRef(new Map<string, string>());
  const completed = useRef(onCompleted); completed.current = onCompleted;
  const active = operations.some(item => item.status === 'running');
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!visible && !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let active = false;
      try {
        const receipt = await bridge.executeAction({ actionId: 'package_operation_status', payload: {}, dryRun: true });
        const rows = packageOperationResult(receipt).operations;
        if (!Array.isArray(rows)) throw new Error('package_operation_status_unavailable');
        if (disposed) return;
        const next = rows.flatMap(row => readPackageOperation(row) ?? []);
        for (const operation of next) {
          if (observed.current.get(operation.operation_id) === 'running' && operation.status !== 'running') completed.current();
          observed.current.set(operation.operation_id, operation.status);
        }
        active = next.some(operation => operation.status === 'running');
        setOperations(next); setReadError(false); setSupported(true);
      } catch { if (!disposed) setReadError(true); }
      if (!disposed) timer = setTimeout(poll, active ? 1500 : 15000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [bridge, revision, visible, active]);
  const accept = (receipt: OplActionReceipt) => {
    const operation = readPackageOperation(packageOperationResult(receipt).operation);
    if (!operation || receipt.status !== 'executed') return false;
    observed.current.set(operation.operation_id, operation.status);
    setOperations(current => [operation, ...current.filter(item => item.operation_id !== operation.operation_id)]);
    refresh(); return true;
  };
  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      const receipt = await bridge.executeAction({ actionId: 'package_operation_cancel', payload: { operation_id: id, confirmed: true }, dryRun: false });
      if (receipt.status !== 'executed') throw new Error('package_operation_cancel_failed');
      refresh();
    } catch { setReadError(true); }
    finally { setCancelling(null); }
  };
  return { operations, readError, supported, cancelling, accept, cancel, refresh };
}
