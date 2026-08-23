import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, TextField } from "@chanho/react";
import { Search } from "lucide-react";

/** URL의 q를 단일 진실 소스로 쓰는 헤더 검색 폼. 제출 전 입력값만 로컬 초안으로 둔다. */
export function GlobalSearchField() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    const target = trimmed ? `/search?${params.toString()}` : "/search";
    navigate(target, { replace: pathname === "/search" });
  };

  return (
    <form className="wiki-global-search" role="search" onSubmit={handleSubmit}>
      <TextField
        className="wiki-global-search-field"
        label="전역 검색"
        type="search"
        value={draft}
        placeholder="페이지, 폴더, 첨부파일 검색"
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        type="submit"
        variant="ghost"
        size="small"
        iconOnly
        aria-label="검색 실행"
        iconBefore={<Search size={16} aria-hidden="true" />}
      />
    </form>
  );
}
