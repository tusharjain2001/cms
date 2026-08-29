"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "./api";
import { useAuth } from "./auth";
import { sectionPreview } from "./dto";
import type {
  PageDTO,
  PageSummaryDTO,
  ProjectDTO,
  SectionContent,
  SectionDTO,
  SectionTypeDef,
} from "./dto";
import type { PageTemplate } from "./templates";

/**
 * All dashboard state, backed by the CMS API.
 *
 * Two deliberate choices here:
 *
 *  1. The section registry is FETCHED, never hard-coded. The dashboard has no
 *     built-in idea what a Hero is — it renders whatever field definitions the
 *     API sends. Adding a section type on the server makes it appear here.
 *
 *  2. Content edits are held locally and saved on a debounce. The client types
 *     into React state (instant), and 600ms later it reaches the server. That
 *     is what "everything saves as you type" means without a request per key.
 */

type ModalKind = "picker" | "addpage" | "confirm" | "invite" | null;
type SavingState = "saved" | "saving" | "error";

interface PendingDelete {
  kind: "page" | "section";
  id: string;
  name: string;
}

export interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "publish" | "error";
}

interface Store {
  // registry
  sectionTypes: SectionTypeDef[];
  typeFor: (type: string) => SectionTypeDef | undefined;

  // projects
  projects: ProjectDTO[];
  project: ProjectDTO | null;
  projectId: string;
  setProjectId: (id: string) => void;
  createProject: (name: string, domain: string) => Promise<ProjectDTO | null>;
  updateProject: (patch: Partial<ProjectDTO> & { revalidateSecret?: string }) => Promise<void>;
  rotateApiKey: () => Promise<void>;

  // pages
  pages: PageSummaryDTO[];
  loadingPages: boolean;
  addPage: (title: string) => Promise<void>;
  addPageFromTemplate: (title: string, template: PageTemplate) => Promise<PageDTO | null>;
  duplicatePage: (id: string) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
  movePage: (from: number, to: number) => Promise<void>;

  // the open page
  page: PageDTO | null;
  loadingPage: boolean;
  openPage: (pageId: string) => void;
  selected: string;
  selectSection: (id: string) => void;
  selectedSection: SectionDTO | null;
  selectedDef: SectionTypeDef | undefined;
  /** Live content for the selected section, ahead of the debounced save. */
  draftContent: SectionContent;
  setFieldValue: (key: string, value: unknown) => void;
  previewFor: (section: SectionDTO) => string;
  /** Undo/redo over the selected section's field edits (client-only, per section). */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // section actions
  addSection: (type: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  toggleHidden: (id: string) => Promise<void>;
  renameSection: (id: string, name: string) => void;
  moveSection: (from: number, to: number) => Promise<void>;

  // save / publish
  saving: SavingState;
  dirty: boolean;
  publishedNow: boolean;
  publish: () => Promise<void>;
  discard: () => Promise<void>;
  preview: () => Promise<void>;
  publishIssues: { path: string; message: string }[];

  // chrome
  modal: ModalKind;
  openModal: (kind: Exclude<ModalKind, null>) => void;
  closeModal: () => void;
  pendingDelete: PendingDelete | null;
  askDelete: (d: PendingDelete) => void;
  confirmDelete: () => Promise<void>;
  toast: Toast | null;
  pushToast: (msg: string, kind?: Toast["kind"]) => void;
  reportError: (err: unknown) => void;
}

const StoreContext = createContext<Store | null>(null);

const SAVE_DEBOUNCE_MS = 600;
/** Cap on undo/redo history for the selected section, so it can't grow unbounded. */
const HISTORY_LIMIT = 100;

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  const [sectionTypes, setSectionTypes] = useState<SectionTypeDef[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [projectId, setProjectIdState] = useState("");

  const [pages, setPages] = useState<PageSummaryDTO[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  const [page, setPage] = useState<PageDTO | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [selected, setSelected] = useState("");
  const [draftContent, setDraftContent] = useState<SectionContent>({});
  // Kept fresh every render (same pattern as Modal's onCloseRef) so undo/redo
  // and the coalescing check can read the latest draft without being a dep
  // of setFieldValue's useCallback.
  const draftRef = useRef<SectionContent>(draftContent);
  draftRef.current = draftContent;

  // Undo/redo history for the selected section's field edits only. Client-only,
  // reset whenever the selected section changes.
  const [past, setPast] = useState<SectionContent[]>([]);
  const [future, setFuture] = useState<SectionContent[]>([]);
  /** Consecutive edits to this field within SAVE_DEBOUNCE_MS coalesce into one step. */
  const lastEditKey = useRef<string | null>(null);
  const lastEditTime = useRef(0);

  const [saving, setSaving] = useState<SavingState>("saved");
  const [publishedNow, setPublishedNow] = useState(false);
  const [publishIssues, setPublishIssues] = useState<{ path: string; message: string }[]>([]);

  const [modal, setModal] = useState<ModalKind>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a slow save overwriting a newer one. */
  const saveSeq = useRef(0);

  const pushToast = useCallback((msg: string, kind: Toast["kind"] = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), 4600);
  }, []);

