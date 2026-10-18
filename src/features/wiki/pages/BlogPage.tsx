import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { Banner, Button, EmptyState, Lozenge } from "@chanho/react";
import { Newspaper, PenLine } from "lucide-react";
import type { BlogPost, BlogPostPage, User } from "../store/types";
import { listBlogPostPage, listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { useCreateContent } from "../lib/useCreateContent";
import { usePersonName } from "../lib/userName";
import { useReadOnly } from "../lib/readOnly";

/** 블로그 한 쪽 크기 — 서버 상한(100) 안에서, 첫 화면에 충분한 양 */
const BLOG_PAGE_SIZE = 20;
/** 빈 쪽(권한 필터로 통째로 걸러진 쪽)을 만나면 이만큼까지 이어 읽는다 — 커서가 있는 한 끝이 아니다 */
const EMPTY_PAGE_FOLLOW = 5;

/** 한 쪽을 읽되, 빈 쪽이면 다음 커서로 몇 번 더 이어 읽는다(서버 계약: 빈 배열이어도 커서가 있으면 계속). */
async function readBlogPage(spaceId: string, before: string | undefined): Promise<BlogPostPage> {
  let page = await listBlogPostPage(spaceId, { before, limit: BLOG_PAGE_SIZE });
  for (let i = 0; i < EMPTY_PAGE_FOLLOW && page.items.length === 0 && page.nextBefore; i++) {
    page = await listBlogPostPage(spaceId, { before: page.nextBefore, limit: BLOG_PAGE_SIZE });
  }
  return page;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 블로그(`/spaces/:spaceId/blog`, W24) — 트리 밖에서 날짜순으로 읽는 글.
 *
 * 공지·회고·주간 소식처럼 "어디에 넣을지"보다 "언제 썼는지"가 중요한 글이 있다. 트리에 넣으면
 * 폴더 이름을 고민하게 되고 결국 "공지" 폴더에 시간순으로 쌓인다 — 그럼 그건 블로그다.
 *
 * 글은 페이지다. 열고 고치고 댓글 다는 화면이 전부 같고, 이 화면은 목록만 맡는다.
 */
export function BlogPage() {
  const { space, reloadPages } = useOutletContext<WikiOutletContext>();
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 다음 쪽 커서(X-Next-Before). null이면 마지막 쪽 */
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** 스페이스를 옮기면 앞 스페이스의 늦은 "더 보기" 응답을 버린다 */
  const generation = useRef(0);
  const { createContent, creating } = useCreateContent(space.id, reloadPages);
  const readOnly = useReadOnly();
  const personName = usePersonName();

  useEffect(() => {
    let cancelled = false;
    generation.current += 1;
    setPosts(null);
    setError(null);
    setNextBefore(null);
    // 쪽 넘김(키셋) — 글은 계속 쌓이므로 전부 받지 않는다
    void readBlogPage(space.id, undefined)
      .then((page) => {
        if (cancelled) return;
        setPosts(page.items);
        setNextBefore(page.nextBefore);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "블로그를 불러오지 못했습니다"); });
    // 공개 문서에는 사람 이름을 싣지 않는다 — 디렉터리 조회 자체를 보내지 않는다.
    if (!readOnly) {
      void listUsers()
        .then((rows) => { if (!cancelled) setUsers(rows); })
        .catch(() => { if (!cancelled) setUsers([]); });
    }
    return () => { cancelled = true; };
  }, [space.id, readOnly]);

  const author = (id: string) => personName(id, users);

  const loadMore = async () => {
    if (!nextBefore) return;
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = await readBlogPage(space.id, nextBefore);
      if (mine !== generation.current) return;
      setPosts((current) => [...(current ?? []), ...page.items.filter((r) => !(current ?? []).some((c) => c.id === r.id))]);
      setNextBefore(page.nextBefore);
    } catch (e) {
      if (mine === generation.current) setError(e instanceof Error ? e.message : "블로그를 불러오지 못했습니다");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-settings blog-page">
      <header className="blog-page-head">
        <div>
          <h1 className="space-settings-title">블로그</h1>
          <p className="space-settings-desc">{space.name}의 소식과 글 — 최근 글이 위에 옵니다.</p>
        </div>
        {readOnly ? null : (
          <Button
            iconBefore={<PenLine size={16} aria-hidden="true" />}
            loading={creating}
            onClick={() => void createContent("blog")}
          >
            글 쓰기
          </Button>
        )}
      </header>

      {error ? <Banner variant="danger">{error}</Banner> : null}
      {posts && posts.length === 0 ? (
        <EmptyState
          media={<Newspaper size={32} aria-hidden="true" />}
          title="아직 글이 없습니다"
          description="공지·회고·주간 소식처럼 날짜순으로 읽는 글을 여기에 씁니다. 트리에는 나타나지 않습니다."
        />
      ) : null}
      {posts && posts.length > 0 ? (
        <ol className="blog-list" aria-label="블로그 글">
          {posts.map((post) => (
            <li key={post.id} className="blog-item">
              <div className="blog-item-meta">
                <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
                {author(post.createdBy) ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{author(post.createdBy)}</span>
                  </>
                ) : null}
                {post.status === "draft" ? <Lozenge appearance="neutral">초안</Lozenge> : null}
              </div>
              <h2 className="blog-item-title">
                <Link to={`/spaces/${space.id}/pages/${post.id}`}>
                  {post.icon ? <span className="blog-item-icon" aria-hidden="true">{post.icon}</span> : null}
                  {post.title}
                </Link>
              </h2>
              {post.excerpt ? <p className="blog-item-excerpt">{post.excerpt}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {posts && nextBefore ? (
        <Button variant="subtle" loading={loadingMore} onClick={() => void loadMore()}>
          이전 글 더 보기
        </Button>
      ) : null}
    </div>
  );
}
