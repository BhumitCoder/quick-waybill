/**
 * Runs against the Firestore emulator only (never production):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npx vitest run src/lib/orderStore
 * Skipped when the emulator isn't configured, so `npm test` stays offline.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  terminate,
  type Firestore,
} from "firebase/firestore";
import { OrderSync, memoryPersistence } from "./orderSync";
import type { Row } from "./rowCodec";
import { mergedRowKey } from "./rowKey";
import { findRowByAwb, setField } from "../masterService";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-zaiko";
const DATABASE = "zaiko-reports";
const run = HOST ? describe : describe.skip;

const C = "companyA";
const P = "platformA";

let apps: FirebaseApp[] = [];
let dbs: Firestore[] = [];
function client(): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake" }, `c${Math.random()}`);
  const db = getFirestore(app, DATABASE);
  const [host, port] = HOST!.split(":");
  connectFirestoreEmulator(db, host, Number(port));
  apps.push(app);
  dbs.push(db);
  return db;
}
function sync(db: Firestore, scope?: { companyId: string; platformId: string }) {
  return new OrderSync({
    db,
    dataset: "master",
    persistence: memoryPersistence(),
    keyOf: mergedRowKey,
    writer: "scanner-test",
    scope,
  });
}

/** Today's path: compute, then write the file and read it back. */
function viaXlsx(rows: Row[]): Row[] {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Master Data");
  const read = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }), {
    type: "array",
  });
  return JSON.parse(
    JSON.stringify(XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { defval: "" })),
  );
}

const order = (i: number): Row => ({
  awb: `${1490812345000 + i}`,
  orderId: `ORD${i}`,
  subOrderId: `ORD${i}S1`,
  status: "manifest",
  productName: `Item ${i}`,
});

run("OrderSync in the scanner, against the Firestore emulator", () => {
  beforeEach(async () => {
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/${DATABASE}/documents`, {
      method: "DELETE",
    });
  });
  afterEach(async () => {
    await Promise.all(dbs.map((d) => terminate(d)));
    await Promise.all(apps.map((a) => deleteApp(a)));
    apps = [];
    dbs = [];
  });

  it("scan writes match the xlsx path exactly and touch only the scanned order", async () => {
    const panel = sync(client());
    await panel.write(C, P, () => Array.from({ length: 40 }, (_, i) => order(i)));

    const scanner = sync(client(), { companyId: C, platformId: P });
    await scanner.init();
    let fileRows = viaXlsx(Array.from({ length: 40 }, (_, i) => order(i)));
    expect(scanner.rows(C, P)).toEqual(fileRows);

    // The scanner's write: find the scanned row with the real matcher, set its status
    for (const [i, status] of [
      [3, "pickup"],
      [17, "returned"],
      [3, "cancelled"],
      [39, "pickup"],
    ] as const) {
      const awb = String(order(i).awb);
      const compute = (rows: Row[]) => {
        const out = rows.slice();
        const idx = findRowByAwb(out, awb);
        if (idx !== -1) out[idx] = setField(out[idx], "status", status);
        return out;
      };
      const expected = viaXlsx(compute(fileRows.map((r) => ({ ...r }))));
      await scanner.write(C, P, compute);
      expect(scanner.rows(C, P)).toEqual(expected);
      fileRows = expected;
    }

    // The panel sees the scans after catching up
    await panel.catchUp();
    expect(panel.rows(C, P)).toEqual(fileRows);
  }, 60_000);

  it("a scoped scanner copy holds only its own platform", async () => {
    const panel = sync(client());
    await panel.write(C, P, () => [order(1)]);
    await panel.write(C, "platformB", () => [order(2)]);
    const scanner = sync(client(), { companyId: C, platformId: P });
    await scanner.init();
    expect(scanner.platformKeys()).toEqual([`${C}_${P}`]);
  });
});
