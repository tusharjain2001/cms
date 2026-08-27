import type { WireKind } from "@/lib/dto";

/**
 * Tiny wireframe thumbnails for the "Add a section" picker, so a client can
 * recognise a section by its shape rather than by reading a type name.
 */

const bar = "rounded-[2px] bg-[#cfd4de]";
const block = "rounded-[3px] bg-[#e2e6ee]";

export function Wire({ kind }: { kind: WireKind }) {
  return (
    <div className="flex h-[70px] w-24 shrink-0 flex-col gap-1 rounded-[7px] border border-line-mid bg-sunken p-[7px]">
      {kind === "hero" && (
        <>
          <div className={`flex-1 ${block}`} />
          <div className={`h-[5px] w-[70%] ${bar}`} />
          <div className="h-1 w-[40%] rounded-[2px] bg-accent" />
        </>
      )}

      {kind === "cols" && (
        <>
          <div className={`h-1 w-1/2 ${bar}`} />
          <div className="flex flex-1 gap-1">
            <div className={`flex-1 ${block}`} />
            <div className={`flex-1 ${block}`} />
            <div className={`flex-1 ${block}`} />
          </div>
        </>
      )}

      {kind === "grid" && (
        <>
          <div className={`h-1 w-[45%] ${bar}`} />
          <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-[3px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[2px] bg-[#e2e6ee]" />
            ))}
          </div>
        </>
      )}

      {kind === "quote" && (
        <div className="flex flex-1 flex-col justify-center gap-1">
          <div className={`h-[5px] w-[88%] ${bar}`} />
          <div className={`h-[5px] w-[72%] ${bar}`} />
          <div className="mt-[5px] h-1 w-[34%] rounded-[2px] bg-accent" />
        </div>
      )}

      {kind === "rows" && (
        <div className="flex flex-1 flex-col gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[9px] rounded-[2px] bg-[#e2e6ee]" />
          ))}
        </div>
      )}

      {kind === "band" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-[5px] rounded bg-accent-tint">
          <div className={`h-[5px] w-[60%] ${bar}`} />
          <div className="h-1.5 w-[30%] rounded-[2px] bg-accent" />
        </div>
      )}

      {kind === "split" && (
        <div className="flex flex-1 gap-1">
          <div className="flex flex-1 flex-col gap-[3px]">
            <div className={`h-1 w-[80%] ${bar}`} />
            <div className={`h-1 w-[60%] ${bar}`} />
            <div className={`h-1 w-[70%] ${bar}`} />
          </div>
          <div className={`flex-1 ${block}`} />
        </div>
      )}
    </div>
  );
}
