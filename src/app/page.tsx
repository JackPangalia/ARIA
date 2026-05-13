import { Controls } from "@/components/aria/Controls";
import { OrbVisualizer } from "@/components/aria/OrbVisualizer";
import { TopSettingsDock } from "@/components/aria/TopSettingsDock";
import { RequireAuth } from "@/components/firebase/RequireAuth";

export default function Home() {
  return (
    <RequireAuth>
      <div className="relative min-h-screen bg-black text-zinc-100">
        <TopSettingsDock />
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-10 px-8 pb-16 pt-20">
          <p className="select-none text-[10px] font-medium tracking-[0.65em] text-zinc-600">
            ARIA
          </p>

          <OrbVisualizer />

          <Controls />
        </main>
      </div>
    </RequireAuth>
  );
}
