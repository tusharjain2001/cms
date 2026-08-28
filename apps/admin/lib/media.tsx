"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_URL, api, getAccessToken } from "./api";
import { useStore } from "./store";
import type { FileValue, ImageValue, MediaDTO } from "./dto";

/**
 * The media library, and the picker that image and file fields open.
 *
 * Uploads go BROWSER → CLOUDFLARE R2 directly, using a short-lived presigned
 * PUT from our API. A client's 8MB phone photo never touches the CMS server,
 * which keeps the API small and cheap to host. Files are delivered from the R2
 * custom domain through Cloudflare Image Transformations (see `thumb`).
 */

export interface UploadJob {
  id: number;
  name: string;
  percent: number;
  error?: string;
}

type PickKind = "image" | "raw";

interface MediaCtx {
  items: MediaDTO[];
  loading: boolean;
  uploadsEnabled: boolean;
  uploads: UploadJob[];
  refresh: () => Promise<void>;
  uploadFiles: (files: FileList | File[], kind?: PickKind) => Promise<MediaDTO[]>;
  setAlt: (id: string, alt: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Opens the picker and resolves with what the client chose, or null. */
  pick: (kind: PickKind) => Promise<MediaDTO | null>;
  // Picker plumbing, used by <MediaPicker/>.
  pickerOpen: boolean;
  pickerKind: PickKind;
  resolvePick: (item: MediaDTO | null) => void;
}

const MediaContext = createContext<MediaCtx | null>(null);

interface Ticket {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  headers: Record<string, string>;
}

/** SHA-256 (hex) of the file, so the object key is content-addressed. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Natural pixel size, so a picked image keeps its aspect ratio. 0 for non-images. */
async function imageDims(file: File): Promise<{ width: number; height: number }> {
  if (!file.type.startsWith("image/")) return { width: 0, height: 0 };
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** XHR rather than fetch, because only XHR reports upload progress. */
function putToR2(
  file: File,
  ticket: Ticket,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    // The presign covers these exact headers — the PUT fails without them.
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("The storage service refused that file."));
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the storage service."));
    xhr.send(file);
  });
}

/**
 * Fallback: push the file through our own API, which then writes it to R2.
 *
 * The direct PUT above is a cross-origin request, so it only succeeds once the
 * R2 bucket carries a CORS rule allowing this origin. Until it does, the
 * browser kills the request in preflight and `putToR2` rejects — from here that
 * is indistinguishable from a flaky network, which is exactly why this is a
 * retry rather than a replacement. The direct path stays first.
 *
 * Nothing about the destination is sent from here: the server hashes the bytes
 * it receives and prefixes the key with the project from the URL, so a tampered
 * request cannot choose where the object lands.
 */
