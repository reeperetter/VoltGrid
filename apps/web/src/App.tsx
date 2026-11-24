import { createEmptyProject } from "@voltgrid/core";
import { getRegionProfile } from "@voltgrid/regions";

export function App() {
  const region = getRegionProfile("pl");
  const project = createEmptyProject({ id: "demo", name: "Новий проєкт", regionId: region.id });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>VoltGrid</h1>
      <p>Каркас працює: ядро та регіональний профіль підключені.</p>
      <ul>
        <li>Проєкт: {project.name}</li>
        <li>Регіон: {region.name} ({region.standards.join(", ")})</li>
        <li>Статус профілю: {region.status}</li>
      </ul>
    </main>
  );
}
