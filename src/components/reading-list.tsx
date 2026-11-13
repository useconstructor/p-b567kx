"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Check, Circle, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STORAGE_KEY, StorageFailure, characterCount, commitOperation, readDocument, sortedBooks,
  type Book, type Operation, type ReadingDocument, type ReadingFilter,
} from "@/lib/reading-storage";

const filterLabels: Record<ReadingFilter, string> = { todos: "Todos", por_leer: "Por leer", leido: "Leídos" };
const statusLabel = (status: Book["status"]) => status === "leido" ? "Leído" : "Por leer";
type Failure = { operation: Operation; error: StorageFailure };
type FieldErrors = { title?: string; author?: string };
type FocusDestination = { kind: "row"; id: string } | { kind: "filter" } | { kind: "title" } | { kind: "recovery" };

function Bookmark({ read, large = false, onSettled }: { read: boolean; large?: boolean; onSettled?: () => void }) {
  const clipId = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 24 36" className={large ? "h-[60px] w-10 text-primary" : "relative z-[1] h-9 w-6 shrink-0 bg-background text-primary"}>
      <defs><clipPath id={clipId}><path d="M3 2H21V33L12 26L3 33Z" /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="24" height="36" fill="var(--brand-background)" />
        <rect data-bookmark-fill="" x="0" y="0" width="24" height="36" fill="currentColor"
          className={`origin-bottom transition-transform duration-[180ms] ease-linear motion-reduce:transition-none ${read ? "transform-[scaleY(1)]" : "transform-[scaleY(0)]"}`}
          onTransitionEnd={(event) => { if (event.propertyName === "transform") onSettled?.(); }} />
      </g>
      <path d="M3 2H21V33L12 26L3 33Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ActionButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} className={`min-h-11 h-auto max-w-full rounded-[var(--radius)] px-4 py-2 text-base font-semibold whitespace-normal transition-colors hover:bg-primary hover:underline disabled:opacity-100 disabled:border-dashed disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${props.className ?? ""}`} />;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="mt-4 min-w-0 border-l-2 border-destructive bg-background p-3 text-destructive [overflow-wrap:anywhere]">
    <div className="flex items-start gap-2"><AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" /><div className="min-w-0 flex-1 space-y-3 text-sm leading-5">{children}</div></div>
  </div>;
}