  const reportError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        const detail = err.issues[0]?.message;
        pushToast(detail ? `${err.message} ${detail}` : err.message, "error");
      } else {
        pushToast("Something went wrong. Please try again.", "error");
      }
    },
    [pushToast]
  );

  /* ------------------------------------------------------- initial loading */

  useEffect(() => {
    if (status !== "signedIn") return;
    let cancelled = false;
    (async () => {
      try {
        const [types, list] = await Promise.all([
          api<SectionTypeDef[]>("/api/section-types"),
          api<ProjectDTO[]>("/api/projects"),
        ]);
        if (cancelled) return;
        setSectionTypes(types);
        setProjects(list);
        setProjectIdState((current) => current || list[0]?.id || "");
      } catch (err) {
        if (!cancelled) reportError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, reportError]);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const typeFor = useCallback(
    (type: string) => sectionTypes.find((t) => t.type === type),
    [sectionTypes]
  );

  /* ------------------------------------------------------------- pages list */

  const refreshPages = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoadingPages(true);
      try {
        setPages(await api<PageSummaryDTO[]>(`/api/projects/${id}/pages`));
      } catch (err) {
        reportError(err);
      } finally {
        setLoadingPages(false);
      }
    },
    [reportError]
  );

  useEffect(() => {
    if (status !== "signedIn" || !projectId) return;
    void refreshPages(projectId);
  }, [status, projectId, refreshPages]);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    setPage(null);
    setSelected("");
  }, []);

  /* -------------------------------------------------------------- one page */

  const applyPage = useCallback((next: PageDTO, keepSelection = true) => {
    setPage(next);
    setSelected((current) => {
      const sections = next.draftSections ?? [];
      if (keepSelection && sections.some((s) => s.id === current)) return current;
      return sections[0]?.id ?? "";
    });
  }, []);

  const openPage = useCallback(
    (pageId: string) => {
      let cancelled = false;
      setLoadingPage(true);
      setPublishedNow(false);
      setPublishIssues([]);
      (async () => {
        try {
          const next = await api<PageDTO>(`/api/pages/${pageId}`);
          if (cancelled) return;
          applyPage(next, false);
        } catch (err) {
          if (!cancelled) reportError(err);
        } finally {
          if (!cancelled) setLoadingPage(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [applyPage, reportError]
  );

  const selectedSection = useMemo(
    () => page?.draftSections?.find((s) => s.id === selected) ?? null,
    [page, selected]
  );
  const selectedDef = selectedSection ? typeFor(selectedSection.type) : undefined;

  // Reset the local editing buffer — and its undo/redo history — whenever a
  // different section is opened.
  useEffect(() => {
    setDraftContent(selectedSection ? { ...selectedSection.content } : {});
    setPast([]);
    setFuture([]);
    lastEditKey.current = null;
  }, [selectedSection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewFor = useCallback(
    (section: SectionDTO) => sectionPreview(typeFor(section.type), section.content),
    [typeFor]
  );

  /* ---------------------------------------------------- editing + autosave */

  const flushSave = useCallback(
    async (sectionId: string, content: SectionContent) => {
      if (!page) return;
      const seq = ++saveSeq.current;
      setSaving("saving");
      try {
        const next = await api<PageDTO>(`/api/pages/${page.id}/sections/${sectionId}`, {
          method: "PATCH",
          body: { content },
        });
        // A newer keystroke already started saving — let it win.
        if (seq !== saveSeq.current) return;
        setPage(next);
        setSaving("saved");
        setPublishedNow(false);
      } catch (err) {
        if (seq !== saveSeq.current) return;
        setSaving("error");
        reportError(err);
      }
    },
    [page, reportError]
  );

  const setFieldValue = useCallback(
    (key: string, value: unknown) => {
      if (!selectedSection) return;
      const sectionId = selectedSection.id;

      // Record an undo step for the value as it stood before this edit —
      // unless this is a rapid follow-up edit to the same field (typing),
      // which coalesces into the step already recorded.
      const now = Date.now();
      const coalesces = key === lastEditKey.current && now - lastEditTime.current < SAVE_DEBOUNCE_MS;
      if (!coalesces) {
        setPast((p) => {
          const next = [...p, draftRef.current];
          return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
        });
        setFuture([]);
      }
      lastEditKey.current = key;
      lastEditTime.current = now;

      setDraftContent((current) => {
        const next = { ...current, [key]: value } as SectionContent;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flushSave(sectionId, next), SAVE_DEBOUNCE_MS);
        return next;
      });
      setSaving("saving");
    },
    [selectedSection, flushSave]
  );

  /**
   * Step backward/forward through the selected section's edit history. Both
   * bypass setFieldValue entirely — they read/write draftContent and the save
   * path directly — so an undo/redo can never itself be recorded as a new
   * undo step (no re-entrancy guard needed).
   */
  const undo = useCallback(() => {
    if (!selectedSection || past.length === 0) return;
    const sectionId = selectedSection.id;
    const restored = past[past.length - 1];
    // Drop any edit mid-debounce: it captured content from before this undo
    // and would otherwise land after it and clobber the restored value.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setPast((p) => p.slice(0, -1));
    setFuture((f) => {
      const next = [...f, draftRef.current];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setDraftContent(restored);
    lastEditKey.current = null; // the next edit always starts a fresh step
    setSaving("saving");
    void flushSave(sectionId, restored);
  }, [selectedSection, past, flushSave]);

  const redo = useCallback(() => {
    if (!selectedSection || future.length === 0) return;
    const sectionId = selectedSection.id;
    const restored = future[future.length - 1];
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setFuture((f) => f.slice(0, -1));
    setPast((p) => {
      const next = [...p, draftRef.current];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setDraftContent(restored);
    lastEditKey.current = null;
    setSaving("saving");
    void flushSave(sectionId, restored);
  }, [selectedSection, future, flushSave]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  /* -------------------------------------------------------- page mutations */

  const addPage = useCallback(
    async (title: string) => {
      if (!projectId) return;
      try {
        const created = await api<PageDTO>(`/api/projects/${projectId}/pages`, {
          method: "POST",
          body: { title },
        });
        await refreshPages(projectId);
        setModal(null);
        pushToast(`“${created.title}” added. It is not live until you publish it.`);
      } catch (err) {
        reportError(err);
      }
    },
    [projectId, refreshPages, pushToast, reportError]
  );

  const addPageFromTemplate = useCallback(
    async (title: string, template: PageTemplate) => {
      if (!projectId) return null;
      // Only seed section types this website actually has enabled — never let
      // a template send a type the project doesn't allow.
      const allowed = new Set(project?.allowedSectionTypes ?? []);
      const applicable = template.sections.filter((sec) => allowed.has(sec.type) && typeFor(sec.type));
      try {
        const created = await api<PageDTO>(`/api/projects/${projectId}/pages`, {
          method: "POST",
          body: { title },
        });
        for (const sec of applicable) {
          const added = await api<{ section: SectionDTO }>(`/api/pages/${created.id}/sections`, {
            method: "POST",
            body: { type: sec.type },
          });
          await api(`/api/pages/${created.id}/sections/${added.section.id}`, {
            method: "PATCH",
            body: sec.name ? { content: sec.content, name: sec.name } : { content: sec.content },
          });
        }
        await refreshPages(projectId);
        setModal(null);
        pushToast(`“${created.title}” added from the ${template.name} template. Edit it, then Publish when ready.`);
        return created;
      } catch (err) {
        reportError(err);
        return null;
      }
    },
    [projectId, project, typeFor, refreshPages, pushToast, reportError]
  );

  const duplicatePage = useCallback(
    async (id: string) => {
      const source = pages.find((p) => p.id === id);
      if (!source || !projectId) return;
      try {
        const full = await api<PageDTO>(`/api/pages/${id}`);
        const copy = await api<PageDTO>(`/api/projects/${projectId}/pages`, {
          method: "POST",
          body: { title: `${source.title} copy`, slug: `${source.slug || "home"}-copy` },
        });
        // Re-create each section on the copy, in order.
        for (const section of full.draftSections ?? []) {
          const added = await api<{ section: SectionDTO }>(`/api/pages/${copy.id}/sections`, {
            method: "POST",
            body: { type: section.type },
          });
          await api(`/api/pages/${copy.id}/sections/${added.section.id}`, {
            method: "PATCH",
            body: { content: section.content, name: section.name, visible: section.visible },
          });
        }
        await refreshPages(projectId);
        pushToast(`“${source.title}” duplicated`);
      } catch (err) {
        reportError(err);
      }
    },
    [pages, projectId, refreshPages, pushToast, reportError]
  );

  const deletePage = useCallback(
    async (id: string) => {
      try {
        await api(`/api/pages/${id}`, { method: "DELETE" });
        if (page?.id === id) setPage(null);
        await refreshPages(projectId);
        pushToast("Page deleted");
      } catch (err) {
        reportError(err);
      }
    },
    [page, projectId, refreshPages, pushToast, reportError]
  );

  const movePage = useCallback(
    async (from: number, to: number) => {
      const reordered = move(pages, from, to);
      setPages(reordered); // optimistic: dragging must feel instant
      try {
        setPages(
          await api<PageSummaryDTO[]>(`/api/projects/${projectId}/pages/reorder`, {
            method: "PATCH",
            body: { ids: reordered.map((p) => p.id) },
          })
        );
        pushToast("Menu order updated");
      } catch (err) {
        setPages(pages);
        reportError(err);
      }
    },
    [pages, projectId, pushToast, reportError]
  );

  /* ----------------------------------------------------- section mutations */

  const addSection = useCallback(
    async (type: string) => {
      if (!page) return;
      try {
        const res = await api<{ page: PageDTO; section: SectionDTO }>(
          `/api/pages/${page.id}/sections`,
          { method: "POST", body: { type } }
        );
        setPage(res.page);
        setSelected(res.section.id);
        setModal(null);
        setPublishedNow(false);
        pushToast(`${typeFor(type)?.name ?? type} section added`);
      } catch (err) {
        reportError(err);
      }
    },
    [page, typeFor, pushToast, reportError]
  );

  const deleteSection = useCallback(
    async (id: string) => {
      if (!page) return;
      try {
        applyPage(await api<PageDTO>(`/api/pages/${page.id}/sections/${id}`, { method: "DELETE" }));
        setPublishedNow(false);
        pushToast("Section deleted");
      } catch (err) {
        reportError(err);
      }
    },
    [page, applyPage, pushToast, reportError]
  );

  const toggleHidden = useCallback(
    async (id: string) => {
      if (!page) return;
      const section = page.draftSections?.find((s) => s.id === id);
      if (!section) return;
      try {
        applyPage(
          await api<PageDTO>(`/api/pages/${page.id}/sections/${id}`, {
            method: "PATCH",
            body: { visible: !section.visible },
          })
        );
        setPublishedNow(false);
      } catch (err) {
        reportError(err);
      }
    },
    [page, applyPage, reportError]
  );

  const renameSection = useCallback(
    (id: string, name: string) => {
      if (!page) return;
      // Keep the card label in step with the field as it is typed.
      setPage((current) =>
        current
          ? {
              ...current,
              draftSections: (current.draftSections ?? []).map((s) =>
                s.id === id ? { ...s, name } : s
              ),
            }
          : current
      );
      setSaving("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          try {
            await api(`/api/pages/${page.id}/sections/${id}`, {
              method: "PATCH",
              body: { name },
            });
            setSaving("saved");
            setPublishedNow(false);
          } catch (err) {
            setSaving("error");
            reportError(err);
          }
        })();
      }, SAVE_DEBOUNCE_MS);
    },
    [page, reportError]
  );

  const moveSection = useCallback(
    async (from: number, to: number) => {
      if (!page) return;
      const reordered = move(page.draftSections ?? [], from, to);
      setPage({ ...page, draftSections: reordered });
      try {
        applyPage(
          await api<PageDTO>(`/api/pages/${page.id}/sections-reorder`, {
            method: "PATCH",
            body: { ids: reordered.map((s) => s.id) },
          })
        );
        setPublishedNow(false);
      } catch (err) {
        setPage(page);
        reportError(err);
      }
    },
    [page, applyPage, reportError]
  );

  /* ------------------------------------------------------- publish/discard */

  const publish = useCallback(async () => {
    if (!page) return;
    // Make sure the last keystroke is saved before going live.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      if (selectedSection) await flushSave(selectedSection.id, draftContent);
    }
    try {
      const res = await api<{
        page: PageDTO;
        revalidated: { attempted: boolean; ok: boolean; message: string };
      }>(`/api/pages/${page.id}/publish`, { method: "POST" });

      applyPage(res.page);
      setPublishedNow(true);
      setPublishIssues([]);
      await refreshPages(projectId);

      if (res.revalidated.ok) {
        pushToast(`${res.page.title} is live on ${project?.domain || "your website"}`, "publish");
      } else {
        pushToast(res.revalidated.message, "error");
      }
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        setPublishIssues(err.issues);
        pushToast(err.issues[0].message, "error");
      } else {
        reportError(err);
      }
    }
  }, [
    page,
    selectedSection,
    draftContent,
    flushSave,
    applyPage,
    refreshPages,
    projectId,
    project,
    pushToast,
    reportError,
  ]);

  const discard = useCallback(async () => {
    if (!page) return;
    try {
      applyPage(await api<PageDTO>(`/api/pages/${page.id}/discard-draft`, { method: "POST" }), false);
      setPublishIssues([]);
      await refreshPages(projectId);
      pushToast("Your changes were thrown away");
    } catch (err) {
      reportError(err);
    }
  }, [page, applyPage, refreshPages, projectId, pushToast, reportError]);

  const preview = useCallback(async () => {
    if (!page || !project) return;
    try {
      const { token } = await api<{ token: string }>(`/api/pages/${page.id}/preview-token`, {
        method: "POST",
      });
      const domain = project.domain
        ? `https://${project.domain.replace(/^https?:\/\//, "")}`
        : "";
      if (!domain) {
        pushToast("Set this website's domain in settings to use preview.", "error");
        return;
      }
      window.open(`${domain}/${page.slug}?preview=${token}`, "_blank", "noopener");
    } catch (err) {
      reportError(err);
    }
  }, [page, project, pushToast, reportError]);

  /* -------------------------------------------------------------- projects */

  const createProject = useCallback(
    async (name: string, domain: string) => {
      try {
        const created = await api<ProjectDTO>("/api/projects", {
          method: "POST",
          body: { name, domain },
        });
        setProjects((list) => [created, ...list]);
        pushToast(`“${created.name}” created`);
        return created;
      } catch (err) {
        reportError(err);
        return null;
      }
    },
    [pushToast, reportError]
  );

  const updateProject = useCallback(
    async (patch: Partial<ProjectDTO> & { revalidateSecret?: string }) => {
      if (!projectId) return;
      try {
        const updated = await api<ProjectDTO>(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: patch,
        });
        setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
        pushToast("Settings saved");
      } catch (err) {
        reportError(err);
      }
    },
    [projectId, pushToast, reportError]
  );

  const rotateApiKey = useCallback(async () => {
    if (!projectId) return;
    try {
      const updated = await api<ProjectDTO>(`/api/projects/${projectId}/rotate-key`, {
        method: "POST",
      });
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      pushToast("Key rotated. Redeploy the website with the new key.");
    } catch (err) {
      reportError(err);
    }
  }, [projectId, pushToast, reportError]);

  /* ---------------------------------------------------------------- modals */

  const openModal = useCallback((kind: Exclude<ModalKind, null>) => setModal(kind), []);
  const closeModal = useCallback(() => {
    setModal(null);
    setPendingDelete(null);
  }, []);
  const askDelete = useCallback((d: PendingDelete) => {
    setPendingDelete(d);
    setModal("confirm");
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setModal(null);
    setPendingDelete(null);
    if (target.kind === "page") await deletePage(target.id);
    else await deleteSection(target.id);
  }, [pendingDelete, deletePage, deleteSection]);

  const value: Store = {
    sectionTypes,
    typeFor,
    projects,
    project,
    projectId,
    setProjectId,
    createProject,
    updateProject,
    rotateApiKey,
    pages,
    loadingPages,
    addPage,
    addPageFromTemplate,
    duplicatePage,
    deletePage,
    movePage,
    page,
    loadingPage,
    openPage,
    selected,
    selectSection: setSelected,
    selectedSection,
    selectedDef,
    draftContent,
    setFieldValue,
    previewFor,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    addSection,
    deleteSection,
    toggleHidden,
    renameSection,
    moveSection,
    saving,
    dirty: page?.hasDraftChanges ?? false,
    publishedNow,
    publish,
    discard,
    preview,
    publishIssues,
    modal,
    openModal,
    closeModal,
    pendingDelete,
    askDelete,
    confirmDelete,
    toast,
    pushToast,
    reportError,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
