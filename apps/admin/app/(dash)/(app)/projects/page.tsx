"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Button, EmptyState, Input, Modal, ModalActions, PageHeader } from "@/components/ui";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export default function ProjectsPage() {
  const s = useStore();
  const { user } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  /**
   * Someone invited to exactly one website — the usual shape for a client — is
   * taken straight into it. Anyone who owns a website stays here, because
   * choosing between them (and adding another) is the point of this screen.
   */
  const onlyInvited = s.projects.length === 1 && s.projects[0].role === "editor";
  useEffect(() => {
    if (onlyInvited) router.replace(`/projects/${s.projects[0].id}/pages`);
  }, [onlyInvited, s.projects, router]);

  const open = (id: string) => {
    s.setProjectId(id);
    router.push(`/projects/${id}/pages`);
  };

  async function create() {
    const created = await s.createProject(name.trim(), domain.trim());
    if (created) {
      setCreating(false);
      setName("");
      setDomain("");
      open(created.id);
    }
  }

  return (
    <div className="max-w-[1180px] px-6 py-10 lg:px-11">
      <PageHeader
        title="Your websites"
        sub="Websites you own, and any you have been invited to edit."
        action={
          <Button variant="primary" data-tour="new-website" onClick={() => setCreating(true)}>
            + New website
          </Button>
        }
      />

      {s.projects.length === 0 ? (
        <EmptyState
          icon="◫"
          title={`Welcome, ${user?.name?.split(" ")[0] ?? "there"}`}
          body="Create your first website and you will get a public key to drop into your React or Next.js project. If someone has invited you to edit theirs, it will appear here instead."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New website
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {s.projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => open(p.id)}
              className="cursor-pointer rounded-xl border border-line bg-surface p-[18px] text-left transition-[border-color,box-shadow] hover:border-accent-line hover:shadow-[0_8px_24px_-16px_rgba(30,35,45,.25)]"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-accent-tint text-label font-bold text-accent"
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-card font-semibold">{p.name}</span>
                  <span className="mt-[3px] block font-mono text-mid text-muted">
                    {p.domain || "not connected yet"}
                  </span>
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between text-mid text-quiet">
                {p.role === "owner" ? (
                  <span className="font-mono">{p.apiKey.slice(0, 16)}…</span>
                ) : (
                  <span>Shared by {p.ownerName}</span>
                )}
                <span>{p.allowedSectionTypes.length} section types</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)}>
        <div className="p-6">
          <h2 className="text-modal font-bold">New website</h2>
          <p className="mt-1 mb-5 text-label text-quiet">
            You can change any of this later in settings.
          </p>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-label font-semibold">Website name</span>
              <Input
                autoFocus
                value={name}
                placeholder="Rosewater Bakehouse"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-label font-semibold">Domain</span>
              <Input
                mono
                value={domain}
                placeholder="rosewaterbakehouse.com"
                onChange={(e) => setDomain(e.target.value)}
              />
            </label>
          </div>
          <ModalActions>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={() => void create()}>
              Create website
            </Button>
          </ModalActions>
        </div>
      </Modal>
    </div>
  );
}
