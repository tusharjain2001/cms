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
 * Uploads go BROWSER → CLOUDINARY directly, using a short-lived signature from
 * our API. A client's 8MB phone photo never touches the CMS server, which
 * keeps the API small and cheap to host.
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
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  uploadUrl: string;
}

/** XHR rather than fetch, because only XHR reports upload progress. */
function putToCloudinary(
  file: File,
  ticket: Ticket,
  onProgress: (percent: number) => void
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", ticket.apiKey);
    form.append("timestamp", String(ticket.timestamp));
    form.append("folder", ticket.folder);
    form.append("signature", ticket.signature);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("The photo service refused that file."));
      }
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the photo service."));
    xhr.send(form);
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
          const ticket = await api<Ticket>(`/api/projects/${projectId}/media/sign`, {
            method: "POST",
            body: { resourceType: kind },
          });

          const result = await putToCloudinary(file, ticket, (percent) =>
            setUploads((u) => u.map((j) => (j.id === job.id ? { ...j, percent } : j)))
          );

          const registered = await api<MediaDTO>(`/api/projects/${projectId}/media`, {
            method: "POST",
            body: {
              publicId: String(result.public_id ?? ""),
              url: String(result.secure_url ?? result.url ?? ""),
              resourceType: kind,
              format: String(result.format ?? ""),
              width: Number(result.width ?? 0),
              height: Number(result.height ?? 0),
              bytes: Number(result.bytes ?? 0),
              originalName: file.name,
            },
          });

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
 * Asks Cloudinary for a smaller, modern-format copy at display time.
 * `f_auto,q_auto` alone typically saves 70–80% on a client's phone photo.
 */
export function thumb(url: string, width = 400): string {
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url;
  return `${url.slice(0, at + marker.length)}f_auto,q_auto,w_${width},c_limit/${url.slice(
    at + marker.length
  )}`;
}

export { API_URL };
