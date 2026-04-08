export interface Checkpoint {
  id: string;
  text: string;
  images: string[];
  time: string;
  location?: string;
  author: string;
  authorAvatar: string;
  sourceRef?: string;
}

export interface Thread {
  id: string;
  title: string;
  description: string;
  visibility: "private" | "public";
  coverImage: string;
  createdAt: string;
  author: string;
  authorAvatar: string;
  checkpoints: Checkpoint[];
}

export interface Bookmark {
  id: string;
  thread: Thread;
  createdAt: string;
}

export interface BlueskyPost {
  uri: string;
  text: string;
  images: string[];
  createdAt: string;
  selected?: boolean;
}

const IMG = (id: number, w = 800, h = 600) =>
  `https://picsum.photos/seed/tc${id}/${w}/${h}`;

const AVATAR_SHINO3 = IMG(99, 200, 200);
const AVATAR_YUKI = IMG(80, 200, 200);
const AVATAR_TARO = IMG(81, 200, 200);

export const thread: Thread = {
  id: "1",
  title: "京都日帰り旅",
  description:
    "桜の季節に京都を日帰りで巡りました。伏見稲荷から嵐山まで、春の京都を満喫した一日の記録。",
  visibility: "private",
  coverImage: IMG(10, 1200, 630),
  createdAt: "2026-04-01",
  author: "shino3",
  authorAvatar: AVATAR_SHINO3,
  checkpoints: [
    {
      id: "cp1",
      text: "京都駅到着！新幹線の中から富士山が見えてテンション上がった",
      images: [IMG(1), IMG(2, 800, 800)],
      time: "09:00",
      location: "京都駅",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "cp2",
      text: "伏見稲荷大社の千本鳥居。朝早めに来たので人が少なくて最高だった",
      images: [IMG(3), IMG(4), IMG(5)],
      time: "10:30",
      location: "伏見稲荷大社",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "cp3",
      text: "祇園の路地裏で見つけた小さなカフェでランチ。湯葉の御膳が美味しかった",
      images: [IMG(6, 800, 800)],
      time: "12:00",
      location: "祇園",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "cp4",
      text: "清水寺。桜と舞台の組み合わせは何度見ても圧巻",
      images: [IMG(7), IMG(8), IMG(9), IMG(11)],
      time: "14:00",
      location: "清水寺",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "cp5",
      text: "嵐山の竹林。風が吹くとサラサラ音がして心地よい",
      images: [IMG(12), IMG(13)],
      time: "16:00",
      location: "嵐山竹林",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "cp6",
      text: "京都タワーからの夜景を眺めて帰路へ。また来よう",
      images: [IMG(14)],
      time: "18:30",
      location: "京都タワー",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
  ],
};

export const publicThread: Thread = {
  id: "2",
  title: "技術書典アフター",
  description:
    "技術書典16のあとのオフ会。秋葉原〜上野エリアで食べ歩き＆語り合い。",
  visibility: "public",
  coverImage: IMG(20, 1200, 630),
  createdAt: "2026-03-22",
  author: "shino3",
  authorAvatar: AVATAR_SHINO3,
  checkpoints: [
    {
      id: "pub1",
      text: "技術書典おつかれさまでした！戦利品の山。さあ打ち上げへ！",
      images: [IMG(21), IMG(22)],
      time: "16:00",
      location: "秋葉原UDX",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
    {
      id: "pub2",
      text: "まずは肉！みんなでシェアして最高",
      images: [IMG(23, 800, 800)],
      time: "17:00",
      location: "焼肉屋",
      author: "yuki",
      authorAvatar: AVATAR_YUKI,
    },
    {
      id: "pub3",
      text: "二次会のカフェバー。AT Protocolの話で盛り上がった",
      images: [IMG(24), IMG(25), IMG(26)],
      time: "19:30",
      location: "上野カフェバー",
      author: "taro",
      authorAvatar: AVATAR_TARO,
    },
    {
      id: "pub4",
      text: "解散！みんなありがとう。また次回！",
      images: [IMG(27)],
      time: "22:00",
      author: "shino3",
      authorAvatar: AVATAR_SHINO3,
    },
  ],
};

export const threadList: Thread[] = [
  thread,
  publicThread,
  {
    id: "3",
    title: "週末カフェ巡り",
    description: "東京の気になるカフェを巡る一日。",
    visibility: "private",
    coverImage: IMG(30, 1200, 630),
    createdAt: "2026-03-15",
    author: "shino3",
    authorAvatar: AVATAR_SHINO3,
    checkpoints: [],
  },
  {
    id: "4",
    title: "鎌倉ハイキング",
    description: "天園ハイキングコースを歩いてきました。",
    visibility: "private",
    coverImage: IMG(40, 1200, 630),
    createdAt: "2026-03-08",
    author: "shino3",
    authorAvatar: AVATAR_SHINO3,
    checkpoints: [],
  },
];

export const bookmarks: Bookmark[] = [
  {
    id: "bm1",
    thread: {
      id: "ext1",
      title: "北海道グルメ旅",
      description: "札幌→小樽→函館の3日間。海鮮三昧！",
      visibility: "private",
      coverImage: IMG(50, 1200, 630),
      createdAt: "2026-03-10",
      author: "yuki",
      authorAvatar: AVATAR_YUKI,
      checkpoints: [],
    },
    createdAt: "2026-03-12",
  },
  {
    id: "bm2",
    thread: {
      id: "ext2",
      title: "React Conf 2026 現地レポ",
      description: "React Conf に現地参加！",
      visibility: "public",
      coverImage: IMG(60, 1200, 630),
      createdAt: "2026-02-28",
      author: "taro",
      authorAvatar: AVATAR_TARO,
      checkpoints: [],
    },
    createdAt: "2026-03-01",
  },
];

export const blueskyPosts: BlueskyPost[] = [
  {
    uri: "at://did:plc:xxxx/app.bsky.feed.post/1",
    text: "奈良公園で鹿と遊んできた。春日大社の藤が見頃でとても綺麗だった",
    images: [IMG(70), IMG(71)],
    createdAt: "2026-03-20 14:30",
    selected: true,
  },
  {
    uri: "at://did:plc:xxxx/app.bsky.feed.post/2",
    text: "東大寺の大仏殿。何度来ても大きさに圧倒される",
    images: [IMG(72)],
    createdAt: "2026-03-20 11:00",
    selected: true,
  },
  {
    uri: "at://did:plc:xxxx/app.bsky.feed.post/3",
    text: "ならまちの古い町並みを散策中。素敵な雑貨屋さん発見",
    images: [IMG(73), IMG(74), IMG(75)],
    createdAt: "2026-03-20 15:45",
  },
  {
    uri: "at://did:plc:xxxx/app.bsky.feed.post/4",
    text: "今日のランチは柿の葉寿司。奈良の名物！",
    images: [IMG(76, 800, 800)],
    createdAt: "2026-03-20 12:30",
  },
  {
    uri: "at://did:plc:xxxx/app.bsky.feed.post/5",
    text: "帰りの近鉄から見た夕焼けが綺麗だった",
    images: [IMG(77)],
    createdAt: "2026-03-20 17:00",
  },
];
