import { Controls } from "@/components/aria/Controls";
import { VoiceWave } from "@/components/aria/VoiceWave";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-10 px-8 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          ARIA
        </h1>

        <VoiceWave />

        <Controls />
      </main>
    </div>
  );
}
