// توقيعي — their SigManager: draw (or keep) my signature; stored inside this app on this device only, never visible
// to HR; it is placed on a document only when I choose «موافق مع التوقيع».
import { useState } from "react";
import { Image, View } from "react-native";
import { SigPad } from "./sig-pad";
import { Btn, Sheet, T, useToast } from "./ui";
import { getSig, isSigData, setSig } from "@/lib/signature";

export function SigManager({ owner, visible, onClose, onSaved }: { owner: string; visible: boolean; onClose: () => void; onSaved?: (d: string) => void }) {
  const toast = useToast();
  const [cur, setCur] = useState(() => getSig(owner));
  const [draw, setDraw] = useState("");
  const [drawing, setDrawing] = useState(false); // the sheet stays still while a stroke is being drawn
  const [mode, setMode] = useState<"view" | "draw">(cur ? "view" : "draw");
  function save(d: string) {
    if (!isSigData(d)) return toast("التوقيع غير صالح أو كبير الحجم", "err");
    if (!setSig(owner, d)) return toast("تعذر الحفظ على هذا الجهاز", "err");
    setCur(d); setMode("view");
    toast("✓ تم حفظ توقيعك في التطبيق فقط", "ok");
    onSaved?.(d);
  }
  return (
    <Sheet visible={visible} onClose={onClose} scrollEnabled={!drawing}>
      <T weight={800} size={16} color="#111">✍️ توقيعي</T>
      <T size={11.5} color="#555" style={{ lineHeight: 19, marginVertical: 6 }}>🔒 يُحفظ توقيعك داخل هذا التطبيق فقط ولا يظهر للموارد البشرية ولا لأي جهة. يُدرج تلقائياً في المستند عند اختيار «موافق مع التوقيع».</T>
      {mode === "view" && cur ? (
        <>
          <View style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, backgroundColor: "#fff", alignItems: "center" }}>
            {cur.startsWith("data:image/svg") ? <T size={12} color="#014D3D">✓ توقيع محفوظ</T> : <Image source={{ uri: cur }} style={{ height: 80, width: "100%" }} resizeMode="contain" />}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn kind="ghost" title="رسم توقيع جديد" onPress={() => setMode("draw")} style={{ flex: 1 }} />
            <Btn kind="danger" title="حذف" onPress={() => { setSig(owner, ""); setCur(""); setMode("draw"); toast("تم حذف التوقيع", "ok"); onSaved?.(""); }} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <SigPad onChange={setDraw} onDrawing={setDrawing} />
          <Btn title="حفظ التوقيع" disabled={!draw} onPress={() => save(draw)} />
        </>
      )}
      <Btn kind="ghost" title="إغلاق" onPress={onClose} />
    </Sheet>
  );
}
