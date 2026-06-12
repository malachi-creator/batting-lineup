// In-memory stand-in for firebase/app + firebase/firestore + firebase/auth.
// Activated by `VITE_MOCK=1 npm run dev` (vite alias) so the full game flow
// can be exercised without Firestore rules or network.

const store = new Map(); // path -> data object
const listeners = new Set(); // {colPath, fire}
let idSeq = 1;

const newId = () => `mock${idSeq++}`;
const parentOf = (path) => path.split("/").slice(0, -1).join("/");

function notify(colPath) {
  queueMicrotask(() => {
    listeners.forEach((l) => {
      if (l.colPath === colPath) {
        try {
          l.fire();
        } catch {
          // Keep other listeners running if one handler throws.
        }
      }
    });
  });
}

function colDocs(colPath) {
  const depth = colPath.split("/").length + 1;
  const out = [];
  store.forEach((data, path) => {
    if (path.startsWith(colPath + "/") && path.split("/").length === depth) {
      out.push({ id: path.split("/").pop(), data: () => ({ ...data }) });
    }
  });
  return out;
}

function snapshotOf(q) {
  let docs = colDocs(q.colPath);
  (q.wheres || []).forEach(({ field, op, value }) => {
    if (op === "==") docs = docs.filter((d) => d.data()[field] === value);
  });
  if (q.order) {
    const { field, dir } = q.order;
    docs.sort((a, b) => {
      const av = a.data()[field];
      const bv = b.data()[field];
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "desc" ? -c : c;
    });
  }
  if (q.limit) {
    docs = docs.slice(0, q.limit.n);
  }
  return { docs, empty: docs.length === 0, metadata: { fromCache: false } };
}

// firebase/app
export const initializeApp = () => ({});

// firebase/auth
export const getAuth = () => ({});
export const signInAnonymously = async () => ({});

// firebase/firestore
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const serverTimestamp = () => ({ seconds: Math.floor(Date.now() / 1000) });

export function collection(_db, ...segs) {
  return { type: "col", path: segs.join("/") };
}

export function doc(dbOrCol, ...segs) {
  if (dbOrCol && dbOrCol.type === "col") {
    const id = segs[0] || newId();
    return { type: "doc", path: `${dbOrCol.path}/${id}`, id };
  }
  const path = segs.join("/");
  return { type: "doc", path, id: segs[segs.length - 1] };
}

export const orderBy = (field, dir = "asc") => ({ qc: "order", field, dir });
export const where = (field, op, value) => ({ qc: "where", field, op, value });
export const limit = (n) => ({ qc: "limit", n });

export function query(col, ...constraints) {
  const order = constraints.find((c) => c && c.qc === "order");
  const wheres = constraints.filter((c) => c && c.qc === "where");
  const lim = constraints.find((c) => c && c.qc === "limit");
  return { colPath: col.path, order, wheres, limit: lim };
}

function resolveSnapshotHandler(arg2, arg3, arg4) {
  // Match firebase/firestore overloads:
  // onSnapshot(q, onNext)
  // onSnapshot(q, onNext, onError)
  // onSnapshot(q, observer)
  // onSnapshot(q, options, onNext)
  // onSnapshot(q, options, observer)
  if (typeof arg2 === "function") {
    return { onNext: arg2, onError: typeof arg3 === "function" ? arg3 : undefined };
  }
  if (arg2 && typeof arg2 === "object") {
    if (typeof arg2.next === "function") {
      return { onNext: arg2.next, onError: arg2.error };
    }
    if (typeof arg3 === "function") {
      return { onNext: arg3, onError: typeof arg4 === "function" ? arg4 : undefined };
    }
    if (arg3 && typeof arg3.next === "function") {
      return { onNext: arg3.next, onError: arg3.error };
    }
  }
  return null;
}

export function onSnapshot(q, arg2, arg3, arg4) {
  const colPath = q.colPath || q.path;
  const handler = resolveSnapshotHandler(arg2, arg3, arg4);
  if (!handler) {
    throw new TypeError("onSnapshot called with an invalid callback");
  }
  const fire = () => {
    try {
      const snap = snapshotOf({ colPath, order: q.order, wheres: q.wheres, limit: q.limit });
      snap.metadata.hasPendingWrites = false;
      handler.onNext(snap);
    } catch (err) {
      handler.onError?.(err);
    }
  };
  const l = { colPath, fire };
  listeners.add(l);
  queueMicrotask(fire);
  return () => listeners.delete(l);
}

export async function getDocs(q) {
  return snapshotOf({ colPath: q.colPath || q.path, order: q.order, wheres: q.wheres, limit: q.limit });
}

export const getDocsFromServer = getDocs;

export async function getDoc(ref) {
  const data = store.get(ref.path);
  return { exists: () => !!data, data: () => (data ? { ...data } : undefined) };
}

export async function addDoc(col, data) {
  const id = newId();
  const ref = { type: "doc", path: `${col.path}/${id}`, id };
  store.set(ref.path, { ...data });
  notify(col.path);
  return ref;
}

export async function setDoc(ref, data, opts) {
  const base = opts?.merge ? store.get(ref.path) || {} : {};
  store.set(ref.path, { ...base, ...data });
  notify(parentOf(ref.path));
}

export async function updateDoc(ref, patch) {
  store.set(ref.path, { ...(store.get(ref.path) || {}), ...patch });
  notify(parentOf(ref.path));
}

export async function deleteDoc(ref) {
  store.delete(ref.path);
  notify(parentOf(ref.path));
}

export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data) => ops.push(() => setDoc(ref, data)),
    update: (ref, patch) => ops.push(() => updateDoc(ref, patch)),
    delete: (ref) => ops.push(() => deleteDoc(ref)),
    commit: async () => {
      for (const op of ops) await op();
    },
  };
}
