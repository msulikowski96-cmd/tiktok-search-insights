// Real stats of 10 Polish "cytaty motywacyjne" videos (from a test search on 2026-10-16),
// rebuilt in TikTok's raw web API shape so the whole pipeline can be tested offline.
const rows = [
    ['7593665519165771030', 'michalll2132', 8897, 'ŻYCIOWA PRAWDA👂🫵👂 #motywacja #rozwoj #prawda #cytaty #życie', 1300000, 82600, 913, 87100, 6866, '2026-01-10T09:40:43Z', 25, 'dźwięk oryginalny', true],
    ['7445649351285738774', 'pikmotywacji', 5603, '✨ Poukładana głowa to 90% sukcesu ✨\n📌 Kiedy wreszcie znajdziesz swój złoty środek... #motywacja #Rozwój #Sukces #biznes #nawyki #dyscyplina #wiara #rozwojosobisty #życie #pieniądze', 949700, 70500, 201, 4701, 12800, '2024-12-07T12:42:16Z', 17, 'dźwięk oryginalny', true],
    ['7400741336250469664', 'sekretniak', 136400, 'Jestem z Ciebie dumny bro ❤️‍🩹💪 #motywacja #wsparcie #cytaty #motywacjadodziałania #lekcja #rozwojosobisty', 999100, 64300, 1155, 4768, 14500, '2024-08-08T12:16:15Z', 18, 'dźwięk oryginalny', true],
    ['7619442310094408992', 'wujek.radzi', 19300, 'dni, których nie znamy... 😊 #cytaty #inspiracja #cytat #rozwój #motywacja', 563700, 39600, 296, 7272, 7273, '2026-03-20T20:47:42Z', 50, 'oryginalny dźwięk', true],
    ['7425290151900826902', 'akademia_nawyku', 59200, 'MOTYWACJA DLA TYCH KTÓRZY W SIEBIE NIE WIERZĄ 💪 #motywacja #motywacyjnecytaty #motywacyjnesłowa #motywacjadodziałania #motywacjanadziś #sukces #wiarawsiebie #drogadocelu #rozwojosobisty #rozwójosobisty #przekaz #najlepszecytatyżyciowe #cytatyosukcesie #ciężkapraca #inspiracja #akademia_nawyku', 257700, 7643, 119, 1461, 2368, '2024-10-13T15:58:14Z', 26, 'dźwięk oryginalny', true],
    ['7691754546816617761', 'justynaaaaa_k', 3413, 'Po co ten stres? 🤷🏼‍♀️ #zachódsłońca #cytaty #motywacja #jesień #widoki', 233100, 5741, 37, 424, 1413, '2026-10-01T17:36:05Z', 12, 'Acidland (Polska Wersja)', false],
    ['7599753108675136790', 'milionerwifi_', 59800, 'Ile razy próbowałeś coś komuś wytłumaczyć… i od razu wiedziałeś, że to strata czasu? #milionerwifi #motywacja #ecommerce #rada #mindset', 127800, 5039, 5, 1214, 2400, '2026-01-26T19:23:33Z', 12, 'dźwięk oryginalny', true],
    ['7692089427610324257', 'zaton_athletic', 246200, 'Zaobserwuj po więcej motywacji🤝 #dc #motywacja #cytat', 42000, 4746, 4, 276, 388, '2026-10-02T15:15:36Z', 9, 'biting bullets', false],
    ['7606828643989441814', 'poczuje.to', 1703, '#motywacja #cytaty #dlaciebie #myśli', 40900, 1989, 4, 128, 857, '2026-02-14T21:00:14Z', 0, 'losing', false],
    ['7429424628654755105', 'wzasiegumarzen', 587, 'Never give up🏆 #motivation#motywacja#fyp#dlaciebie#fyp#sport#gym#cytaty#rules#mentality#tiktokpolska#samorozwoj#pracanadsoba#ciezkapraca#dyscyplina#bussines#viral#milionaire#wzasiegumarzen', 106900, 1476, 8, 226, 741, '2024-10-24T19:22:02Z', 0, 'To Be Me, Or Not To Be Me', false],
];

export const rawItems = rows.map(([id, user, followers, desc, views, likes, comments, shares, saves, iso, duration, songTitle, original], i) => ({
    id,
    desc,
    createTime: Math.floor(new Date(iso).getTime() / 1000),
    author: { id: `author${i}`, uniqueId: user, nickname: user, verified: false, avatarThumb: `https://p16.example/${user}.jpg` },
    authorStats: { followerCount: followers, followingCount: 10, heartCount: likes * 3, videoCount: 50 },
    stats: { playCount: views, diggCount: likes, commentCount: comments, shareCount: shares, collectCount: saves },
    statsV2: { playCount: String(views), diggCount: String(likes), commentCount: String(comments), shareCount: String(shares), collectCount: String(saves) },
    video: { duration, width: 576, height: 1024, ratio: '540p', cover: `https://p16.example/${id}.jpg`, playAddr: `https://v16.example/${id}.mp4` },
    music: { id: `m${i}`, title: songTitle, authorName: user, original, duration: 30 },
    textExtra: [...desc.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => ({ hashtagName: m[1] })),
}));

// Three response shapes TikTok uses.
export const searchItemFull = { item_list: rawItems.slice(0, 4), has_more: 1, cursor: 4 };
export const searchGeneralFull = { data: rawItems.slice(4, 7).map((item) => ({ type: 1, item })), has_more: 1 };
export const challengeItemList = { itemList: rawItems.slice(7), hasMore: false };
