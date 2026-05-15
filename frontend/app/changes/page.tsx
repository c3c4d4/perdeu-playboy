import { ChangesExplorer } from "@/components/ChangesExplorer";
import { getLatestChanges } from "@/lib/api";

export default async function ChangesPage() {
  const changes = await getLatestChanges("RJ");
  return <ChangesExplorer initialChanges={changes} />;
}
