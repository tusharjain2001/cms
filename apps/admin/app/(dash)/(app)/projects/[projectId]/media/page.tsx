"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MEDIA_ACCEPT, thumb, useMedia } from "@/lib/media";
import { useStore } from "@/lib/store";
import {
  Button,
  EmptyState,
  PageHeader,
  PhotoTile,
  Textarea,
  cx,
} from "@/components/ui";

export default function MediaScreen() {
  const s = useStore();
  const m = useMedia();
  const params = useParams<{ projectId: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [alt, setAlt] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (params.projectId && params.projectId !== s.projectId) s.setProjectId(params.projectId);
  }, [params.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = m.items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    setAlt(selected?.alt ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      <div className="min-w-0 flex-1 px-6 py-10 lg:px-11">
        <PageHeader
          title="Photos & files"
          sub="Everything you have uploaded. Pick one to use it in a section."
          action={
            m.uploadsEnabled ? (
              <Button variant="primary" onClick={() => fileInput.current?.click()}>
                Upload photos
              </Button>
            ) : undefined
          }
        />

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            const images = Array.from(files);
            e.target.value = "";
            // "raw" for PDFs, "image" for photos — the kind is stored on the media row.
            const pdfs = images.filter((f) => f.type === "application/pdf");
            const pics = images.filter((f) => f.type !== "application/pdf");
            if (pics.length) await m.uploadFiles(pics, "image");
            if (pdfs.length) await m.uploadFiles(pdfs, "raw");
          }}
        />

        {!m.uploadsEnabled ? (
          <div
            data-tour="uploads-disabled"
            className="mb-5 rounded-xl border border-draft bg-draft-bg px-5 py-4 text-label text-draft-ink"
          >
            <p className="font-semibold">Uploads are not switched on yet.</p>
            <p className="mt-1">
              Add <code className="font-mono">R2_ACCOUNT_ID</code>,{" "}
              <code className="font-mono">R2_ACCESS_KEY_ID</code>,{" "}
              <code className="font-mono">R2_SECRET_ACCESS_KEY</code>,{" "}
              <code className="font-mono">R2_BUCKET</code> and{" "}
              <code className="font-mono">R2_PUBLIC_BASE_URL</code> to the API&apos;s{" "}
              <code className="font-mono">.env</code>, then restart it. Cloudflare R2&apos;s
              free tier is plenty for client websites.
            </p>
          </div>
        ) : (
          <div
            data-tour="media-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) await m.uploadFiles(e.dataTransfer.files, "image");
            }}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
            className={cx(
              "mb-5 cursor-pointer rounded-xl border border-dashed p-[26px] text-center transition-colors",
              dragOver
                ? "border-[#94aad9] bg-[#eef3fc]"
                : "border-accent-line bg-[#f7f9fd] hover:bg-[#f2f6fd]"
            )}
          >
            <p className="text-body font-semibold text-accent">Drag photos here to upload</p>
            <p className="mt-1 text-mid text-quiet">
              JPG, PNG or PDF. Or click to choose from your computer.
            </p>
          </div>
        )}

        {m.uploads.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 rounded-[10px] border border-line bg-surface px-4 py-3.5">
            <p className="text-label font-semibold">
              Uploading {m.uploads.length} {m.uploads.length === 1 ? "file" : "files"}…
            </p>
            {m.uploads.map((job) => (
              <div key={job.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-mid text-quiet">
                  {job.name}
                </span>
                {job.error ? (
                  <span className="text-mid text-destructive">{job.error}</span>
                ) : (
                  <>
                    <span className="h-1.5 w-[120px] shrink-0 overflow-hidden rounded-full bg-chip sm:w-[180px]">
                      <span
                        className="block h-1.5 bg-accent transition-[width]"
                        style={{ width: `${job.percent}%` }}
                      />
                    </span>
                    <span className="w-[38px] shrink-0 text-right font-mono text-micro text-muted">
                      {job.percent}%
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {m.loading && m.items.length === 0 ? (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(184px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse-soft overflow-hidden rounded-[10px] border border-line-mid"
              >
                <div className="h-[118px] bg-line-soft" />
                <div className="border-t border-line-soft px-2.5 py-2.5">
                  <div className="h-2.5 w-[70%] rounded bg-line-mid" />
                  <div className="mt-1.5 h-2 w-[40%] rounded bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
        ) : m.items.length === 0 ? (
          <EmptyState
            icon="▣"
            title="No photos yet"
            body="Upload the photos you want on your website. You only need to do this once — after that you can pick them from here."
            action={
              m.uploadsEnabled ? (
                <Button variant="primary" onClick={() => fileInput.current?.click()}>
                  Upload your first photo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(184px,1fr))]">
            {m.items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cx(
                    "cursor-pointer overflow-hidden rounded-[10px] border bg-surface text-left transition-shadow",
                    isSelected
                      ? "border-accent shadow-[0_0_0_3px_#eaeff9]"
                      : "border-line hover:border-accent-line"
                  )}
                >
                  {item.resourceType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb(item.url, 360)}
                      alt={item.alt || item.originalName}
                      className="h-[118px] w-full bg-sunken object-cover"
                    />
                  ) : (
                    <PhotoTile className="h-[118px] rounded-none border-0" label="PDF" />
                  )}
                  <span className="block border-t border-line-soft px-2.5 py-2.5">
                    <span className="block truncate text-helper font-medium">
                      {item.originalName || item.publicId.split("/").pop()}
                    </span>
                    <span className="mt-0.5 block font-mono text-tiny text-muted">
                      {item.width ? `${item.width} × ${item.height} · ` : ""}
                      {Math.max(1, Math.round(item.bytes / 1024))} KB
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <aside className="w-full shrink-0 border-t border-line bg-rail px-[22px] py-6 xl:sticky xl:top-0 xl:h-screen xl:w-[320px] xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <p className="mb-3.5 text-helper font-semibold tracking-[.08em] text-muted uppercase">
            Photo details
          </p>
          {selected.resourceType === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb(selected.url, 640)}
              alt={selected.alt || selected.originalName}
              className="mb-3.5 max-h-[220px] w-full rounded-[9px] border border-line-mid bg-sunken object-contain"
            />
          ) : (
            <PhotoTile className="mb-3.5 h-[150px]" label="PDF" />
          )}
          <p className="text-sub font-semibold break-all">
            {selected.originalName || selected.publicId.split("/").pop()}
          </p>
          <p className="mt-1 font-mono text-micro text-muted">
            {selected.width ? `${selected.width} × ${selected.height} · ` : ""}
            {Math.max(1, Math.round(selected.bytes / 1024))} KB
          </p>

          <div className="my-[18px] h-px bg-line-mid" />

          <label className="mb-2 block text-label font-semibold">Describe this photo</label>
          <Textarea
            rows={4}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() => {
              if (alt !== selected.alt) void m.setAlt(selected.id, alt);
            }}
            className="text-sub"
          />
          <p className="mt-2 text-helper text-muted">
            Read aloud to visitors who cannot see the photo. One short sentence is plenty.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              variant="quiet"
              className="w-full py-2.5 text-mid text-destructive hover:text-destructive-dark"
              onClick={async () => {
                await m.remove(selected.id);
                setSelectedId("");
              }}
            >
              Delete from library
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
