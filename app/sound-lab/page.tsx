import type { Metadata } from "next";
import { SoundLab } from "@/components/sound-lab";

export const metadata: Metadata = { title: "Sound lab · Daybook", robots: { index: false } };

// Public test bench for UI sounds. Not wired into the app yet.
export default function SoundLabPage() {
  return <SoundLab />;
}
