import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import type { MasterRow } from "@/lib/masterService";
import type { Company, Platform } from "@/components/SetupScreen";

const SETUP_KEY = "awb_setup_v1";

type SetupState = {
  companyId: string;
  platformId: string;
  status: string;
  companySnapshot: Company | null;
  platformSnapshot: Platform | null;
};

const loadSetup = (): SetupState => {
  if (typeof window === "undefined") {
    return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
  }
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) throw new Error("empty");
    return JSON.parse(raw) as SetupState;
  } catch {
    return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
  }
};

const setupSlice = createSlice({
  name: "setup",
  initialState: loadSetup(),
  reducers: {
    setCompany(state, action: PayloadAction<Company | null>) {
      const c = action.payload;
      state.companyId = c?.id ?? "";
      state.companySnapshot = c;
      // reset platform if company changed
      if (!c || !c.platforms.some((p) => p.id === state.platformId)) {
        state.platformId = "";
        state.platformSnapshot = null;
      }
    },
    setPlatform(state, action: PayloadAction<Platform | null>) {
      state.platformId = action.payload?.id ?? "";
      state.platformSnapshot = action.payload;
    },
    setStatus(state, action: PayloadAction<string>) {
      state.status = action.payload;
    },
    clearSetup() {
      return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
    },
  },
});

type MasterCacheEntry = {
  rows: MasterRow[];
  loadedAt: number;
  scannedAwbs: string[];
};

type MasterState = {
  cache: Record<string, MasterCacheEntry>;
};

const masterSlice = createSlice({
  name: "master",
  initialState: { cache: {} } as MasterState,
  reducers: {
    setMaster(state, action: PayloadAction<{ path: string; rows: MasterRow[] }>) {
      const { path, rows } = action.payload;
      const existing = state.cache[path];
      state.cache[path] = {
        rows,
        loadedAt: Date.now(),
        scannedAwbs: existing?.scannedAwbs ?? [],
      };
    },
    updateRow(state, action: PayloadAction<{ path: string; index: number; row: MasterRow }>) {
      const { path, index, row } = action.payload;
      const entry = state.cache[path];
      if (entry) entry.rows[index] = row;
    },
    markScanned(state, action: PayloadAction<{ path: string; awb: string }>) {
      const { path, awb } = action.payload;
      const entry = state.cache[path];
      if (entry && !entry.scannedAwbs.includes(awb)) entry.scannedAwbs.push(awb);
    },
    clearScannedAwbs(state, action: PayloadAction<{ path: string }>) {
      const entry = state.cache[action.payload.path];
      if (entry) entry.scannedAwbs = [];
    },
    invalidate(state, action: PayloadAction<{ path: string }>) {
      delete state.cache[action.payload.path];
    },
  },
});

export const { setCompany, setPlatform, setStatus, clearSetup } = setupSlice.actions;
export const { setMaster, updateRow, markScanned, clearScannedAwbs, invalidate } = masterSlice.actions;

export const store = configureStore({
  reducer: {
    setup: setupSlice.reducer,
    master: masterSlice.reducer,
  },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
});

// Persist setup to localStorage
if (typeof window !== "undefined") {
  store.subscribe(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(store.getState().setup));
    } catch {
      /* ignore */
    }
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
