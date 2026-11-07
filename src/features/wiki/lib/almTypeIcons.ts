import {
  Bell,
  Bookmark,
  Bug,
  CheckSquare,
  Database,
  FileText,
  Flag,
  FlaskConical,
  Layers,
  Lightbulb,
  ListTree,
  MessageSquare,
  Paintbrush,
  Puzzle,
  Rocket,
  ShieldAlert,
  Star,
  Target,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * ALM 이슈 타입 아이콘 키 → lucide 아이콘. alm-front `components/typeIcons.tsx`의 `TYPE_ICONS` 중
 * **이슈 타입 후보(`TYPE_ICON_OPTIONS`)만** 복사했다 — 제품 간 import는 금지다(단독 판매 전제).
 * 레지스트리 값이 이 키 체계다. 여기 없는 키는 스마트 링크가 아이콘을 생략한다(이름·배지로 의미는 남는다).
 * alm-front에 타입 아이콘을 늘리면 여기도 같이 늘린다 — 안 늘리면 오류가 아니라 아이콘 없음이다.
 */
export const ALM_TYPE_ICONS: Readonly<Record<string, LucideIcon>> = {
  "check-square": CheckSquare,
  bookmark: Bookmark,
  bug: Bug,
  zap: Zap,
  "list-tree": ListTree,
  flag: Flag,
  lightbulb: Lightbulb,
  wrench: Wrench,
  "shield-alert": ShieldAlert,
  "file-text": FileText,
  star: Star,
  layers: Layers,
  target: Target,
  rocket: Rocket,
  bell: Bell,
  database: Database,
  "message-square": MessageSquare,
  paintbrush: Paintbrush,
  flask: FlaskConical,
  puzzle: Puzzle,
};

export function almTypeIcon(name: string | null | undefined): LucideIcon | null {
  return (name && Object.hasOwn(ALM_TYPE_ICONS, name) ? ALM_TYPE_ICONS[name] : null) ?? null;
}
