import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { P as Provider_default, u as useDispatch, a as useSelector } from "../_libs/react-redux.mjs";
import { T as Toaster } from "../_libs/sonner.mjs";
import { g as getDocs, a as getFirestore, c as collection } from "../_libs/firebase__firestore.mjs";
import "../_libs/firebase.mjs";
import { r as ref, g as getBytes, u as uploadBytes, a as getStorage } from "../_libs/firebase__storage.mjs";
import { S as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { R as Root2, V as Value, T as Trigger, I as Icon, P as Portal, C as Content2, a as Viewport, b as Item, c as ItemIndicator, d as ItemText, S as ScrollUpButton, e as ScrollDownButton, L as Label, f as Separator } from "../_libs/radix-ui__react-select.mjs";
import { R as Root, P as Portal$1, C as Content, a as Close, T as Title, D as Description, O as Overlay } from "../_libs/radix-ui__react-dialog.mjs";
import { c as configureStore, a as createSlice } from "../_libs/reduxjs__toolkit.mjs";
import { S as ScanLine, a as Sun, M as Moon, B as Building2, C as ChevronRight, L as Layers, b as LoaderCircle, c as CircleCheck, T as TriangleAlert, D as Download, d as Share, P as Plus, X, e as ChevronDown, f as Check, g as ChevronUp } from "../_libs/lucide-react.mjs";
import { c as getApps, g as getApp, i as initializeApp } from "../_libs/firebase__app.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/react-dom.mjs";
import "async_hooks";
import "stream";
import "util";
import "crypto";
import "../_libs/firebase__component.mjs";
import "../_libs/firebase__util.mjs";
import "../_libs/firebase__webchannel-wrapper.mjs";
import "../_libs/firebase__logger.mjs";
import "../_libs/@grpc/grpc-js.mjs";
import "process";
import "tls";
import "fs";
import "os";
import "net";
import "events";
import "http2";
import "http";
import "url";
import "dns";
import "zlib";
import "../_libs/@grpc/proto-loader.mjs";
import "path";
import "../_libs/lodash.camelcase.mjs";
import "../_libs/protobufjs.mjs";
import "../_libs/protobufjs__aspromise.mjs";
import "../_libs/protobufjs__base64.mjs";
import "../_libs/protobufjs__eventemitter.mjs";
import "../_libs/protobufjs__float.mjs";
import "../_libs/@protobufjs/inquire.mjs";
import "../_libs/protobufjs__utf8.mjs";
import "../_libs/protobufjs__pool.mjs";
import "../_libs/long.mjs";
import "../_libs/protobufjs__codegen.mjs";
import "../_libs/protobufjs__fetch.mjs";
import "../_libs/protobufjs__path.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/react-remove-scroll.mjs";
import "tslib";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/redux.mjs";
import "../_libs/immer.mjs";
import "../_libs/redux-thunk.mjs";
import "../_libs/idb.mjs";
const firebaseConfig = {
  apiKey: "AIzaSyDsdTCK3XOodXcuC1TWHAmxLAETDYv7AjE",
  authDomain: "zaiko-wholesale.firebaseapp.com",
  projectId: "zaiko-wholesale",
  storageBucket: "zaiko-wholesale.firebasestorage.app",
  messagingSenderId: "539852019524",
  appId: "1:539852019524:web:295eb0a2dcaa58a9532911",
  measurementId: "G-R7DHNRE9YQ"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, "zaiko-reports");
const storage = getStorage(app);
const companiesCollection = collection(db, "companies");
function masterPath(companyId, platformId) {
  return `companies/${companyId}/platforms/${platformId}/master.xlsx`;
}
async function getXLSX() {
  return import("../_libs/xlsx.mjs");
}
async function readMasterRows(storagePath) {
  const [XLSX, fileRef] = await Promise.all([
    getXLSX(),
    Promise.resolve(ref(storage, storagePath))
  ]);
  const bytes = await getBytes(fileRef);
  await new Promise((r) => setTimeout(r, 0));
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}
async function writeMasterRows(storagePath, rows) {
  const XLSX = await getXLSX();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Master Data");
  await new Promise((r) => setTimeout(r, 0));
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}
const AWB_PATTERNS = [
  /^awb$/,
  /^awb[\s._-]*(no|num|number)\.?$/,
  /^air[\s._-]*way[\s._-]*bill[\s._-]*(no|num|number)?\.?$/,
  /^airway[\s._-]*bill[\s._-]*(no|num|number)?\.?$/,
  /^tracking[\s._-]*(no|num|number|id|code)?\.?$/,
  /^track[\s._-]*(no|num|number|id|code)?\.?$/,
  /^waybill[\s._-]*(no|num|number)?\.?$/,
  /^connote[\s._-]*(no|num|number)?\.?$/,
  /^barcode[\s._-]*(no|num|number)?\.?$/,
  /^shipment[\s._-]*(no|num|number|id)?\.?$/,
  /^courier[\s._-]*(no|num|number|id)?\.?$/,
  /^ref[\s._-]*(no|num|number|id)?\.?$/,
  /^resi$/,
  /^no[\s._-]*resi$/
];
function detectAwbKey(keys) {
  return keys.find((k) => {
    const n = k.toLowerCase().trim().replace(/\s+/g, " ");
    return AWB_PATTERNS.some((p) => p.test(n));
  });
}
const normalize = (s) => {
  if (s === null || s === void 0) return "";
  if (typeof s === "number") {
    return Number.isInteger(s) ? String(Math.trunc(s)) : String(s);
  }
  return String(s).trim().toLowerCase();
};
function findRowByAwb(rows, awb) {
  if (!rows.length) return -1;
  const needle = normalize(awb);
  if (!needle) return -1;
  const awbKey = detectAwbKey(Object.keys(rows[0]));
  if (awbKey) {
    const idx = rows.findIndex((r) => normalize(r[awbKey]) === needle);
    if (idx !== -1) return idx;
  }
  if (!awbKey) {
    return rows.findIndex(
      (r) => Object.values(r).some((v) => normalize(v) === needle)
    );
  }
  return -1;
}
function getField(row, name) {
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase());
  return key ? String(row[key] ?? "") : "";
}
function setField(row, name, value) {
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name.toLowerCase()) ?? name;
  return { ...row, [key]: value };
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
const Button = reactExports.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref2) => {
    const Comp = asChild ? Slot : "button";
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Comp, { className: cn(buttonVariants({ variant, size, className })), ref: ref2, ...props });
  }
);
Button.displayName = "Button";
const Select = Root2;
const SelectValue = Value;
const SelectTrigger = reactExports.forwardRef(({ className, children, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Trigger,
  {
    ref: ref2,
    className: cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-4 w-4 opacity-50" }) })
    ]
  }
));
SelectTrigger.displayName = Trigger.displayName;
const SelectScrollUpButton = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  ScrollUpButton,
  {
    ref: ref2,
    className: cn("flex cursor-default items-center justify-center py-1", className),
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "h-4 w-4" })
  }
));
SelectScrollUpButton.displayName = ScrollUpButton.displayName;
const SelectScrollDownButton = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  ScrollDownButton,
  {
    ref: ref2,
    className: cn("flex cursor-default items-center justify-center py-1", className),
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-4 w-4" })
  }
));
SelectScrollDownButton.displayName = ScrollDownButton.displayName;
const SelectContent = reactExports.forwardRef(({ className, children, position = "popper", ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(Portal, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Content2,
  {
    ref: ref2,
    className: cn(
      "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-select-content-transform-origin)",
      position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
      className
    ),
    position,
    ...props,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollUpButton, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Viewport,
        {
          className: cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          ),
          children
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollDownButton, {})
    ]
  }
) }));
SelectContent.displayName = Content2.displayName;
const SelectLabel = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Label,
  {
    ref: ref2,
    className: cn("px-2 py-1.5 text-sm font-semibold", className),
    ...props
  }
));
SelectLabel.displayName = Label.displayName;
const SelectItem = reactExports.forwardRef(({ className, children, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Item,
  {
    ref: ref2,
    className: cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ItemIndicator, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "h-4 w-4" }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ItemText, { children })
    ]
  }
));
SelectItem.displayName = Item.displayName;
const SelectSeparator = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Separator,
  {
    ref: ref2,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props
  }
));
SelectSeparator.displayName = Separator.displayName;
const Dialog = Root;
const DialogPortal = Portal$1;
const DialogOverlay = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Overlay,
  {
    ref: ref2,
    className: cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props
  }
));
DialogOverlay.displayName = Overlay.displayName;
const DialogContent = reactExports.forwardRef(({ className, children, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogPortal, { children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(DialogOverlay, {}),
  /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Content,
    {
      ref: ref2,
      className: cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
DialogContent.displayName = Content.displayName;
const DialogHeader = ({ className, ...props }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className), ...props });
DialogHeader.displayName = "DialogHeader";
const DialogTitle = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Title,
  {
    ref: ref2,
    className: cn("text-lg font-semibold leading-none tracking-tight", className),
    ...props
  }
));
DialogTitle.displayName = Title.displayName;
const DialogDescription = reactExports.forwardRef(({ className, ...props }, ref2) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Description,
  {
    ref: ref2,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
DialogDescription.displayName = Description.displayName;
function InstallPrompt() {
  const [open, setOpen] = reactExports.useState(false);
  const [deferred, setDeferred] = reactExports.useState(null);
  const [isIOS, setIsIOS] = reactExports.useState(false);
  const [installed, setInstalled] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua));
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    setInstalled(standalone);
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (installed) return null;
  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      setOpen(false);
    } else {
      setOpen(true);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Button,
      {
        onClick: handleInstall,
        variant: "ghost",
        size: "icon",
        className: "h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground",
        title: "Install App",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "h-[18px] w-[18px]" })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-sm rounded-3xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { className: "gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { className: "text-lg", children: "Install AWB Scanner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Add to your home screen for the best scanning experience." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-1 space-y-3", children: isIOS ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 1, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          "Tap the ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Share, { className: "inline mx-0.5 h-4 w-4 align-middle" }),
          " Share button in Safari"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 2, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          "Choose ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "inline mx-0.5 h-4 w-4 align-middle" }),
          ' "Add to Home Screen"'
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 3, children: 'Tap "Add" to confirm' })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 1, children: "Open the browser menu (⋮)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 2, children: 'Tap "Install app" or "Add to Home screen"' }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { n: 3, children: "Confirm to install" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => setOpen(false), variant: "secondary", className: "mt-2 h-12 w-full rounded-2xl font-semibold", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "mr-2 h-4 w-4" }),
        " Close"
      ] })
    ] }) })
  ] });
}
function Step({ n, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-3 text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary", children: n }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground/80 leading-relaxed", children })
  ] });
}
const THEME_KEY = "awb_theme_v1";
function getStoredTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
  }
  return "light";
}
function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
function useTheme() {
  const [theme, setTheme] = reactExports.useState(getStoredTheme);
  reactExports.useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);
  const toggle = reactExports.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
      }
      applyTheme(next);
      return next;
    });
  }, []);
  return { theme, isDark: theme === "dark", toggle };
}
const SETUP_KEY = "awb_setup_v1";
const loadSetup = () => {
  if (typeof window === "undefined") {
    return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
  }
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) throw new Error("empty");
    return JSON.parse(raw);
  } catch {
    return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
  }
};
const setupSlice = createSlice({
  name: "setup",
  initialState: loadSetup(),
  reducers: {
    setCompany(state, action) {
      const c = action.payload;
      state.companyId = c?.id ?? "";
      state.companySnapshot = c;
      if (!c || !c.platforms.some((p) => p.id === state.platformId)) {
        state.platformId = "";
        state.platformSnapshot = null;
      }
    },
    setPlatform(state, action) {
      state.platformId = action.payload?.id ?? "";
      state.platformSnapshot = action.payload;
    },
    setStatus(state, action) {
      state.status = action.payload;
    },
    clearSetup() {
      return { companyId: "", platformId: "", status: "", companySnapshot: null, platformSnapshot: null };
    }
  }
});
const masterSlice = createSlice({
  name: "master",
  initialState: { cache: {} },
  reducers: {
    setMaster(state, action) {
      const { path, rows } = action.payload;
      const existing = state.cache[path];
      state.cache[path] = {
        rows,
        loadedAt: Date.now(),
        scannedAwbs: existing?.scannedAwbs ?? []
      };
    },
    updateRow(state, action) {
      const { path, index: index2, row } = action.payload;
      const entry = state.cache[path];
      if (entry) entry.rows[index2] = row;
    },
    markScanned(state, action) {
      const { path, awb } = action.payload;
      const entry = state.cache[path];
      if (entry && !entry.scannedAwbs.includes(awb)) entry.scannedAwbs.push(awb);
    },
    clearScannedAwbs(state, action) {
      const entry = state.cache[action.payload.path];
      if (entry) entry.scannedAwbs = [];
    },
    invalidate(state, action) {
      delete state.cache[action.payload.path];
    }
  }
});
const { setCompany, setPlatform, setStatus, clearSetup } = setupSlice.actions;
const { setMaster, updateRow, markScanned, clearScannedAwbs, invalidate } = masterSlice.actions;
const store = configureStore({
  reducer: {
    setup: setupSlice.reducer,
    master: masterSlice.reducer
  },
  middleware: (getDefault) => getDefault({ serializableCheck: false })
});
if (typeof window !== "undefined") {
  store.subscribe(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(store.getState().setup));
    } catch {
    }
  });
}
const useAppDispatch = useDispatch;
const useAppSelector = useSelector;
const STATUSES = [
  { id: "pending", label: "Pending", dot: "bg-amber-400", pill: "bg-amber-50   border-amber-200   text-amber-700   dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400" },
  { id: "processing", label: "Processing", dot: "bg-blue-400", pill: "bg-blue-50    border-blue-200    text-blue-700    dark:bg-blue-500/10  dark:border-blue-500/30  dark:text-blue-400" },
  { id: "shipped", label: "Shipped", dot: "bg-cyan-400", pill: "bg-cyan-50    border-cyan-200    text-cyan-700    dark:bg-cyan-500/10  dark:border-cyan-500/30  dark:text-cyan-400" },
  { id: "delivered", label: "Delivered", dot: "bg-emerald-400", pill: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400" },
  { id: "cancelled", label: "Cancelled", dot: "bg-rose-400", pill: "bg-rose-50    border-rose-200    text-rose-700    dark:bg-rose-500/10   dark:border-rose-500/30   dark:text-rose-400" },
  { id: "returned", label: "Returned", dot: "bg-orange-400", pill: "bg-orange-50  border-orange-200  text-orange-700  dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-400" },
  { id: "lost", label: "Lost", dot: "bg-red-400", pill: "bg-red-50     border-red-200     text-red-700     dark:bg-red-500/10    dark:border-red-500/30    dark:text-red-400" },
  { id: "manifest", label: "Manifest", dot: "bg-violet-400", pill: "bg-violet-50  border-violet-200  text-violet-700  dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-400" }
];
function SetupScreen({ onStart }) {
  const { isDark, toggle } = useTheme();
  const dispatch = useAppDispatch();
  const setup = useAppSelector((s) => s.setup);
  const [companies, setCompanies] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [fetchError, setFetchError] = reactExports.useState(null);
  const [prefetch, setPrefetch] = reactExports.useState("idle");
  const [starting, setStarting] = reactExports.useState(false);
  const pendingRef = reactExports.useRef(null);
  const { companyId, platformId, status } = setup;
  reactExports.useEffect(() => {
    getDocs(companiesCollection).then((snap) => {
      setCompanies(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, name: data.name ?? d.id, platforms: Array.isArray(data.platforms) ? data.platforms : [] };
      }));
    }).catch((e) => setFetchError(e.message)).finally(() => setLoading(false));
  }, []);
  const company = companies.find((c) => c.id === companyId) ?? setup.companySnapshot ?? void 0;
  const platform = company?.platforms.find((p) => p.id === platformId) ?? setup.platformSnapshot ?? void 0;
  const canStart = !!company && !!platform && !!status;
  const cachedEntry = useAppSelector(
    (s) => company && platform ? s.master.cache[masterPath(company.id, platform.id)] : void 0
  );
  reactExports.useEffect(() => {
    if (!company || !platform) {
      setPrefetch("idle");
      return;
    }
    if (cachedEntry) {
      setPrefetch("ready");
      return;
    }
    setPrefetch("loading");
    let cancelled = false;
    const path = masterPath(company.id, platform.id);
    const p = (async () => {
      try {
        const rows = await readMasterRows(path);
        if (cancelled) return;
        dispatch(setMaster({ path, rows }));
        if (!cancelled) setPrefetch("ready");
      } catch {
        if (!cancelled) setPrefetch("error");
      }
    })();
    pendingRef.current = p;
    return () => {
      cancelled = true;
    };
  }, [company?.id, platform?.id, !!cachedEntry, dispatch]);
  const handleStart = async () => {
    if (!canStart || starting) return;
    if (prefetch === "loading" && pendingRef.current) {
      setStarting(true);
      try {
        await pendingRef.current;
      } finally {
        setStarting(false);
      }
    }
    onStart({ company, platform, status });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-dvh flex-col bg-background", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: "env(safe-area-inset-top)" } }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center gap-3 px-5 pt-3 pb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-primary to-primary-glow shadow-glow", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScanLine, { className: "h-5 w-5 text-primary-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[17px] font-bold leading-none tracking-tight", children: "AWB Scanner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[11px] text-muted-foreground", children: "Bulk status updates" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", onClick: toggle, className: "h-9 w-9 rounded-xl text-muted-foreground", children: isDark ? /* @__PURE__ */ jsxRuntimeExports.jsx(Sun, { className: "h-[18px] w-[18px]" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Moon, { className: "h-[18px] w-[18px]" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InstallPrompt, {})
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto px-5 pb-4 space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SectionLabel, { children: "Destination" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: companyId, onValueChange: (id) => {
            const c = companies.find((x) => x.id === id) ?? null;
            dispatch(setCompany(c));
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-auto w-full cursor-pointer items-center gap-0 rounded-none border-0 bg-transparent px-4 py-0 focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>[aria-hidden]]:hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-full items-center gap-3.5 py-3.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Building2, { className: "h-4 w-4 text-primary" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0 text-left", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", children: "Company" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-0.5 text-[15px] font-medium leading-tight truncate ${!company ? "text-muted-foreground/60" : "text-foreground"}`, children: loading ? "Loading…" : /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select company" }) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 shrink-0 text-muted-foreground/40" })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: companies.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c.id, className: "py-3 text-base", children: c.name }, c.id)) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-4 h-px bg-border/60" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: platformId, onValueChange: (id) => {
            const p = company?.platforms.find((x) => x.id === id) ?? null;
            dispatch(setPlatform(p));
          }, disabled: !company, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-auto w-full cursor-pointer items-center gap-0 rounded-none border-0 bg-transparent px-4 py-0 focus:ring-0 focus:ring-offset-0 disabled:opacity-50 [&>span]:line-clamp-none [&>[aria-hidden]]:hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-full items-center gap-3.5 py-3.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { className: "h-4 w-4 text-primary" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0 text-left", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", children: "Platform" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-0.5 text-[15px] font-medium leading-tight truncate ${!platform ? "text-muted-foreground/60" : "text-foreground"}`, children: company ? /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select platform" }) : "Pick company first" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 shrink-0 text-muted-foreground/40" })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: (company?.platforms ?? []).map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.id, className: "py-3 text-base", children: p.name }, p.id)) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SectionLabel, { children: "Status to Apply" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2", children: STATUSES.map(({ id, label, dot, pill }) => {
          const selected = status === id;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => dispatch(setStatus(id)),
              className: `relative flex h-[52px] items-center gap-3 rounded-2xl border px-4 text-left text-[14px] font-semibold transition-all active:scale-[0.96] ${selected ? "border-primary bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow" : pill}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-2 w-2 shrink-0 rounded-full ${selected ? "bg-white/60" : dot}` }),
                label
              ]
            },
            id
          );
        }) })
      ] }),
      fetchError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive", children: fetchError })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border/50 bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2.5 flex h-5 items-center justify-center gap-1.5", children: [
        canStart && prefetch === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-muted-foreground", children: "Loading master file…" })
        ] }),
        canStart && prefetch === "ready" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-3 w-3 text-emerald-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium text-emerald-600 dark:text-emerald-400", children: "Master file ready" })
        ] }),
        canStart && prefetch === "error" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3 text-amber-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-amber-600 dark:text-amber-400", children: "File not found — will retry on start" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          onClick: handleStart,
          disabled: !canStart || loading || starting,
          className: "h-14 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-[15px] font-bold tracking-wide shadow-glow transition-all active:scale-[0.98] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none",
          children: starting ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-5 w-5 animate-spin" }),
            "Preparing…"
          ] }) : prefetch === "loading" && canStart ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin opacity-60" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ScanLine, { className: "mr-1.5 h-5 w-5" }),
            "Start Scanning"
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ScanLine, { className: "mr-2 h-5 w-5" }),
            "Start Scanning"
          ] })
        }
      )
    ] })
  ] });
}
function SectionLabel({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground", children });
}
const ScannerScreen = reactExports.lazy(() => import("./ScannerScreen-C9Lyx9zi.mjs").then((m) => ({
  default: m.ScannerScreen
})));
function Index() {
  const [selection, setSelection] = reactExports.useState(null);
  const {
    isDark
  } = useTheme();
  reactExports.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
      });
    }
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Provider_default, { store, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-[480px] bg-background text-foreground antialiased", children: [
    selection ? /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-dvh items-center justify-center bg-[#080a0f]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-white/30", children: "Loading scanner…" })
    ] }) }), children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScannerScreen, { selection, onExit: () => setSelection(null) }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(SetupScreen, { onStart: setSelection }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Toaster, { theme: isDark ? "dark" : "light", position: "top-center", richColors: true, toastOptions: {
      style: {
        marginTop: "env(safe-area-inset-top)"
      }
    } })
  ] }) });
}
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  component: Index
}, Symbol.toStringTag, { value: "Module" }));
export {
  useAppSelector as a,
  setField as b,
  updateRow as c,
  markScanned as d,
  index as e,
  findRowByAwb as f,
  getField as g,
  invalidate as i,
  masterPath as m,
  readMasterRows as r,
  setMaster as s,
  useAppDispatch as u,
  writeMasterRows as w
};
