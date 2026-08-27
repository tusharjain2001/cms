"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Button, Card, CardTitle, Input, cx } from "@/components/ui";

export default function SettingsScreen() {
  const s = useStore();
  const params = useParams<{ projectId: string }>();
  const project = s.project;

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [revalidateUrl, setRevalidateUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (params.projectId && params.projectId !== s.projectId) s.setProjectId(params.projectId);
  }, [params.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDomain(project.domain);
    setRevalidateUrl(project.revalidateUrl ?? "");
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return <div className="px-6 py-10 text-label text-muted lg:px-11">Loading settings…</div>;
  }

  const masked = `${project.apiKey.slice(0, 8)}${"•".repeat(16)}`;

  return (
    <div className="max-w-[820px] px-6 py-10 lg:px-11">
      <h1 className="text-screen font-bold">Website settings</h1>
      <p className="mt-[5px] mb-7 text-body text-quiet">
        Only you can see this page. Clients never do.
      </p>

      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Website</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-label font-semibold">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-label font-semibold">Domain</span>
              <Input mono value={domain} onChange={(e) => setDomain(e.target.value)} />
            </label>
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              onClick={() => void s.updateProject({ name: name.trim(), domain: domain.trim() })}
            >
              Save
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Used by the website's front end to read published content.">
            Content delivery
          </CardTitle>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-label font-semibold">Public key</span>
              <div className="flex flex-wrap gap-2">
                <Input
                  readOnly
                  mono
                  value={revealed ? project.apiKey : masked}
                  className="min-w-[220px] flex-1 bg-sunken text-slate"
                />
                <Button
                  onClick={() => setRevealed((v) => !v)}
                  className="px-[13px] py-[9px] text-mid"
                >
                  {revealed ? "Hide" : "Show"}
                </Button>
                <Button
                  className="px-[13px] py-[9px] text-mid"
                  onClick={() => {
                    void navigator.clipboard?.writeText(project.apiKey);
                    s.pushToast("Public key copied to your clipboard");
                  }}
                >
                  Copy
                </Button>
                <Button
                  className="border-destructive-line px-[13px] py-[9px] text-mid text-destructive hover:bg-destructive-bg"
                  onClick={() => void s.rotateApiKey()}
                >
                  Rotate
                </Button>
              </div>
              <p className="text-helper text-muted">
                Read-only, and scoped to this website. Safe to ship in the site&apos;s code.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
              <label className="flex flex-col gap-2">
                <span className="text-label font-semibold">Publish webhook URL</span>
                <Input
                  mono
                  className="text-mid"
                  placeholder="https://example.com/api/revalidate"
                  value={revalidateUrl}
                  onChange={(e) => setRevalidateUrl(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-label font-semibold">Webhook secret</span>
                <Input
                  mono
                  className="text-mid"
                  placeholder={project.hasRevalidateSecret ? "•••••••• (set)" : "not set"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
            </div>
            <p className="text-helper text-muted">
              Called when the client presses Publish, so the live site regenerates that page
              within seconds.
            </p>
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  void s.updateProject({
                    revalidateUrl: revalidateUrl.trim(),
                    ...(secret.trim() ? { revalidateSecret: secret.trim() } : {}),
                  });
                  setSecret("");
                }}
              >
                Save webhook
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Unticked types never appear in their Add section list.">
            Sections this client can use
          </CardTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {s.sectionTypes.map((t) => {
              const on = project.allowedSectionTypes.includes(t.type);
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() =>
                    void s.updateProject({
                      allowedSectionTypes: on
                        ? project.allowedSectionTypes.filter((x) => x !== t.type)
                        : [...project.allowedSectionTypes, t.type],
                    })
                  }
                  className="flex cursor-pointer items-start gap-3 rounded-[9px] border border-line-mid p-3 text-left transition-colors hover:border-[#cfccc4] hover:bg-rail"
                >
                  <span
                    className={cx(
                      "mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border text-tiny text-white",
                      on ? "border-accent bg-accent" : "border-[#cfccc4] bg-surface"
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span>
                    <span className="block text-label font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-helper text-muted">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Paste these into the website's project to read content from this CMS.">
            Connect the website
          </CardTitle>
          <pre className="overflow-x-auto rounded-lg border border-line-mid bg-sunken p-4 font-mono text-mid text-slate">
{`PAGECRAFT_API_URL=${API_URL}
PAGECRAFT_API_KEY=${revealed ? project.apiKey : masked}

# Fetch the home page:
# GET ${API_URL}/api/content/home
#   header: x-api-key: <your key>`}
          </pre>
        </Card>
      </div>
    </div>
  );
}
