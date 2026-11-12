import { ScenarioList } from "@/components/scenarios-view";

export const metadata = { title: "Готовые сценарии" };

export default function Page() { return <ScenarioList base="/scenarios" />; }
