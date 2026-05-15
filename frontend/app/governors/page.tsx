import { GovernorsExplorer } from "@/components/GovernorsExplorer";
import { getGovernorPerformance } from "@/lib/api";

export default async function GovernorsPage() {
  const performance = await getGovernorPerformance("RJ");
  return <GovernorsExplorer initialPerformance={performance} />;
}
