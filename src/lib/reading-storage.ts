export const STORAGE_KEY = "esteban.lista-lectura.v1";
export const WRITE_LOCK = `${STORAGE_KEY}:write`;

export type ReadingStatus = "por_leer" | "leido";
export type ReadingFilter = "todos" | ReadingStatus;
export type Book = {
  id: string;
  title: string;
  author: string;
  status: ReadingStatus;
  createdAt: string;
  updatedAt: string;
};
export type ReadingDocument = {
  schemaVersion: 1;
  revision: number;
  filter: ReadingFilter;
  books: Book[];
};
export type Operation =
  | { kind: "add"; book: Book }
  | { kind: "status"; id: string; base: Book; next: Book }
  | { kind: "filter"; filter: ReadingFilter };

export type StorageFailureKind = "unreadable" | "corrupt" | "removed" | "locks" | "uncertain" | "conflict";

export class StorageFailure extends Error {
  constructor(
    public kind: StorageFailureKind,
    message: string,
    public stored?: Book,
  ) {
    super(message);
    this.name = "StorageFailure";
  }
}

const statuses = ["por_leer", "leido"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const characterCount = (value: string) => Array.from(value.trim()).length;
const validText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value === value.trim() &&
  characterCount(value) >= min && characterCount(value) <= max;
const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function validateDocument(value: unknown): ReadingDocument {
  const invalid = () => new StorageFailure("corrupt", "Los datos guardados están dañados o usan una versión incompatible. No los hemos sobrescrito.");
  if (!object(value) || !exactKeys(value, ["schemaVersion", "revision", "filter", "books"]) ||
      value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !["todos", ...statuses].includes(value.filter as string) || !Array.isArray(value.books)) throw invalid();
  const seen = new Set<string>();
  for (const book of value.books) {
    if (!object(book) || !exactKeys(book, ["id", "title", "author", "status", "createdAt", "updatedAt"]) ||
        typeof book.id !== "string" || !uuid.test(book.id) || seen.has(book.id) ||
        !validText(book.title, 1, 200) || !validText(book.author, 0, 160) ||
        !statuses.includes(book.status as string) ||
        !validDate(book.createdAt) || !validDate(book.updatedAt) ||
        book.updatedAt < book.createdAt) throw invalid();
    seen.add(book.id);
  }
  return value as ReadingDocument;
}

export function readDocument(allowMissing: boolean): { document: ReadingDocument; exists: boolean } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new StorageFailure("unreadable", "No podemos acceder al almacenamiento en este contexto. Comprueba los permisos del navegador y vuelve a intentarlo.");
  }
  if (raw === null) {
    if (!allowMissing) throw new StorageFailure("removed", "Los datos de la lista se han eliminado en otra pestaña. Vuelve a leer antes de continuar.");
    return { document: { schemaVersion: 1, revision: 0, filter: "todos", books: [] }, exists: false };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new StorageFailure("corrupt", "No podemos leer los datos guardados. No los hemos sobrescrito."); }
  return { document: validateDocument(parsed), exists: true };
}

export const sameBook = (a: Book, b: Book) =>
  a.id === b.id && a.title === b.title && a.author === b.author &&
  a.status === b.status && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt;

function sameDocument(a: ReadingDocument, b: ReadingDocument) {
  return a.schemaVersion === b.schemaVersion && a.revision === b.revision &&
    a.filter === b.filter && a.books.length === b.books.length &&
    a.books.every((book, index) => sameBook(book, b.books[index]));
}

export function sortedBooks(books: Book[]) {
  return [...books].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export async function commitOperation(operation: Operation, allowMissing: boolean): Promise<ReadingDocument> {
  if (!navigator.locks?.request) {
    throw new StorageFailure("locks", "Este navegador no permite coordinar el guardado entre pestañas. No podemos guardar en este contexto.");
  }
  const cancellation = new AbortController();
  const timer = window.setTimeout(() => cancellation.abort(), 4000);
  try {
    return await navigator.locks.request(WRITE_LOCK, { mode: "exclusive", signal: cancellation.signal }, () => {
      window.clearTimeout(timer);
      const { document } = readDocument(allowMissing);
      let books = document.books;
      let filter = document.filter;
      if (operation.kind === "add") {
        const existing = books.find((book) => book.id === operation.book.id);
        if (existing) {
          if (existing.title === operation.book.title && existing.author === operation.book.author &&
              existing.createdAt === operation.book.createdAt) return document;
          throw new StorageFailure("conflict", "La identidad de esta incorporación ya contiene datos diferentes. No se ha sobrescrito el libro.", existing);
        }
        books = sortedBooks([operation.book, ...books]);
      } else if (operation.kind === "status") {
        const existing = books.find((book) => book.id === operation.id);
        if (existing && sameBook(existing, operation.next)) return document;
        if (!existing || !sameBook(existing, operation.base)) {
          throw new StorageFailure("conflict", "Este libro cambió en otra pestaña. Elige qué estado conservar.", existing);
        }
        books = books.map((book) => book.id === operation.id ? operation.next : book);
      } else {
        filter = operation.filter;
        if (filter === document.filter) return document;
      }
      if (document.revision === Number.MAX_SAFE_INTEGER) {
        throw new StorageFailure("corrupt", "Esta versión del registro no admite más cambios. Los datos se conservan.");
      }
      const next: ReadingDocument = { schemaVersion: 1, revision: document.revision + 1, filter, books };
      // Verification is part of the exclusive critical section, not a later UI read.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        const verified = readDocument(false).document;
        if (!sameDocument(next, verified)) throw new Error("readback");
        return verified;
      } catch {
        throw new StorageFailure("uncertain", "No se pudo confirmar el guardado. Los últimos datos confirmados se conservan. Reintentar comprobará la misma operación.");
      }
    });
  } catch (error) {
    if (error instanceof StorageFailure) throw error;
    throw new StorageFailure("locks", "No se pudo obtener acceso para guardar. Otra pestaña puede estar ocupada. Reintenta cuando esté disponible.");
  } finally {
    window.clearTimeout(timer);
  }
}
