import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharedApiUpload, sharedAuthClient } from "./apiClient";

class FakeXmlHttpRequest extends EventTarget {
  static instances: FakeXmlHttpRequest[] = [];

  readonly upload = new EventTarget();
  method = "";
  url = "";
  withCredentials = false;
  status = 0;
  statusText = "";
  responseText = "";
  body: Document | XMLHttpRequestBodyInit | null = null;
  aborted = false;
  readonly headers = new Map<string, string>();

  constructor() {
    super();
    FakeXmlHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  getAllResponseHeaders() {
    return "Content-Type: application/json\r\n";
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.dispatchEvent(new Event("abort"));
  }

  progress(loaded: number, total: number) {
    this.upload.dispatchEvent(new ProgressEvent("progress", {
      lengthComputable: true,
      loaded,
      total,
    }));
  }

  respond(status: number, body = "{}") {
    this.status = status;
    this.statusText = status >= 400 ? "Error" : "Created";
    this.responseText = body;
    this.dispatchEvent(new Event("load"));
  }
}

const originalXhr = globalThis.XMLHttpRequest;

describe("sharedApiUpload", () => {
  beforeEach(() => {
    FakeXmlHttpRequest.instances = [];
    globalThis.XMLHttpRequest = FakeXmlHttpRequest as unknown as typeof XMLHttpRequest;
    sharedAuthClient.setAccessToken("memory-at");
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
    sharedAuthClient.setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("메모리 AT와 쿠키를 포함하고 업로드 바이트 진행률을 전달한다", async () => {
    const onProgress = vi.fn();
    const form = new FormData();
    form.append("file", new File(["png"], "a.png", { type: "image/png" }));

    const request = sharedApiUpload("/api/wiki/pages/2/attachments?pending=true", form, { onProgress });
    const xhr = FakeXmlHttpRequest.instances[0];
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/wiki/pages/2/attachments?pending=true");
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers.get("Authorization")).toBe("Bearer memory-at");
    expect(xhr.body).toBe(form);

    xhr.progress(4, 10);
    xhr.respond(201, "{\"id\":1}");

    const response = await request;
    expect(response.status).toBe(201);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0);
    expect(onProgress).toHaveBeenLastCalledWith(40);
  });

  it("AbortSignal을 XHR 중단과 AbortError로 연결한다", async () => {
    const controller = new AbortController();
    const request = sharedApiUpload("/upload", new FormData(), { signal: controller.signal });
    const xhr = FakeXmlHttpRequest.instances[0];

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.aborted).toBe(true);
  });

  it("401이면 refresh 후 같은 FormData를 한 번만 재전송한다", async () => {
    const refresh = vi.spyOn(sharedAuthClient, "tryRefresh").mockResolvedValue(true);
    const form = new FormData();
    const request = sharedApiUpload("/upload", form);
    FakeXmlHttpRequest.instances[0].respond(401, "{\"error\":\"expired\"}");
    await vi.waitFor(() => expect(FakeXmlHttpRequest.instances).toHaveLength(2));
    FakeXmlHttpRequest.instances[1].respond(201, "{\"id\":2}");

    const response = await request;

    expect(response.status).toBe(201);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeXmlHttpRequest.instances[1].body).toBe(form);
  });
});
