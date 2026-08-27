"use client";

import { useRef } from "react";
import { useMedia, thumb } from "@/lib/media";
import { Button, Modal, PhotoTile, cx } from "./ui";

/**
 * The modal an image or file field opens. Deliberately one job only: pick
 * something, or add something and pick it. Managing the library happens on the
 * Photos & files screen.
 */
export function MediaPicker() {
  const m = useMedia();
  const fileInput = useRef<HTMLInputElement>(null);
  const isImage = m.pickerKind === "image";
  const items = m.items.filter((i) => i.resourceType === m.pickerKind);

  return (
    <Modal open={m.pickerOpen} onClose={() => m.resolvePick(null)} width="760px" scroll>
      <div className="sticky top-0 rounded-t-[14px] border-b border-line-soft bg-surface px-6 pt-[22px] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-.3px]">
              {isImage ? "Choose a photo" : "Choose a file"}
            </h2>
            <p className="mt-1 text-label text-quiet">
              {isImage
                ? "Pick one you have already uploaded, or add a new one."
                : "PDFs and documents visitors can download."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => m.resolvePick(null)}
            aria-label="Close"
            className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] bg-chip-hover text-quiet hover:bg-line-mid"
          >
            ✕
          </button>
        </div>

        {m.uploadsEnabled && (
          <div className="mt-4">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={isImage ? "image/*" : ".pdf,application/pdf"}
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files?.length) return;
                const added = await m.uploadFiles(files, m.pickerKind);
                e.target.value = "";
                if (added[0]) m.resolvePick(added[0]);
              }}
            />
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              Upload from my computer
            </Button>
          </div>
        )}
      </div>

      <div className="px-6 pt-5 pb-[26px]">
        {!m.uploadsEnabled ? (
          <p className="rounded-lg bg-draft-bg px-4 py-3 text-label text-draft-ink">
            Uploads are not switched on yet. Your web developer needs to add the photo
            service keys to the CMS.
          </p>
        ) : m.uploads.length > 0 ? (
          <div className="mb-4 flex flex-col gap-2">
            {m.uploads.map((job) => (
              <div key={job.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-mid text-quiet">
                  {job.name}
                </span>
                <span className="h-1.5 w-[160px] shrink-0 overflow-hidden rounded-full bg-chip">
                  <span
                    className="block h-1.5 bg-accent transition-[width]"
                    style={{ width: `${job.percent}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-micro text-muted">
                  {job.percent}%
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="py-10 text-center text-label text-quiet">
            {m.loading ? "Loading…" : `Nothing here yet. Upload your first ${isImage ? "photo" : "file"}.`}
          </p>
        ) : (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => m.resolvePick(item)}
                className={cx(
                  "cursor-pointer overflow-hidden rounded-[10px] border border-line bg-surface text-left transition-shadow",
                  "hover:border-accent-line hover:shadow-[0_0_0_3px_#eaeff9]"
                )}
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb(item.url, 320)}
                    alt={item.alt || item.originalName}
                    className="h-[104px] w-full bg-sunken object-cover"
                  />
                ) : (
                  <PhotoTile className="h-[104px] rounded-none border-0" label="PDF" />
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
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
