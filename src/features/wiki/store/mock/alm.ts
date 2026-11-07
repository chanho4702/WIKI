// ALM 이슈 카드 목업(W3 스마트 링크) — 고정 응답. 목업 모드에는 ALM이 없으니 저장소(wiki.v1)에 두지 않는다.
// 서버 계약과 같이 **요청에 있고 아는 키만** 요청 순서대로 돌려준다(모르는 키는 조용히 빠짐).
import { clone } from "./db";
import type { AlmIssueCard } from "../types";

const FIXED_CARDS: readonly AlmIssueCard[] = [
  {
    key: "ALM-1",
    projectId: "1",
    projectKey: "ALM",
    title: "스마트 링크 카드 조회 API",
    type: { id: "task", name: "작업", icon: "check-square", color: "info" },
    status: { id: "inprogress", name: "진행 중", icon: "refresh-cw", color: "info", kind: "active" },
    priority: { id: "high", name: "높음", icon: "chevron-up", color: "warning" },
    assignee: { id: "1", displayName: "김철수" },
    dueDate: "2026-11-30",
    resolved: false,
    url: "/alm/browse/ALM-1",
  },
  {
    key: "ALM-2",
    projectId: "1",
    projectKey: "ALM",
    title: "링크 복사 주소를 정규 주소로",
    type: { id: "bug", name: "버그", icon: "bug", color: "danger" },
    status: { id: "todo", name: "할 일", icon: "circle", color: "neutral", kind: "new" },
    priority: null,
    assignee: null,
    dueDate: null,
    resolved: false,
    url: "/alm/browse/ALM-2",
  },
  {
    key: "WIKI-7",
    projectId: "2",
    projectKey: "WIKI",
    title: "보기 화면에서 이슈 상태 보이기",
    type: { id: "story", name: "스토리", icon: "bookmark", color: "success" },
    status: { id: "done", name: "완료", icon: "circle-check", color: "success", kind: "complete" },
    priority: { id: "medium", name: "보통", icon: "equal", color: "neutral" },
    assignee: { id: "2", displayName: "이영희" },
    dueDate: null,
    resolved: true,
    url: "/alm/browse/WIKI-7",
  },
];

export async function fetchAlmIssueCards(keys: readonly string[]): Promise<AlmIssueCard[]> {
  const wanted = [...new Set(keys.map((k) => k.trim().toUpperCase()))];
  return wanted
    .map((key) => FIXED_CARDS.find((card) => card.key === key))
    .filter((card): card is AlmIssueCard => card !== undefined)
    .map(clone);
}