function proxyUpload(
  file: File,
  projectId: string,
  kind: PickKind,
  dims: { width: number; height: number },
  ext: string | undefined,
  onProgress: (percent: number) => void
): Promise<MediaDTO> {
  const query = new URLSearchParams({
    resourceType: kind,
    originalName: file.name,
    width: String(dims.width),
    height: String(dims.height),
  });
  if (ext) query.set("ext", ext);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/projects/${projectId}/media/upload?${query}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken() ?? ""}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      // The API answers in the standard envelope; a 413 from nginx does not, so
      // fall back to a plain message rather than throwing on the JSON parse.
      let payload: { success?: boolean; data?: MediaDTO; error?: string } | null = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.data) resolve(payload.data);
      else if (xhr.status === 413)
        reject(new Error("That file is too large. Please upload a file under 15MB."));
      else reject(new Error(payload?.error ?? "That file could not be uploaded."));
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the server."));
    xhr.send(file);
  });
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const s = useStore();
  const [items, setItems] = useState<MediaDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [uploads, setUploads] = useState<UploadJob[]>([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<PickKind>("image");
  const pickResolver = useRef<((item: MediaDTO | null) => void) | null>(null);

  const projectId = s.projectId;

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api<{ items: MediaDTO[]; uploadsEnabled: boolean }>(
        `/api/projects/${projectId}/media`
      );
      setItems(data.items);
      setUploadsEnabled(data.uploadsEnabled);
    } catch (err) {
      s.reportError(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, s]);

  useEffect(() => {
    if (projectId && getAccessToken()) void refresh();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFiles = useCallback(
    async (list: FileList | File[], kind: PickKind = "image") => {
      if (!projectId) return [];
      const files = Array.from(list);
      const added: MediaDTO[] = [];

      for (const file of files) {
        const job: UploadJob = { id: Date.now() + Math.floor(Math.random() * 1000), name: file.name, percent: 0 };
        setUploads((u) => [...u, job]);

        try {
          const [contentHash, dims] = await Promise.all([sha256Hex(file), imageDims(file)]);
          const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;

          const onProgress = (percent: number) =>
            setUploads((u) => u.map((j) => (j.id === job.id ? { ...j, percent } : j)));

          const ticket = await api<Ticket>(`/api/projects/${projectId}/media/sign`, {
            method: "POST",
            body: {
              contentHash,
              contentType: file.type || "application/octet-stream",
              resourceType: kind,
              ext,
            },
          });

          let registered: MediaDTO;
          try {
            await putToR2(file, ticket, onProgress);

            registered = await api<MediaDTO>(`/api/projects/${projectId}/media`, {
              method: "POST",
              body: {
                publicId: ticket.key,
                url: ticket.publicUrl,
                resourceType: kind,
                format: ext ?? "",
                width: dims.width,
                height: dims.height,
                bytes: file.size,
                originalName: file.name,
              },
            });
          } catch {
            // The direct PUT is blocked whenever the bucket has no CORS rule for
            // this origin, and a blocked preflight looks exactly like a network
            // failure from script. Rather than tell the client their photo
            // failed, retry through our own API — the slower path, but one that
            // is not subject to CORS at all.
            onProgress(0);
            registered = await proxyUpload(file, projectId, kind, dims, ext, onProgress);
          }

          added.push(registered);
          setItems((current) => [registered, ...current.filter((i) => i.id !== registered.id)]);
        } catch (err) {
          setUploads((u) =>
            u.map((j) =>
              j.id === job.id
                ? { ...j, error: err instanceof Error ? err.message : "Upload failed" }
                : j
            )
          );
          s.reportError(err);
          continue;
        }
        setUploads((u) => u.filter((j) => j.id !== job.id));
      }

      if (added.length > 0) {
        s.pushToast(
          added.length === 1
            ? "Photo added to your library"
            : `${added.length} photos added to your library`
        );
      }
      return added;
    },
    [projectId, s]
  );

  const setAlt = useCallback(
    async (id: string, alt: string) => {
      try {
        const updated = await api<MediaDTO>(`/api/media/${id}`, {
          method: "PATCH",
          body: { alt },
        });
        setItems((current) => current.map((i) => (i.id === id ? updated : i)));
      } catch (err) {
        s.reportError(err);
      }
    },
    [s]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api(`/api/media/${id}`, { method: "DELETE" });
        setItems((current) => current.filter((i) => i.id !== id));
        s.pushToast("Photo deleted");
      } catch (err) {
        s.reportError(err);
      }
    },
    [s]
  );

  const pick = useCallback(
    (kind: PickKind) => {
      setPickerKind(kind);
      setPickerOpen(true);
      void refresh();
      return new Promise<MediaDTO | null>((resolve) => {
        pickResolver.current = resolve;
      });
    },
    [refresh]
  );

  const resolvePick = useCallback((item: MediaDTO | null) => {
    setPickerOpen(false);
    pickResolver.current?.(item);
    pickResolver.current = null;
  }, []);

  return (
    <MediaContext.Provider
      value={{
        items,
        loading,
        uploadsEnabled,
        uploads,
        refresh,
        uploadFiles,
        setAlt,
        remove,
        pick,
        pickerOpen,
        pickerKind,
        resolvePick,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaCtx {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("useMedia must be used inside <MediaProvider>");
  return ctx;
}

/* ------------------------------------------------------------- conversions */

/** What a section stores when a client picks a photo. */
export const toImageValue = (m: MediaDTO): ImageValue => ({
  publicId: m.publicId,
  url: m.url,
  width: m.width,
  height: m.height,
  alt: m.alt || undefined,
});

export const toFileValue = (m: MediaDTO): FileValue => ({
  url: m.url,
  name: m.originalName || m.publicId.split("/").pop() || "file",
  bytes: m.bytes,
});

/**
 * Asks Cloudflare Image Transformations for a smaller, modern-format copy at
 * display time. `f=auto` serves AVIF/WebP where supported; the origin object is
 * untouched. Builds `<cdn>/cdn-cgi/image/<opts>/<key>` from the stored URL.
 */
export function thumb(url: string, width = 400): string {
  try {
    const u = new URL(url);
    return `${u.origin}/cdn-cgi/image/f=auto,q=75,w=${width},fit=scale-down${u.pathname}`;
  } catch {
    return url;
  }
}

export { API_URL };
