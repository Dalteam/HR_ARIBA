// Line pictograms for the leave / request types that have their own artwork (black masks, tinted to the theme colour).
import { Image } from "react-native";

const SRC = {
  remote: require("../../assets/leave-icons/remote.png"),
  maternity: require("../../assets/leave-icons/maternity.png"),
  umrah: require("../../assets/leave-icons/umrah.png"),
  paternity: require("../../assets/leave-icons/paternity.png"),
  unpaid: require("../../assets/leave-icons/unpaid.png"),
  emergency: require("../../assets/leave-icons/emergency.png"),
  annual: require("../../assets/leave-icons/annual.png"),
  marriage: require("../../assets/leave-icons/marriage.png"),
  permission: require("../../assets/leave-icons/permission.png"),
  year_end: require("../../assets/leave-icons/year_end.png"),
};
const OF: Record<string, keyof typeof SRC> = {
  remote: "remote", maternity: "maternity", umrah: "umrah", hajj: "umrah", paternity: "paternity", unpaid: "unpaid",
  emergency: "emergency", annual: "annual", marriage: "marriage", permission: "permission", year_end: "year_end",
};

export const hasLeaveIcon = (type: string) => type in OF;

export function LeaveIcon({ type, size = 24, color }: { type: string; size?: number; color: string }) {
  const k = OF[type];
  if (!k) return null;
  return <Image source={SRC[k]} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" accessible={false} />;
}