function Recovery({ affected, disabled, onRetry, onResolve, actionRef }: {
  affected: Failure;
  disabled: boolean;
  onRetry: (operation: Operation) => void;
  onResolve: (keepStored: boolean) => void;
  actionRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const operation = affected.operation;
  const conflict = affected.error.kind === "conflict" && operation.kind === "status";
  return <ErrorBox>
    <p className="font-semibold">{affected.error.message}</p>
    {conflict && operation.kind === "status" ? <>
      <p>Estado local: {statusLabel(operation.next.status)}.<br />Estado almacenado: {affected.error.stored ? statusLabel(affected.error.stored.status) : "Libro no disponible"}.</p>
      <div className="flex flex-wrap gap-2">
        <ActionButton ref={actionRef} disabled={disabled} onClick={() => onResolve(false)}>Aplicar mi cambio</ActionButton>
        <ActionButton variant="outline" className="border-primary text-primary hover:bg-secondary" disabled={disabled} onClick={() => onResolve(true)}>Conservar estado almacenado</ActionButton>
      </div>
    </> : <ActionButton ref={actionRef} disabled={disabled} onClick={() => onRetry(operation)}><RotateCcw aria-hidden="true" />Reintentar</ActionButton>}
    {operation.kind === "add" && <>
      <p>Incorporación pendiente: <span className="font-semibold">{operation.book.title}</span>{operation.book.author ? ` · ${operation.book.author}` : ""}.</p>
      <p>Reintentar comprueba esa incorporación. Si editas los campos, tus cambios se conservarán para guardar otro libro después.</p>
    </>}
  </ErrorBox>;
}

function statusSnapshot(book: Book, status: Book["status"]): Book {
  return { ...book, status, updatedAt: new Date(Math.max(Date.now(), Date.parse(book.updatedAt) + 1)).toISOString() };
}

export default function ReadingList() {
  const [document, setDocument] = useState<ReadingDocument | null>(null);
  const [readFailure, setReadFailure] = useState<StorageFailure | null>(null);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [validationRequest, setValidationRequest] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [savedHidden, setSavedHidden] = useState(false);
  const [departing, setDeparting] = useState<string | null>(null);
  const [focusDestination, setFocusDestination] = useState<FocusDestination | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const authorInput = useRef<HTMLInputElement>(null);
  const rowActions = useRef(new Map<string, HTMLButtonElement>());
  const filterActions = useRef(new Map<ReadingFilter, HTMLButtonElement>());
  const exists = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const exitFocus = useRef<FocusDestination | null>(null);
  const tracked = useRef(new Set<string>());
  const confirmed = useRef<ReadingDocument | null>(null);
  const completedFocus = useRef<FocusDestination | null>(null);
  const readRecoveryAction = useRef<HTMLButtonElement>(null);
  const operationRecoveryAction = useRef<HTMLButtonElement>(null);
  const submittedFields = useRef<{ id: string; title: string; author: string } | null>(null);

  function publish(next: ReadingDocument) {
    confirmed.current = next;
    setDocument(next);
  }

  function reread(explicit: boolean) {
    try {
      const next = readDocument(explicit || !exists.current);
      exists.current = next.exists;
      publish(next.document);
      setReadFailure(null);
      if (explicit) {
        setAnnouncement("Lista leída de nuevo. Tus campos se conservan.");
        setFocusDestination(failure ? { kind: "recovery" } : { kind: "title" });
      }
      return next.document;
    } catch (error) {
      const problem = error instanceof StorageFailure ? error : new StorageFailure("unreadable", "No podemos leer la lista en este contexto.");
      setReadFailure(problem);
      return null;
    }
  }

  useEffect(() => {
    mounted.current = true;
    reread(false);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        // Read the authoritative current value; event.newValue may already be stale.
        try {
          const next = readDocument(!exists.current);
          exists.current = next.exists;
          confirmed.current = next.document;
          setDocument(next.document);
          // A corruption/removal barrier requires the visitor's explicit reread.
        } catch (error) {
          setReadFailure(error instanceof StorageFailure ? error : new StorageFailure("unreadable", "No podemos leer la lista en este contexto."));
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", handleStorage);
      window.clearTimeout(exitTimer.current);
    };
    // Storage is initialized once per mounted tool, never in SSR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!validationRequest) return;
    if (errors.title) titleInput.current?.focus();
    else if (errors.author) authorInput.current?.focus();
  }, [validationRequest, errors]);

  useEffect(() => {
    if (!focusDestination || completedFocus.current === focusDestination || busy || departing) return;
    completedFocus.current = focusDestination;
    if (focusDestination.kind === "recovery") {
      const action = readRecoveryAction.current || operationRecoveryAction.current;
      action?.focus();
    } else if (focusDestination.kind === "title") titleInput.current?.focus();
    else if (focusDestination.kind === "row") {
      const action = rowActions.current.get(focusDestination.id);
      if (action && !action.disabled) action.focus();
      else if (document) filterActions.current.get(document.filter)?.focus();
    } else if (document) filterActions.current.get(document.filter)?.focus();
  }, [focusDestination, busy, departing, document]);

  function finishDeparture() {
    window.clearTimeout(exitTimer.current);
    setDeparting(null);
    if (exitFocus.current) setFocusDestination(exitFocus.current);
    exitFocus.current = null;
  }

  function track(operation: Operation) {
    if (operation.kind === "filter") return;
    const token = operation.kind === "add" ? operation.book.id : `${operation.id}:${operation.next.updatedAt}:${operation.next.status}`;
    if (tracked.current.has(token)) return;
    tracked.current.add(token);
    const runtime = window as Window & { constructorTrack?: (event: string) => void };
    if (navigator.doNotTrack !== "1") {
      try { runtime.constructorTrack?.(operation.kind === "add" ? "Book saved" : "Reading status changed"); }
      catch { /* An optional platform collector cannot change a verified local result. */ }
    }
  }

  async function execute(operation: Operation) {
    if (inFlight.current || readFailure) return;
    inFlight.current = true;
    setBusy(operation);
    setFailure(null);
    setAnnouncement("");
    setFocusDestination(null);
    try {
      const before = confirmed.current;
      const next = await commitOperation(operation, !exists.current);
      if (!mounted.current) return;
      exists.current = true;
      publish(next);
      setFailure(null);
      if (operation.kind === "add") {
        const submitted = submittedFields.current;
        if (submitted?.id === operation.book.id && title === submitted.title && author === submitted.author) {
          setTitle("");
          setAuthor("");
          setErrors({});
        }
        submittedFields.current = null;
        setSavedHidden(next.filter === "leido" && next.books.find((book) => book.id === operation.book.id)?.status === "por_leer");
        setAnnouncement("Libro guardado en este navegador");
        setFocusDestination({ kind: "title" });
      } else if (operation.kind === "filter") {
        setSavedHidden(false);
        setAnnouncement(`Filtro: ${filterLabels[next.filter]}`);
        setFocusDestination({ kind: "filter" });
      } else {
        const updated = next.books.find((book) => book.id === operation.id);
        setAnnouncement(`${operation.next.title}: ${updated?.status === "leido" ? "marcado como leído" : "vuelve a por leer"}.`);
        if (updated && next.filter !== "todos" && updated.status !== next.filter) {
          const previous = sortedBooks(before?.books ?? []).filter((book) => before?.filter === "todos" || book.status === before?.filter);
          const index = previous.findIndex((book) => book.id === operation.id);
          const available = sortedBooks(next.books).filter((book) => book.status === next.filter);
          const following = previous.slice(index + 1).find((book) => available.some((candidate) => candidate.id === book.id));
          const destination: FocusDestination = following ? { kind: "row", id: following.id } : { kind: "filter" };
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setFocusDestination(destination);
          } else {
            exitFocus.current = destination;
            setDeparting(operation.id);
            // transitionend is the primary completion; this bounds cleanup if rendering is interrupted.
            exitTimer.current = window.setTimeout(finishDeparture, 220);
          }
        } else {
          setFocusDestination({ kind: "row", id: operation.id });
        }
      }
      track(operation);
    } catch (error) {
      if (!mounted.current) return;
      const problem = error instanceof StorageFailure ? error : new StorageFailure("uncertain", "No se pudo confirmar el guardado. Tus datos se conservan.");
      setFailure({ operation, error: problem });
      if (["corrupt", "removed", "unreadable"].includes(problem.kind)) setReadFailure(problem);
      setFocusDestination({ kind: "recovery" });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !document || readFailure || failure) return;
    const nextErrors: FieldErrors = {};
    if (characterCount(title) === 0) nextErrors.title = "Escribe el título del libro.";
    else if (characterCount(title) > 200) nextErrors.title = "El título debe tener como máximo 200 caracteres.";
    if (characterCount(author) > 160) nextErrors.author = "El autor debe tener como máximo 160 caracteres.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setValidationRequest((value) => value + 1);
      setAnnouncement("");
      return;
    }
    const now = new Date().toISOString();
    const book: Book = { id: crypto.randomUUID(), title: title.trim(), author: author.trim(), status: "por_leer", createdAt: now, updatedAt: now };
    submittedFields.current = { id: book.id, title, author };
    void execute({ kind: "add", book });
  }

  function changeStatus(book: Book) {
    if (busy || failure || departing) return;
    const next = statusSnapshot(book, book.status === "leido" ? "por_leer" : "leido");
    void execute({ kind: "status", id: book.id, base: { ...book }, next });
  }

  function changeFilter(filter: ReadingFilter) {
    if (!document || busy || failure || departing || filter === document.filter) return;
    void execute({ kind: "filter", filter });
  }

  async function resolveConflict(keepStored: boolean) {
    if (!failure || failure.operation.kind !== "status" || inFlight.current) return;
    const operation = failure.operation;
    const fresh = reread(false);
    if (!fresh) return;
    const stored = fresh.books.find((book) => book.id === operation.id);
    if (keepStored) {
      setFailure(null);
      setAnnouncement("Se conserva el estado almacenado.");
      setFocusDestination(stored ? { kind: "row", id: stored.id } : { kind: "filter" });
      return;
    }
    if (!stored) {
      setFailure({ operation, error: new StorageFailure("conflict", "El libro ya no está en el registro. No se puede aplicar el cambio.") });
      return;
    }
    const next = statusSnapshot(stored, operation.next.status);
    await execute({ kind: "status", id: stored.id, base: { ...stored }, next });
  }

  const waiting = !document && !readFailure;
  const unavailable = !document || !!readFailure;
  const locked = unavailable || !!busy || !!failure || !!departing;
  const frozenForm = busy?.kind === "add";
  const failedBookId = failure?.operation.kind === "status" ? failure.operation.id : null;
  const visibleBooks = document ? sortedBooks(document.books).filter((book) =>
    document.filter === "todos" || book.status === document.filter || book.id === departing ||
    book.id === failedBookId) : [];
  const missingConflict = failedBookId !== null && !visibleBooks.some((book) => book.id === failedBookId);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
      <section aria-labelledby="new-reading-heading" className="min-w-0">
        <h2 id="new-reading-heading" className="mb-3 text-xl leading-[26px] font-semibold lg:mb-6">Nueva lectura</h2>
        <form noValidate onSubmit={submit} aria-busy={busy?.kind === "add"} className="space-y-3 lg:space-y-4">
          {Object.keys(errors).length > 0 && <div role="alert" className="border-l-2 border-destructive bg-background p-3 text-sm text-destructive">
            <p className="font-semibold">Revisa los campos antes de guardar.</p>
            <ul className="mt-1">
              {errors.title && <li><a className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2" href="#book-title" onClick={(event) => { event.preventDefault(); titleInput.current?.focus(); }}>{errors.title}</a></li>}
              {errors.author && <li><a className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2" href="#book-author" onClick={(event) => { event.preventDefault(); authorInput.current?.focus(); }}>{errors.author}</a></li>}
            </ul>
          </div>}
          <div>
            <label htmlFor="book-title" className="mb-1 flex items-baseline justify-between gap-2 font-medium">Título <span className="text-sm font-normal">Obligatorio</span></label>
            <Input ref={titleInput} id="book-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)}
              disabled={waiting || !!frozenForm} aria-required="true" aria-invalid={!!errors.title}
              aria-describedby={`title-help${errors.title ? " title-error" : ""}`} autoComplete="off"
              className="h-11 rounded-[var(--radius)] border-primary bg-background px-3 text-base md:text-base disabled:opacity-100 disabled:bg-secondary" />
            <p id="title-help" className="mt-1 text-sm leading-5">Máximo 200 caracteres.</p>
            {errors.title && <p id="title-error" className="mt-1 text-sm leading-5 text-destructive">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="book-author" className="mb-1 flex items-baseline justify-between gap-2 font-medium">Autor <span className="text-sm font-normal">Opcional</span></label>
            <Input ref={authorInput} id="book-author" name="author" value={author} onChange={(event) => setAuthor(event.target.value)}
              disabled={waiting || !!frozenForm} aria-invalid={!!errors.author} aria-describedby={`author-help${errors.author ? " author-error" : ""}`}
              autoComplete="off" className="h-11 rounded-[var(--radius)] border-primary bg-background px-3 text-base md:text-base disabled:opacity-100 disabled:bg-secondary" />
            <p id="author-help" className="mt-1 text-sm leading-5">Máximo 160 caracteres.</p>
            {errors.author && <p id="author-error" className="mt-1 text-sm leading-5 text-destructive">{errors.author}</p>}
          </div>
          <ActionButton type="submit" disabled={locked} className="w-full">
            {busy?.kind === "add" ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Plus aria-hidden="true" />}
            {busy?.kind === "add" ? "Guardando…" : "Guardar libro"}
          </ActionButton>
        </form>
        {readFailure && <ErrorBox>
          <p className="font-semibold">{readFailure.message}</p>
          <p>No se harán cambios hasta recuperar la lectura del almacenamiento.</p>
          <ActionButton ref={readRecoveryAction} disabled={!!busy} onClick={() => reread(true)}><RotateCcw aria-hidden="true" />{readFailure.kind === "unreadable" ? "Reintentar" : "Volver a leer"}</ActionButton>
        </ErrorBox>}
        {failure?.operation.kind === "add" && <Recovery affected={failure} actionRef={operationRecoveryAction} disabled={!!busy || !!readFailure} onRetry={execute} onResolve={resolveConflict} />}
        <div role="status" aria-live="polite" aria-atomic="true" className={announcement ? "mt-4 flex items-start gap-2 text-sm leading-5 text-confirmation [overflow-wrap:anywhere]" : "sr-only"}>
          {announcement && <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <p>{announcement}</p>
        </div>
        {savedHidden && <ActionButton variant="link" disabled={locked} onClick={() => changeFilter("por_leer")} className="mt-2 px-0 text-primary hover:bg-transparent">Ver por leer <ArrowRight aria-hidden="true" /></ActionButton>}
      </section>

      <section aria-label="Registro de lecturas" className="min-w-0 rounded-[var(--radius)] bg-background">
        <div className="border-b border-primary/25 px-4 py-3 sm:px-6">
          <div role="group" aria-label="Filtros del registro" className="flex flex-wrap items-center gap-1">
            {(Object.keys(filterLabels) as ReadingFilter[]).map((filter) => <ActionButton key={filter}
              ref={(node) => { if (node) filterActions.current.set(filter, node); else filterActions.current.delete(filter); }}
              aria-pressed={document?.filter === filter} disabled={locked} onClick={() => changeFilter(filter)}
              variant={document?.filter === filter ? "default" : "ghost"}
              className={document?.filter === filter ? "gap-2 transition-none" : "text-primary hover:bg-secondary transition-none"}
            >{document?.filter === filter && <Check aria-hidden="true" />}{filterLabels[filter]}</ActionButton>)}
          </div>
          {busy?.kind === "filter" && <p role="status" className="mt-2 text-sm">Guardando filtro…</p>}
          {failure?.operation.kind === "filter" && <Recovery affected={failure} actionRef={operationRecoveryAction} disabled={!!busy || !!readFailure} onRetry={execute} onResolve={resolveConflict} />}
        </div>

        {waiting ? <div role="status" className="flex min-h-56 items-center justify-center gap-2 p-6"><LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />Cargando tu lista…</div>
          : !document ? <div className="p-6"><p className="font-semibold">Tu lista aún no está disponible.</p><p className="mt-2 text-sm">Recupera el acceso al almacenamiento para volver a leerla.</p></div>
          : visibleBooks.length === 0 ? <div className="flex min-h-56 flex-col items-start gap-4 px-6 py-8 sm:px-8 lg:min-h-80 lg:py-12">
            <Bookmark read={false} large />
            <div>
              <h2 className="text-xl leading-[26px] font-semibold">{document.filter === "todos" ? "Tu próxima lectura empieza aquí" : document.filter === "leido" ? "Todavía no hay libros leídos" : "No hay libros por leer"}</h2>
              <p className="mt-2 max-w-sm text-base leading-6">{document.filter === "todos" ? "Añade un título y, si quieres, su autor." : document.filter === "leido" ? "Los libros que marques como leídos aparecerán aquí." : "Puedes añadir una nueva lectura o consultar el registro completo."}</p>
            </div>
            {document.filter !== "todos" && <ActionButton variant="outline" className="border-primary text-primary hover:bg-secondary" disabled={locked} onClick={() => changeFilter("todos")}>Ver todos <ArrowRight aria-hidden="true" /></ActionButton>}
          </div> : <ul className="relative px-4 sm:px-6 before:absolute before:top-8 before:bottom-8 before:left-[27px] before:w-px before:bg-primary/35 sm:before:left-[35px]">
            {visibleBooks.map((book) => {
              const rowBusy = busy?.kind === "status" && busy.id === book.id;
              const rowFailure = failure?.operation.kind === "status" && failure.operation.id === book.id ? failure : null;
              const leaving = departing === book.id;
              return <li key={book.id} data-book-id={book.id} aria-busy={rowBusy} className="relative flex min-w-0 gap-4 border-b border-primary/20 py-6 last:border-b-0">
                <Bookmark read={book.status === "leido"} onSettled={leaving ? finishDeparture : undefined} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl leading-[26px] font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]">{book.title}</h3>
                  {book.author && <p className="mt-1 text-base leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{book.author}</p>}
                  <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                    <p className={`inline-flex min-h-8 items-center gap-2 text-sm font-medium ${book.status === "leido" ? "text-confirmation" : "text-foreground"}`}>
                      {book.status === "leido" ? <Check aria-hidden="true" className="size-4" /> : <Circle aria-hidden="true" className="size-3" />}{statusLabel(book.status)}
                    </p>
                    <ActionButton variant="outline" className="max-w-full border-primary text-primary hover:bg-secondary"
                      ref={(node) => { if (node) rowActions.current.set(book.id, node); else rowActions.current.delete(book.id); }}
                      disabled={locked} onClick={() => changeStatus(book)}
                      aria-label={`${book.status === "leido" ? "Volver a por leer" : "Marcar como leído"}: ${book.title}`}
                    >{rowBusy ? <><LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />Guardando…</> : book.status === "leido" ? <><RotateCcw aria-hidden="true" />Volver a por leer</> : <><Check aria-hidden="true" />Marcar como leído</>}</ActionButton>
                  </div>
                  {rowFailure && <Recovery affected={rowFailure} actionRef={operationRecoveryAction} disabled={!!busy || !!readFailure} onRetry={execute} onResolve={resolveConflict} />}
                </div>
              </li>;
            })}
          </ul>}
        {missingConflict && failure && <div className="px-4 pb-4 sm:px-6"><h3 className="mt-4 text-xl font-semibold [overflow-wrap:anywhere]">{failure.operation.kind === "status" && failure.operation.base.title}</h3><Recovery affected={failure} actionRef={operationRecoveryAction} disabled={!!busy || !!readFailure} onRetry={execute} onResolve={resolveConflict} /></div>}
      </section>
    </div>
  );
}
