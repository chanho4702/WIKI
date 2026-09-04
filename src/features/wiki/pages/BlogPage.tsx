import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { Banner, Button, EmptyState, Lozenge } from "@chanho/react";
import { Newspaper, PenLine } from "lucide-react";
import type { BlogPost, User } from "../store/types";
import { listBlogPosts, listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { useCreateContent } from "../lib/useCreateContent";
import { displayUserName } from "../lib/userName";
import { useReadOnly } from "../lib/readOnly";

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
  const { createContent, creating } = useCreateContent(space.id, reloadPages);
  const readOnly = useReadOnly();

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setError(null);
    void listBlogPosts(space.id)
      .then((rows) => { if (!cancelled) setPosts(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "블로그를 불러오지 못했습니다"); });
    void listUsers().then((rows) => { if (!cancelled) setUsers(rows); });
    return () => { cancelled = true; };
  }, [space.id]);

  const author = (id: string) => users.find((u) => u.id === id)?.name ?? displayUserName(id);

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
                <span aria-hidden="true">·</span>
                <span>{author(post.createdBy)}</span>
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
    </div>
  );
}
