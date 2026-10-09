import type { Metadata } from "next";
import { ZagrebHome } from "../../features/zagreb/ZagrebHome";

export const metadata: Metadata = { title: "kvart na kvadrat · demo" };

export default function AppPage() {
  return <ZagrebHome />;
}
