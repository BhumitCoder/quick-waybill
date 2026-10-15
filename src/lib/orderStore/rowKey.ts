// Same as getMergedRowKey in excel-report-manager/src/lib/masterFileService.ts —
// keep both identical. Identifies an order row across writes (awb + subOrderId,
// falling back to orderId + subOrderId).

const part = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .trim();

export function mergedRowKey(row: Record<string, unknown>): string | null {
  const awb = part(row.awb);
  const orderId = part(row.orderId);
  const subOrderId = part(row.subOrderId) || orderId || awb;

  if (awb) return `${awb}_${subOrderId || awb}`;
  if (orderId) return `${orderId}_${subOrderId || orderId}`;
  return null;
}
