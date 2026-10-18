// 첨부파일 도메인 타입.

export interface Attachment {
  id: string;
  pageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  /** 1부터. 같은 이름으로 다시 올리면 오른다 — id는 그대로다(W23). */
  version?: number;
}

/** 첨부의 지난 버전 한 줄. 현재 내용은 여기 없다(Attachment 자체가 곧 현재다). */
export interface AttachmentVersion {
  version: number;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string | null;
}

export interface AttachmentUploadOptions {
  /** 호출자가 취소하면 전송을 중단한다. 서버가 이미 수신한 경계 상황은 pending reconciliation이 정리한다. */
  signal?: AbortSignal;
  /** 전송된 요청 바이트 기준 0~100 정수 진행률. */
  onProgress?: (percent: number) => void;
  /** 페이지 저장 전 에디터 임시 업로드로 기록한다. */
  pending?: boolean;
}
