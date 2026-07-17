/**
 * 이모지 피커(W6 T4)용 정적 유니코드 목록 — 외부 의존성 없이 카테고리 4개(표정/사람·손/사물·기호/자연)로
 * 약 120개를 직접 나열한다. 각 항목의 keywords[0]이 그리드 버튼의 aria-label(접근 가능한 이름)이 되므로
 * 첫 키워드는 항상 그 이모지를 가장 잘 대표하는 한글 단어로 둔다.
 */
export interface EmojiEntry {
  char: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: EmojiEntry[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "faces",
    label: "표정",
    emojis: [
      { char: "😀", keywords: ["웃음", "미소"] },
      { char: "😃", keywords: ["활짝미소", "기쁨"] },
      { char: "😄", keywords: ["미소행복", "행복"] },
      { char: "😁", keywords: ["이빨웃음", "활짝"] },
      { char: "😆", keywords: ["크게웃음", "하하"] },
      { char: "😅", keywords: ["진땀", "웃음"] },
      { char: "🤣", keywords: ["폭소", "빵터짐"] },
      { char: "😂", keywords: ["눈물웃음", "웃김"] },
      { char: "🙂", keywords: ["잔잔미소", "웃음"] },
      { char: "😉", keywords: ["윙크"] },
      { char: "😊", keywords: ["수줍음", "미소"] },
      { char: "😇", keywords: ["천사", "순수"] },
      { char: "🥰", keywords: ["사랑", "설렘"] },
      { char: "😍", keywords: ["하트눈", "반함"] },
      { char: "🤩", keywords: ["반짝", "감탄"] },
      { char: "😘", keywords: ["뽀뽀", "키스"] },
      { char: "😋", keywords: ["맛있음", "혀"] },
      { char: "😜", keywords: ["메롱", "장난"] },
      { char: "🤔", keywords: ["고민", "생각"] },
      { char: "😐", keywords: ["무표정", "평범"] },
      { char: "😏", keywords: ["능글", "미소"] },
      { char: "😒", keywords: ["짜증", "불만"] },
      { char: "🙄", keywords: ["눈굴림", "어이없음"] },
      { char: "😌", keywords: ["안도", "편안"] },
      { char: "😴", keywords: ["잠", "수면"] },
      { char: "😭", keywords: ["눈물", "대성통곡"] },
      { char: "😡", keywords: ["화남", "분노"] },
      { char: "😱", keywords: ["비명", "공포"] },
      { char: "🥳", keywords: ["파티", "축하"] },
      { char: "😎", keywords: ["선글라스", "멋짐"] },
    ],
  },
  {
    id: "people",
    label: "사람/손",
    emojis: [
      { char: "👍", keywords: ["좋아요", "따봉"] },
      { char: "👎", keywords: ["싫어요", "비추천"] },
      { char: "👌", keywords: ["오케이", "좋음"] },
      { char: "✌️", keywords: ["브이", "평화"] },
      { char: "🤞", keywords: ["행운", "손가락교차"] },
      { char: "👋", keywords: ["손흔들기", "인사"] },
      { char: "🙌", keywords: ["만세", "축하"] },
      { char: "👏", keywords: ["박수", "칭찬"] },
      { char: "🙏", keywords: ["기도", "부탁", "감사"] },
      { char: "💪", keywords: ["힘", "근육"] },
      { char: "👊", keywords: ["주먹", "파이팅"] },
      { char: "🤝", keywords: ["악수", "협력"] },
      { char: "👉", keywords: ["오른쪽가리킴", "가리킴"] },
      { char: "👈", keywords: ["왼쪽가리킴", "가리킴"] },
      { char: "👆", keywords: ["위가리킴", "가리킴"] },
      { char: "👇", keywords: ["아래가리킴", "가리킴"] },
      { char: "✋", keywords: ["정지", "손바닥"] },
      { char: "🤚", keywords: ["손등"] },
      { char: "🖐️", keywords: ["다섯손가락"] },
      { char: "🤟", keywords: ["사랑해", "손짓"] },
      { char: "🤙", keywords: ["콜", "전화"] },
      { char: "💅", keywords: ["네일", "매니큐어"] },
      { char: "🧑‍💻", keywords: ["개발자", "코딩"] },
      { char: "🙋", keywords: ["손듦", "질문"] },
      { char: "🤦", keywords: ["이마짚음", "어이없음"] },
      { char: "🤷", keywords: ["어깨으쓱", "모름"] },
      { char: "🚶", keywords: ["걷기", "사람"] },
      { char: "🏃", keywords: ["달리기", "사람"] },
      { char: "👶", keywords: ["아기"] },
      { char: "🧓", keywords: ["노인"] },
    ],
  },
  {
    id: "objects",
    label: "사물/기호",
    emojis: [
      { char: "✅", keywords: ["체크", "완료"] },
      { char: "❌", keywords: ["엑스", "취소"] },
      { char: "❗", keywords: ["느낌표", "주의"] },
      { char: "❓", keywords: ["물음표", "질문"] },
      { char: "⭐", keywords: ["별", "중요"] },
      { char: "🌟", keywords: ["반짝별", "중요"] },
      { char: "✨", keywords: ["반짝임"] },
      { char: "🔥", keywords: ["불", "인기"] },
      { char: "💯", keywords: ["백점", "완벽"] },
      { char: "💡", keywords: ["전구", "아이디어"] },
      { char: "📌", keywords: ["압정", "고정"] },
      { char: "📎", keywords: ["클립", "첨부"] },
      { char: "🔗", keywords: ["링크", "연결"] },
      { char: "📝", keywords: ["메모", "글쓰기"] },
      { char: "📅", keywords: ["달력", "일정"] },
      { char: "⏰", keywords: ["알람", "시간"] },
      { char: "⏳", keywords: ["모래시계", "대기"] },
      { char: "🔒", keywords: ["자물쇠", "잠금"] },
      { char: "🔓", keywords: ["열림", "해제"] },
      { char: "🔑", keywords: ["열쇠"] },
      { char: "📢", keywords: ["확성기", "공지"] },
      { char: "📣", keywords: ["메가폰", "알림"] },
      { char: "💬", keywords: ["말풍선", "대화"] },
      { char: "💭", keywords: ["생각풍선", "생각"] },
      { char: "❤️", keywords: ["하트", "사랑"] },
      { char: "💔", keywords: ["상심", "깨진하트"] },
      { char: "🎉", keywords: ["축하", "파티"] },
      { char: "🎊", keywords: ["색종이", "축하"] },
      { char: "🚀", keywords: ["로켓", "출시"] },
      { char: "🛠️", keywords: ["도구", "수리"] },
    ],
  },
  {
    id: "nature",
    label: "자연",
    emojis: [
      { char: "🌞", keywords: ["해", "태양"] },
      { char: "🌙", keywords: ["달"] },
      { char: "🌠", keywords: ["별똥별", "유성"] },
      { char: "☀️", keywords: ["맑음", "해"] },
      { char: "☁️", keywords: ["구름"] },
      { char: "🌧️", keywords: ["비"] },
      { char: "⛅", keywords: ["흐림", "구름"] },
      { char: "⛄", keywords: ["눈사람"] },
      { char: "❄️", keywords: ["눈", "눈송이"] },
      { char: "🌈", keywords: ["무지개"] },
      { char: "🌊", keywords: ["파도", "바다"] },
      { char: "🌋", keywords: ["화산"] },
      { char: "🌳", keywords: ["나무"] },
      { char: "🌲", keywords: ["소나무"] },
      { char: "🌸", keywords: ["벚꽃", "꽃"] },
      { char: "🌷", keywords: ["튤립", "꽃"] },
      { char: "🌻", keywords: ["해바라기", "꽃"] },
      { char: "🍀", keywords: ["네잎클로버", "행운"] },
      { char: "🍁", keywords: ["단풍"] },
      { char: "🍃", keywords: ["나뭇잎"] },
      { char: "🌵", keywords: ["선인장"] },
      { char: "🐶", keywords: ["강아지", "개"] },
      { char: "🐱", keywords: ["고양이"] },
      { char: "🐰", keywords: ["토끼"] },
      { char: "🐻", keywords: ["곰"] },
      { char: "🐼", keywords: ["판다"] },
      { char: "🦁", keywords: ["사자"] },
      { char: "🐸", keywords: ["개구리"] },
      { char: "🐦", keywords: ["새"] },
      { char: "🦋", keywords: ["나비"] },
    ],
  },
];

/** 카테고리 전체를 평탄화한 전체 이모지 목록 — 검색용 */
export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

/** 키워드 부분 일치(대소문자 무시) — 카테고리 무관 전체 검색. 빈 질의는 빈 배열(호출부가 카테고리 탭으로 대체). */
export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJIS.filter((e) => e.keywords.some((k) => k.toLowerCase().includes(q)));
}
