import { Card, Screen, Txt } from "./ui";

// Placeholder for screens whose backend module is not built yet. The reference behaviour is in
// frontend/legacy/employee-portal and docs/ARIBA_HR_System_Documentation.md.
export function NotBuilt({ title, items }: { title: string; items: string[] }) {
  return (
    <Screen>
      <Card title={title}>
        <Txt muted style={{ marginBottom: 8 }}>قيد البناء — تُفعَّل بعد إضافة الوحدة في الخادم.</Txt>
        {items.map((i) => (
          <Txt key={i}>• {i}</Txt>
        ))}
      </Card>
    </Screen>
  );
}
