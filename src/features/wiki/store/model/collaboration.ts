// 공동 편집(협업 티켓·초안 확정) 도메인 타입.
import type { Page } from "./pages";

/**
 * REST 인증을 WebSocket URL에 노출하지 않기 위한 짧은 수명의 1회용 공동 편집 ticket.
 * raw ticket은 메모리에서 Hocuspocus 인증 메시지로만 전달하고 저장하거나 로깅하지 않는다.
 */
export interface CollaborationTicket {
  ticket: string;
  room: string;
  websocketPath: string;
  expiresAt: string;
  /**
   * 발급 시점의 page.version(티켓 스키마 v2). 편집 세션의 기준 버전과 다르면 공동 초안이 다른 경로의
   * 저장으로 새로 시작된 것이다 — 옛 Y.Doc을 새 초안에 합치지 않도록 연결하지 않는다.
   * 구 서버(스키마 v1)는 주지 않으므로 없으면 검사하지 않는다.
   */
  pageVersion?: number;
  /**
   * 발급 시점 공동 초안의 리셋 세대(reset_epoch, 행이 없으면 0). 리셋할 때만 늘고 게시로는 바뀌지 않는다.
   * 페이지 버전이 그대로인 리셋도 잡기 위해 세션이 처음 받은 값과 대조한다. 구 서버는 주지 않는다.
   */
  draftEpoch?: number;
}

export interface CollaborationBootstrap {
  created: boolean;
  basePageVersion: number;
  generation: number;
}

export interface CollaborationDraftCommit {
  page: Page;
  generation: number;
}

export interface CollaborationDraftCommitOptions {
  expectedVersion: number;
  expectedGeneration: number;
}

/**
 * 공동 초안이 이 탭이 들고 있는 페이지 버전과 다른 기준으로 새로 시작됐다(다른 경로의 저장, bootstrap 409,
 * WebSocket close 4409, 티켓 pageVersion 불일치). 화면은 조용히 재연결하지 않고 서버 최신본과 내 편집을
 * 비교한 뒤 최신 버전 기준으로 새 세션을 시작한다.
 */
export class CollaborationDraftResetError extends Error {
  constructor(message = "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다") {
    super(message);
    this.name = "CollaborationDraftResetError";
  }
}
