"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Input, Modal, ModalActions, cx } from "./ui";
import { Wire } from "./wire";
import { MediaPicker } from "./media-picker";

/**
 * Global overlays: every modal plus the toast. Mounted once in the root layout
 * so any screen can open them through the store.
 */
export function AppChrome() {
  const s = useStore();

  return (
    <>
      <SectionPicker />
      <MediaPicker />
      <AddPageModal />
      <ConfirmModal />
      {s.toast && (
        <div className="fixed bottom-7 left-1/2 z-60 -translate-x-1/2 animate-rise px-4">
          <div
            className={cx(
              "flex max-w-[520px] items-center gap-3 rounded-[10px] px-[17px] py-3 text-white shadow-[0_18px_40px_-20px_rgba(20,24,32,.6)]",
              s.toast.kind === "error" ? "bg-destructive" : "bg-ink"
            )}
          >
            <span className={s.toast.kind === "error" ? "text-white" : "text-[#7fc0a1]"}>
              {s.toast.kind === "error" ? "!" : s.toast.kind === "publish" ? "◉" : "✓"}
            </span>
            <span className="text-sub font-medium">{s.toast.msg}</span>
          </div>
        </div>
      )}
    </>
  );
}

function SectionPicker() {
  const s = useStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (s.modal === "picker") setQuery("");
  }, [s.modal]);

  // Only the section types this website has been given, and only ones the
  // registry actually defines.
  const allowed = new Set(s.project?.allowedSectionTypes ?? []);
  const types = s.sectionTypes
    .filter((t) => allowed.has(t.type))
    .filter(
      (t) =>
        !query.trim() ||
        (t.name + " " + t.description).toLowerCase().includes(query.trim().toLowerCase())
    );

  return (
    <Modal open={s.modal === "picker"} onClose={s.closeModal} width="760px" scroll>
      <div className="sticky top-0 rounded-t-[14px] border-b border-line-soft bg-surface px-6 pt-[22px] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-.3px]">Add a section</h2>
            <p className="mt-1 text-label text-quiet">
              These are the parts your website was built with. Pick one to add it to the
              bottom of the page.
            </p>
          </div>
          <button
            type="button"
            onClick={s.closeModal}
            aria-label="Close"
            className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] bg-chip-hover text-quiet hover:bg-line-mid"
          >
            ✕
          </button>
        </div>
        <Input
          className="mt-4"
          placeholder="Search sections…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-3.5 px-6 pt-5 pb-[26px] sm:grid-cols-2">
        {types.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => void s.addSection(t.type)}
            className="flex cursor-pointer gap-3.5 rounded-[11px] border border-line p-3.5 text-left transition-colors hover:border-accent-line hover:bg-[#fbfcfe]"
          >
            <Wire kind={t.wire} />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">{t.name}</span>
              <span className="mt-1 block text-mid leading-[1.45] text-quiet">
                {t.description}
              </span>
            </span>
          </button>
        ))}
        {types.length === 0 && (
          <p className="col-span-full py-8 text-center text-label text-quiet">
            {query
              ? `No sections match “${query}”.`
              : "No section types are enabled for this website yet."}
          </p>
        )}
      </div>
    </Modal>
  );
}

function AddPageModal() {
  const s = useStore();
  const [name, setName] = useState("");

  useEffect(() => {
    if (s.modal === "addpage") setName("");
  }, [s.modal]);

  const path =
    name.trim().toLowerCase() === "home"
      ? "/"
      : "/" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <Modal open={s.modal === "addpage"} onClose={s.closeModal}>
      <div className="p-6">
        <h2 className="text-modal font-bold">Add a page</h2>
        <p className="mt-1 mb-5 text-label text-quiet">
          Give it a name. The web address is made for you.
        </p>
        <label className="mb-2 block text-label font-semibold">Page name</label>
        <Input
          autoFocus
          value={name}
          placeholder="Our Story"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && void s.addPage(name)}
        />
        <p className="mt-3 rounded-[7px] border border-line-soft bg-sunken px-3 py-[11px] font-mono text-label text-quiet">
          {s.project?.domain || "your-website.com"}
          {name.trim() ? path : ""}
        </p>
        <ModalActions>
          <Button onClick={s.closeModal}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => void s.addPage(name)}
          >
            Add page
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

function ConfirmModal() {
  const s = useStore();
  const target = s.pendingDelete;
  const isPage = target?.kind === "page";

  return (
    <Modal open={s.modal === "confirm"} onClose={s.closeModal} width="412px">
      <div className="p-6">
        <h2 className="text-modal font-bold">Delete “{target?.name ?? ""}”?</h2>
        <p className="mt-2 text-sub leading-[1.55] text-quiet">
          {isPage
            ? "The page and everything on it will be removed. Visitors who have the old web address will see a not-found page. This cannot be undone."
            : "This section and the words and photos in it will be removed from the page. This cannot be undone."}
        </p>
        <ModalActions>
          <Button onClick={s.closeModal}>Keep it</Button>
          <Button variant="danger" onClick={() => void s.confirmDelete()}>
            {isPage ? "Delete page" : "Delete section"}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
