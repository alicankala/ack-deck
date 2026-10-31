export type PrayerSectionInfo = {
  name: string;
  rakats: number;
  type: "sunnah" | "fard" | "wajib" | "last_sunnah";
  typeLabel: string;
  hasKametBefore?: boolean;
  notes?: string;
};

export type PrayerGuideItem = {
  id: string;
  title: string;
  timeLabel: string;
  totalRakats: number;
  sections: PrayerSectionInfo[];
  description: string;
  stepByStep: string[];
};

export type SurahOrDua = {
  id: string;
  title: string;
  category: "surah" | "dua" | "tesbihat" | "kamet";
  categoryLabel: string;
  order?: number;
  whenRead: string;
  arabic?: string;
  turkishReading: string;
  turkishMeaning: string;
  notes?: string;
};

export const PRAYER_GUIDE_ITEMS: PrayerGuideItem[] = [
  {
    id: "fajr",
    title: "Sabah Namazı",
    timeLabel: "İmsak ile Güneş arası",
    totalRakats: 4,
    description: "Sabah namazı 2 rekat sünnet ve 2 rekat farz olmak üzere toplam 4 rekattır. Önce sünnet, sonra farz kılınır.",
    sections: [
      {
        name: "2 Rekat Sünnet",
        rakats: 2,
        type: "sunnah",
        typeLabel: "Sünnet-i Müekkede",
        notes: "Sünnetlerin en kuvvetlisidir. 1. rekatta Sübhaneke, Fatiha ve zamm-ı sure; 2. rekatta Fatiha ve zamm-ı sure okunur. Oturuşta Ettehiyyatü, Salli-Barik ve Rabbena duaları okunup selam verilir.",
      },
      {
        name: "2 Rekat Farz",
        rakats: 2,
        type: "fard",
        typeLabel: "Farz",
        hasKametBefore: true,
        notes: "⚠️ Farza durmadan hemen önce erkekler kamet getirir. Kılınışı sünnet gibidir ancak niyet farzadır.",
      },
    ],
    stepByStep: [
      "1. Sünnete Niyet: 'Niyet ettim Allah rızası için bugünkü sabah namazının iki rekat sünnetini kılmaya.'",
      "2. Tekbir: 'Allâhu Ekber' deyip eller bağlanır.",
      "3. 1. Rekat: Sübhaneke, Eûzü-Besmele, Fatiha Suresi ve bir Zamm-ı Sure okunur. Rükû ve secdeler yapılır.",
      "4. 2. Rekat: Besmele, Fatiha Suresi ve bir Zamm-ı Sure okunur. Rükû ve secdeler yapılır.",
      "5. Son Oturuş: Ettehiyyâtü, Allâhümme Salli, Allâhümme Bârik ve Rabbenâ duaları okunup önce sağa sonra sola selam verilir.",
      "6. 🔔 KAMET: Farza kalkmadan önce kamet getirilir.",
      "7. Farza Niyet: 'Niyet ettim Allah rızası için bugünkü sabah namazının iki rekat farzını kılmaya.' Tekbir alınıp 2 rekat sünnet gibi kılınır.",
      "8. Namaz tamamlandıktan sonra Tesbihat ve Âyet-el Kürsî okunur.",
    ],
  },
  {
    id: "dhuhr",
    title: "Öğle Namazı",
    timeLabel: "Öğle ile İkindi arası",
    totalRakats: 10,
    description: "Öğle namazı 4 rekat ilk sünnet, 4 rekat farz ve 2 rekat son sünnet olmak üzere toplam 10 rekattır.",
    sections: [
      {
        name: "4 Rekat İlk Sünnet",
        rakats: 4,
        type: "sunnah",
        typeLabel: "İlk Sünnet",
        notes: "1. ve 2. rekatta Fatiha + Zamm-ı sure. İlk oturuşta sadece Ettehiyyâtü okunur. 3. ve 4. rekatta da Fatiha + Zamm-ı sure okunur.",
      },
      {
        name: "4 Rekat Farz",
        rakats: 4,
        type: "fard",
        typeLabel: "Farz",
        hasKametBefore: true,
        notes: "⚠️ Farza başlamadan önce kamet getirilir. Farzın 1. ve 2. rekatlarında Fatiha + Zamm-ı sure okunurken; 3. ve 4. rekatlarında SADECE Fatiha okunur (zamm-ı sure okunmaz).",
      },
      {
        name: "2 Rekat Son Sünnet",
        rakats: 2,
        type: "last_sunnah",
        typeLabel: "Son Sünnet",
        notes: "Sabah namazının sünneti gibi 2 rekat kılınır.",
      },
    ],
    stepByStep: [
      "1. İlk Sünnet (4 Rekat): 1. ve 2. rekatta Fatiha + Zamm-ı sure okunur. 2. rekatın sonunda ilk oturuşta sadece Ettehiyyâtü okunup 3. rekata kalkılır. 3. ve 4. rekatta da Fatiha + Zamm-ı sure okunup son oturuşta selam verilir.",
      "2. 🔔 KAMET: Farz için ayağa kalkıldığında kamet getirilir.",
      "3. Farz (4 Rekat): 1. ve 2. rekatta Fatiha + Zamm-ı sure; ilk oturuşta sadece Ettehiyyâtü. 3. ve 4. rekatta YALNIZCA Fatiha okunur (zamm-ı sure okunmaz).",
      "4. Son Sünnet (2 Rekat): Sabah namazının 2 rekat sünneti gibi kılınır.",
      "5. Tesbihat ve Âyet-el Kürsî ile namaz tamamlanır.",
    ],
  },
  {
    id: "asr",
    title: "İkindi Namazı",
    timeLabel: "İkindi ile Akşam arası",
    totalRakats: 8,
    description: "İkindi namazı 4 rekat sünnet ve 4 rekat farz olmak üzere toplam 8 rekattır.",
    sections: [
      {
        name: "4 Rekat Sünnet",
        rakats: 4,
        type: "sunnah",
        typeLabel: "Gayr-i Müekkede Sünnet",
        notes: "Önemli Fark: İlk oturuşta Ettehiyyâtü'den sonra Allâhümme Salli ve Bârik de okunur. 3. rekata kalkıldığında Sübhaneke ve Eûzü-Besmele ile başlanır.",
      },
      {
        name: "4 Rekat Farz",
        rakats: 4,
        type: "fard",
        typeLabel: "Farz",
        hasKametBefore: true,
        notes: "⚠️ Farza durmadan hemen önce kamet getirilir. 3. ve 4. rekatlarda sadece Fatiha okunur.",
      },
    ],
    stepByStep: [
      "1. Sünnet (4 Rekat): 1. ve 2. rekatta Fatiha + Zamm-ı sure. İlk oturuşta Ettehiyyâtü + Salli + Bârik okunur.",
      "2. Sünnet 3. Rekata kalkınca: Sübhaneke okunur, sonra Eûzü-Besmele, Fatiha ve Zamm-ı sure okunur. 4. rekatta da Fatiha + Zamm-ı sure okunup selam verilir.",
      "3. 🔔 KAMET: Farza durmadan önce kamet getirilir.",
      "4. Farz (4 Rekat): Tıpkı öğle namazının farzı gibi; ilk 2 rekatta Fatiha + Zamm-ı sure, 3. ve 4. rekatta ise sadece Fatiha okunur.",
      "5. Tesbihat ve Âyet-el Kürsî okunur.",
    ],
  },
  {
    id: "maghrib",
    title: "Akşam Namazı",
    timeLabel: "Akşam ile Yatsı arası",
    totalRakats: 5,
    description: "Akşam namazı önce 3 rekat farz, sonra 2 rekat sünnet olmak üzere toplam 5 rekattır. Vakti dar olduğu için önce farzı kılınır.",
    sections: [
      {
        name: "3 Rekat Farz",
        rakats: 3,
        type: "fard",
        typeLabel: "Farz (Önce Kılınır)",
        hasKametBefore: true,
        notes: "⚠️ Akşam namazına başlarken doğrudan kamet getirilir. 1. ve 2. rekatta Fatiha + Zamm-ı sure; ilk oturuşta Ettehiyyâtü; 3. rekatta sadece Fatiha okunur.",
      },
      {
        name: "2 Rekat Sünnet",
        rakats: 2,
        type: "sunnah",
        typeLabel: "Sünnet",
        notes: "Sabah namazının sünneti gibi 2 rekat kılınır.",
      },
    ],
    stepByStep: [
      "1. 🔔 KAMET: Akşam namazı doğrudan farzla başladığı için en başta kamet getirilir.",
      "2. Farz (3 Rekat): 1. ve 2. rekatta Fatiha + Zamm-ı sure. 2. rekat sonunda oturulup sadece Ettehiyyâtü okunur. 3. rekatta SADECE Fatiha okunur, rükû ve secdelerden sonra son oturuş yapılıp selam verilir.",
      "3. Sünnet (2 Rekat): Sabah namazının 2 rekat sünneti gibi kılınır.",
      "4. Tesbihat ve Âyet-el Kürsî okunur.",
    ],
  },
  {
    id: "isha",
    title: "Yatsı Namazı",
    timeLabel: "Yatsı ile İmsak arası",
    totalRakats: 13,
    description: "Yatsı namazı 4 rekat ilk sünnet, 4 rekat farz, 2 rekat son sünnet ve 3 rekat vitir vacip olmak üzere toplam 13 rekattır.",
    sections: [
      {
        name: "4 Rekat İlk Sünnet",
        rakats: 4,
        type: "sunnah",
        typeLabel: "Gayr-i Müekkede Sünnet",
        notes: "İkindi sünneti gibidir: İlk oturuşta Ettehiyyâtü + Salli + Bârik okunur. 3. rekata kalkınca Sübhaneke ile başlanır.",
      },
      {
        name: "4 Rekat Farz",
        rakats: 4,
        type: "fard",
        typeLabel: "Farz",
        hasKametBefore: true,
        notes: "⚠️ Farza kalkarken kamet getirilir. 3. ve 4. rekatlarda sadece Fatiha okunur.",
      },
      {
        name: "2 Rekat Son Sünnet",
        rakats: 2,
        type: "last_sunnah",
        typeLabel: "Son Sünnet",
        notes: "Sabah namazının sünneti gibi 2 rekat kılınır.",
      },
      {
        name: "3 Rekat Vitir Vacip",
        rakats: 3,
        type: "wajib",
        typeLabel: "Vacip",
        notes: "3. rekatta Fatiha ve zamm-ı sureden sonra tekbir ('Allâhu Ekber') alınıp eller tekrar bağlanır ve Kunut Duaları okunur.",
      },
    ],
    stepByStep: [
      "1. İlk Sünnet (4 Rekat): İkindi namazının sünneti gibi kılınır (1. oturuşta Salli-Barik okunur, 3. rekatta Sübhaneke ile başlanır).",
      "2. 🔔 KAMET: Farza durmadan hemen önce kamet getirilir.",
      "3. Farz (4 Rekat): Öğle ve ikindi farzı gibi; ilk iki rekatta zamm-ı sure var, 3 ve 4'te sadece Fatiha.",
      "4. Son Sünnet (2 Rekat): Sabah sünneti gibi 2 rekat kılınır.",
      "5. 3 Rekat Vitir Namazı: 1. ve 2. rekatta Fatiha + Zamm-ı sure okunur. 2. rekatta oturulup sadece Ettehiyyâtü okunur. 3. rekata kalkılıp Besmele, Fatiha ve Zamm-ı sure okunur.",
      "6. Vitir Tekbiri ve Kunut: 3. rekatta zamm-ı sureden sonra eller kulak hizasına kaldırılıp 'Allâhu Ekber' denir ve tekrar bağlanır. Kunut Duaları (1 ve 2) okunur, rükû ve secdeye gidilir. Son oturuşta selam verilir.",
      "7. Tesbihat ve Âyet-el Kürsî okunur.",
    ],
  },
];

export const KAMET_INFO = {
  title: "Kamet Nedir ve Ne Zaman Getirilir?",
  rule: "Farz namazlara başlamadan hemen önce erkekler tarafından okunur. Sünnet ve vitir namazlarında kamet getirilmez. Kadınların kamet getirmesi gerekmez.",
  timing: "Cemaatle kılınırken imam namaza başlamadan önce, tek başına kılarken de farza durmadan önce getirilir.",
  arabic: "الله أكبر الله أكبر ، الله أكبر الله أكبر\nأشهد أن لا إله إلا الله ، أشهد أن لا إله إلا الله\nأشهد أن محمدا رسول الله ، أشهد أن محمدا رسول الله\nحي على الصلاة ، حي على الصلاة\nحي على الفلاح ، حي على الفلاح\nقد قامت الصلاة ، قد قامت الصلاة\nالله أكبر الله أكبر\nلا إله إلا الله",
  turkishReading: `Allâhu Ekber, Allâhu Ekber
Allâhu Ekber, Allâhu Ekber
Eşhedü en lâ ilâhe illallâh, Eşhedü en lâ ilâhe illallâh
Eşhedü enne Muhammeden Resûlullâh, Eşhedü enne Muhammeden Resûlullâh
Hayye ale's-Salâh, Hayye ale's-Salâh
Hayye ale'l-Felâh, Hayye ale'l-Felâh
Kad kâmeti's-Salâh, Kad kâmeti's-Salâh
Allâhu Ekber, Allâhu Ekber
Lâ ilâhe illallâh`,
  turkishMeaning: `Allah en büyüktür, Allah en büyüktür.
Allah'tan başka ilah olmadığına şehadet ederim.
Muhammed'in Allah'ın elçisi olduğuna şehadet ederim.
Haydin namaza, haydin namaza.
Haydin kurtuluşa, haydin kurtuluşa.
Namaz başladı, namaz başladı.
Allah en büyüktür, Allah en büyüktür.
Allah'tan başka ilah yoktur.`,
};

export const TESBIHAT_INFO = {
  title: "Tesbihat ve Âyet-el Kürsî Sırası",
  rule: "Farz namazın veya son sünnetin hemen ardından selam verildikten sonra sırasıyla yapılır.",
  steps: [
    {
      title: "1. İstiğfar ve Selam Duası",
      timing: "Selam verdikten hemen sonra söylenir.",
      turkishReading: "Estagfirullâh, Estagfirullâh, Estagfirullâh el-azîm el-kerîm ellezî lâ ilâhe illâ hû el-hayyel kayyûme ve etûbü ileyh.\n\nAllâhümme ente's-selâmü ve minke's-selâm, tebârakte yâ ze'l-celâli ve'l-ikrâm.",
      turkishMeaning: "Allah'ım! Sen selam ve esenlik sahibisin, selamet ve esenlik ancak Sendendir. Ey celal ve ikram sahibi Allah'ım! Sen yücelerden yücesin.",
    },
    {
      title: "2. Salavat",
      timing: "Tesbihe geçişte okunur.",
      turkishReading: "Alâ Resûlinâ salavât:\nAllâhümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed.",
      turkishMeaning: "Peygamberimiz Hz. Muhammed'e salât ve selam olsun.",
    },
    {
      title: "3. Tesbih Giriş Duası",
      timing: "Âyet-el Kürsî'den önce söylenir.",
      turkishReading: "Sübhânallâhi ve'l-hamdü lillâhi ve lâ ilâhe illallâhü vallâhu ekber. Ve lâ havle ve lâ kuvvete illâ billâhi'l-aliyyi'l-azîm.",
      turkishMeaning: "Allah her türlü noksanlıktan uzaktır. Hamd Allah'a mahsustur. Allah'tan başka ilah yoktur ve Allah en büyüktür. Güç ve kuvvet ancak yüce ve ulu olan Allah'tandır.",
    },
    {
      title: "4. Âyet-el Kürsî (Bakara Suresi, 255. Ayet)",
      timing: "Tesbih çekilmeden hemen önce Eûzü-Besmele ile okunur.",
      isAyatelKursi: true,
      arabic: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ",
      turkishReading: `Allâhü lâ ilâhe illâ hüve'l-hayyü'l-kayyûm.
Lâ te'huzühû sinetün ve lâ nevm.
Lehû mâ fi's-semâvâti ve mâ fi'l-ard.
Men zellezî yeşfeu indehû illâ bi-iznih.
Ya'lemü mâ beyne eydîhim ve mâ halfehüm.
Ve lâ yühîtûne bi-şey'in min ilmihî illâ bimâ şâ'.
Vesia kürsiyyühü's-semâvâti ve'l-ard.
Ve lâ yeûdühû hıfzuhümâ.
Ve hüve'l-aliyyü'l-azîm.`,
      turkishMeaning: `Allah, O'ndan başka hiçbir ilah olmayandır; Hayy'dır (daima diridir), Kayyûm'dur (bütün varlığı idare edendir).
O'nu ne bir uyuklama tutabilir, ne de bir uyku.
Göklerde ve yerde ne varsa hepsi O'nundur.
O'nun izni olmadan katında şefaat edebilecek kimdir?
O, kullarının önlerindekini (yaptıklarını) ve arkalarındakini (yapacaklarını) bilir.
Onlar ise O'nun ilminden, kendisinin dilediğinden başka hiçbir şeyi kavrayamazlar.
O'nun kürsüsü gökleri ve yeri kaplamıştır.
Onları koruyup gözetmek O'na hiçbir ağırlık vermez.
O, çok yücedir, çok büyüktür.`,
    },
    {
      title: "5. 33'lük Tesbihler",
      timing: "Âyet-el Kürsî'den sonra sırayla 33'er defa çekilir.",
      turkishReading: `• Zülcelâli vel kemâli celle celâlüh: 33 defa "Sübhânallâh" (سُبْحَانَ الله)
• Râbbel âlemîne teâlâ şânüh: 33 defa "Elhamdülillâh" (الْحَمْدُ لله)
• Rabbi'l-azîmillezî lâ ilâhe illâ hû: 33 defa "Allâhu Ekber" (اللهُ أَكْبَر)`,
      turkishMeaning: "Allah her türlü eksiklikten münezzehtir (33) • Hamd alemlerin Rabbi Allah'a mahsustur (33) • Allah en büyüktür (33).",
    },
    {
      title: "6. Tesbih Tamamlama Duası ve Tahrîme",
      timing: "Tesbihler bittikten sonra eller duaya açılmadan önce söylenir.",
      turkishReading: "Lâ ilâhe illallâhu vahdehû lâ şerîke leh. Lehü'l-mülkü ve lehü'l-hamdü ve hüve alâ külli şey'in kadîr. Ve mâ erselnâke illâ rahmeten li'l-âlemîn.",
      turkishMeaning: "Allah'tan başka hiçbir ilah yoktur. O tektir, ortağı yoktur. Mülk O'nundur, hamd O'nadır ve O her şeye kadirdir. (Ey Muhammed!) Biz seni ancak alemlere rahmet olarak gönderdik.",
    },
  ],
};

export const ZAMMI_SURELER: SurahOrDua[] = [
  {
    id: "fatiha",
    title: "Fâtiha Suresi",
    category: "surah",
    categoryLabel: "Açılış Suresi",
    order: 1,
    whenRead: "Namazın her rekatında mutlaka ilk olarak okunması vacip olan suredir.",
    arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾ الرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾ مَالِكِ يَوْمِ الدِّينِ ﴿٤﴾ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ﴿٥﴾ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Elhamdü lillâhi rabbi'l-âlemîn.
Errahmâni'r-rahîm.
Mâliki yevmi'd-dîn.
İyyâke na'büdü ve iyyâke neste'în.
İhdina's-sırâta'l-müstekîm.
Sırâtallezîne en'amte aleyhim gayri'l-magdûbi aleyhim veleddâllîn. (Âmîn)`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Hamd, âlemlerin Rabbi olan Allah'a mahsustur.
O, Rahmân'dır, Rahîm'dir.
Din (hesap) gününün mâlikidir.
(Rabbimiz!) Yalnız Sana kulluk eder ve yalnız Senden yardım dileriz.
Bizi doğru yola ilet;
Kendilerine nimet verdiğin kimselerin yoluna; gazaba uğramışların ve sapmışların yoluna değil.`,
  },
  {
    id: "fil",
    title: "Fil Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 105,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "أَلَمْ تَرَ كَيْفَ فَعَلَ رَبُّكَ بِأَصْحَابِ الْفِيلِ ﴿١﴾ أَلَمْ يَجْعَلْ كَيْدَهُمْ فِي تَضْلِيلٍ ﴿٢﴾ وَأَرْسَلَ عَلَيْهِمْ طَيْرًا أَبَابِيلَ ﴿٣﴾ تَرْمِيهِمْ بِحِجَارَةٍ مِنْ سِجِّيلٍ ﴿٤﴾ فَجَعَلَهُمْ كَعَصْفٍ مَأْكُولٍ ﴿٥﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Elem tera keyfe fe'ale rabbüke bi-ashâbi'l-fîl.
Elem yec'al keydehüm fî tadlîl.
Ve ersele aleyhim tayran ebâbîl.
Termîhim bi-hıcâratin min siccîl.
Fe-ce'alehüm ke-asfin me'kûl.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Görmedin mi Rabbin fil sahiplerine ne yaptı?
Onların tuzaklarını boşa çıkarmadı mı?
Üzerlerine bölük bölük Ebâbîl kuşları gönderdi.
O kuşlar onların üzerlerine pişkin tuğladan taşlar atıyorlardı.
Nihayet onları yenilmiş ekin yaprağı gibi kuru bir çöpe çevirdi.`,
  },
  {
    id: "kureys",
    title: "Kureyş Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 106,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "لِإِيلَافِ قُرَيْشٍ ﴿١﴾ إِيلَافِهِمْ رِحْلَةَ الشِّتَاءِ وَالصَّيْفِ ﴿٢﴾ فَلْيَعْبُدُوا رَبَّ هَٰذَا الْبَيْتِ ﴿٣﴾ الَّذِي أَطْعَمَهُمْ مِنْ جُوعٍ وَآمَنَهُمْ مِنْ خَوْفٍ ﴿٤﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Li-îlâfi Kureyş.
Îlâfihim rıhlete'ş-şitâi ve's-sayf.
Felya'büdû rabbe hâze'l-beyt.
Ellezî et'amehüm min cû'in ve âmenehüm min havf.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Kureyş'in güven ve uzlaşmasını sağladığı için;
Kış ve yaz seferlerinde onları uzlaştırıp faydalandırdığı için;
Şu Beyt'in (Kâbe'nin) Rabbine kulluk etsinler.
O ki, onları açlıktan doyurmuş ve her türlü korkudan emin kılmıştır.`,
  },
  {
    id: "maun",
    title: "Mâûn Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 107,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "أَرَأَيْتَ الَّذِي يُكَذِّبُ بِالدِّينِ ﴿١﴾ فَذَٰلِكَ الَّذِي يَدُعُّ الْيَتِيمَ ﴿٢﴾ وَلَا يَحُضُّ عَلَىٰ طَعَامِ الْمِسْكِينِ ﴿٣﴾ فَوَيْلٌ لِلْمُصَلِّينَ ﴿٤﴾ الَّذِينَ هُمْ عَنْ صَلَاتِهِمْ سَاهُونَ ﴿٥﴾ الَّذِينَ هُمْ يُرَاءُونَ ﴿٦﴾ وَيَمْنَعُونَ الْمَاعُونَ ﴿٧﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Era'eytellezî yükezzibü bi'd-dîn.
Fe-zâlikellezî yedu'ul-yetîm.
Ve lâ yehuddu alâ ta'âmi'l-miskîn.
Fe-veylün li'l-musallîn.
Ellezîne hüm an salâtihim sâhûn.
Ellezîne hüm yürâûn.
Ve yemne'ûne'l-mâ'ûn.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Dini (hesap gününü) yalanlayanı gördün mü?
İşte o, yetimi itip kakar.
Yoksulu doyurmayı teşvik etmez.
Yazıklar olsun o namaz kılanlara ki;
Onlar namazlarını ciddiye almazlar (gaflet içindedirler).
Onlar gösteriş yaparlar,
Ve en ufak bir yardıma dahi engel olurlar.`,
  },
  {
    id: "kevser",
    title: "Kevser Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 108,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ ﴿١﴾ فَصَلِّ لِرَبِّكَ وَانْحَرْ ﴿٢﴾ إِنَّ شَانِئَكَ هُوَ الْأَبْتَرُ ﴿٣﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
İnnâ a'taynâke'l-kevser.
Fe-salli li-rabbike venhar.
İnne şânieke hüve'l-ebter.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Şüphesiz Biz sana Kevser'i (bitmez tükenmez hayır ve bereketi) verdik.
Öyleyse Rabbin için namaz kıl ve kurban kes!
Asıl soyu kesik olan, şüphesiz sana kin besleyendir.`,
  },
  {
    id: "kafirun",
    title: "Kâfirûn Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 109,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "قُلْ يَا أَيُّهَا الْكَافِرُونَ ﴿١﴾ لَا أَعْبُدُ مَا تَعْبُدُونَ ﴿٢﴾ وَلَا أَنْتُمْ عَابِدُونَ مَا أَعْبُدُ ﴿٣﴾ وَلَا أَنَا عَابِدٌ مَا عَبَدْتُمْ ﴿٤﴾ وَلَا أَنْتُمْ عَابِدُونَ مَا أَعْبُدُ ﴿٥﴾ لَكُمْ دِينُكُمْ وَلِيَ دِينِ ﴿٦﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Kul yâ eyyühe'l-kâfirûn.
Lâ a'büdü mâ ta'büdûn.
Ve lâ entüm âbidûne mâ a'büd.
Ve lâ ene âbidüm mâ abedtüm.
Ve lâ entüm âbidûne mâ a'büd.
Leküm dînüküm ve liye dîn.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
De ki: Ey inkârcılar!
Ben sizin taptıklarınıza tapmam.
Siz de benim taptığıma tapıcılar değilsiniz.
Ben asla sizin taptıklarınıza tapacak değilim.
Siz de benim taptığıma tapacak değilsiniz.
Sizin dininiz size, benim dinim banadır.`,
  },
  {
    id: "nasr",
    title: "Nasr Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 110,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ ﴿١﴾ وَرَأَيْتَ النَّاسَ يَدْخُلُونَ فِي دِينِ اللَّهِ أَفْوَاجًا ﴿٢﴾ فَسَبِّحْ بِحَمْدِ رَبِّكَ وَاسْتَغْفِرْهُ ۚ إِنَّهُ كَانَ تَوَّابًا ﴿٣﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
İzâ câe nasrullâhi ve'l-feth.
Ve ra'eyte'n-nâse yedhulûne fî dînillâhi efvâcâ.
Fe-sebbih bi-hamdi rabbike vestağfirh.
İnnehû kâne tevvâbâ.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Allah'ın yardımı ve zafer geldiği zaman,
Ve insanların akın akın Allah'ın dinine girdiklerini gördüğün zaman;
Rabbini hamd ile tesbih et ve O'ndan bağışlanma dile!
Çünkü O, tövbeleri çokça kabul edendir.`,
  },
  {
    id: "tebbet",
    title: "Tebbet Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 111,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "تَبَّتْ يَدَا أَبِي لَهَبٍ وَتَبَّ ﴿١﴾ مَا أَغْنَىٰ عَنْهُ مَالُهُ وَمَا كَسَبَ ﴿٢﴾ سَيَصْلَىٰ نَارًا ذَاتَ لَهَبٍ ﴿٣﴾ وَامْرَأَتُهُ حَمَّالَةَ الْحَطَبِ ﴿٤﴾ فِي جِيدِهَا حَبْلٌ مِنْ مَسَدٍ ﴿٥﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Tebbet yedâ ebî lehebin ve tebb.
Mâ eğnâ anhü mâlühû ve mâ keseb.
Seyaslâ nâran zâte leheb.
Vemraetühû hammâlete'l-hatab.
Fî cîdihâ hablüm min mesed.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Ebû Leheb'in iki eli kurusun; kurudu da!
Ona ne malı fayda verdi, ne de kazandığı.
O, alevli bir ateşe girecektir.
Boynunda bükülmüş bir urganla odun taşıyıcı olarak karısı da!`,
  },
  {
    id: "ihlas",
    title: "İhlâs Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 112,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾ اللَّهُ الصَّمَدُ ﴿٢﴾ لَمْ يَلِدْ وَلَمْ يُولَدْ ﴿٣﴾ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ ﴿٤﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Kul hüvallâhü ehad.
Allâhü's-samed.
Lem yelid ve lem yûled.
Ve lem yekün lehû küfüven ehad.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
De ki: O Allah tektir.
Allah Samed'dir (her şey O'na muhtaçtır, O hiçbir şeye muhtaç değildir).
O, doğurmamış ve doğmamıştır.
Hiçbir şey O'na denk ve benzer değildir.`,
  },
  {
    id: "felak",
    title: "Felak Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 113,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ﴿١﴾ مِنْ شَرِّ مَا خَلَقَ ﴿٢﴾ وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ ﴿٣﴾ وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ﴿٤﴾ وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ ﴿٥﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Kul e'ûzü bi-rabbi'l-felak.
Min şerri mâ halak.
Ve min şerri gâsikın izâ vekab.
Ve min şerri'n-neffâsâti fi'l-ukad.
Ve min şerri hâsidin izâ hased.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
De ki: Sabahın Rabbine sığınırım;
Yarattığı şeylerin şerrinden,
Karanlığı çöktüğü zaman gecenin şerrinden,
Düğümlere üfleyen büyücülerin şerrinden,
Ve haset ettiği vakit hasetçinin şerrinden!`,
  },
  {
    id: "nas",
    title: "Nâs Suresi",
    category: "surah",
    categoryLabel: "Zamm-ı Sure",
    order: 114,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunur.",
    arabic: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ﴿١﴾ مَلِكِ النَّاسِ ﴿٢﴾ إِلَٰهِ النَّاسِ ﴿٣﴾ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ﴿٤﴾ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ﴿٥﴾ مِنَ الْجِنَّةِ وَالنَّاسِ ﴿٦﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Kul e'ûzü bi-rabbi'n-nâs.
Meliki'n-nâs.
İlâhi'n-nâs.
Min şerri'l-vesvâsi'l-hannâs.
Ellezî yüvesvisü fî sudûri'n-nâs.
Mine'l-cinneti ve'n-nâs.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
De ki: İnsanların Rabbine sığınırım,
İnsanların Hükümranına (Melikine),
İnsanların İlahına;
O sinsi vesvesecinin şerrinden,
Ki o, insanların göğüslerine vesvese fısıldar;
Gerek cinlerden gerek insanlardan!`,
  },
  {
    id: "asr_surah",
    title: "Asr Suresi",
    category: "surah",
    categoryLabel: "Kısa Sure",
    order: 103,
    whenRead: "Fatiha'dan sonra zamm-ı sure olarak okunabilir.",
    arabic: "وَالْعَصْرِ ﴿١﴾ إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ ﴿٢﴾ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ ﴿٣﴾",
    turkishReading: `Bismillâhirrahmânirrahîm.
Vel-asr.
İnne'l-insâne le-fî husr.
İllellezîne âmenû ve amilü's-sâlihâti ve tevâsav bi'l-hakkı ve tevâsav bi's-sabr.`,
    turkishMeaning: `Rahmân ve Rahîm olan Allah'ın adıyla.
Zamana (asra) yemin olsun ki;
İnsan mutlaka bir hüsrandadır.
Ancak iman edip salih ameller işleyenler, birbirlerine hakkı tavsiye edenler ve sabrı tavsiye edenler müstesnadır.`,
  },
];

export const NAMAZ_DUALARI: SurahOrDua[] = [
  {
    id: "subhaneke",
    title: "Sübhaneke Duası",
    category: "dua",
    categoryLabel: "Başlangıç Duası",
    whenRead: "Her namazın ilk rekatında iftitah tekbirinden sonra okunur. Ayrıca ikindi ve yatsının ilk sünnetinde 3. rekatın başında da okunur.",
    arabic: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ ، وَتَبَارَكَ اسْمُكَ ، وَتَعَالَىٰ جَدُّكَ ، وَلَا إِلَٰهَ غَيْرُكَ",
    turkishReading: `Sübhânekellâhümme ve bi hamdik.
Ve tebârekesmük.
Ve teâlâ ceddük.
(Cenaze namazında: Ve celle senâük.)
Ve lâ ilâhe gayrük.`,
    turkishMeaning: `Allah'ım! Sen her türlü eksiklikten münezzehsin, Seni hamdinle tesbih ederim.
Senin adın mübarektir.
Senin şanın ve büyüklüğün pek yücedir.
Senden başka hiçbir ilah yoktur.`,
  },
  {
    id: "ettehiyyatu",
    title: "Ettehiyyâtü Duası",
    category: "dua",
    categoryLabel: "Oturuş Duası",
    whenRead: "Namazların hem ilk oturuşlarında hem de son oturuşlarında ilk olarak okunması vacip olan duadır.",
    arabic: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ ، السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ ، السَّلَامُ عَلَيْنَا وَعَلَىٰ عِبَادِ اللَّهِ الصَّالِحِينَ ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ",
    turkishReading: `Ettehıyyâtü lillâhi ve's-salavâtü ve't-tayyibât.
Esselâmü aleyke eyyühe'n-nebiyyü ve rahmetullâhi ve berekâtüh.
Esselâmü aleynâ ve alâ ibâdillâhi's-sâlihîn.
Eşhedü en lâ ilâhe illallâh.
Ve eşhedü enne Muhammeden abdühû ve resûlüh.`,
    turkishMeaning: `Bütün dualar, övgüler, ibadetler ve güzellikler Allah'adır.
Ey Peygamber! Selam, Allah'ın rahmeti ve bereketleri senin üzerine olsun.
Selam bizim üzerimize ve Allah'ın salih kullarının üzerine olsun.
Şahitlik ederim ki Allah'tan başka ilah yoktur.
Ve yine şahitlik ederim ki Muhammed O'nun kulu ve elçisidir.`,
  },
  {
    id: "salli",
    title: "Allâhümme Salli",
    category: "dua",
    categoryLabel: "Salavat",
    whenRead: "Son oturuşta Ettehiyyâtü'den sonra (ve ikindi/yatsı ilk sünnetinin 1. oturuşunda) okunur.",
    arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ",
    turkishReading: `Allâhümme salli alâ Muhammedin ve alâ âli Muhammed.
Kemâ salleyte alâ İbrâhîme ve alâ âli İbrâhîm.
İnneke hamîdün mecîd.`,
    turkishMeaning: `Allah'ım! Muhammed'e ve Muhammed'in aline (ailesine/ümmetine) salât eyle; İbrahim'e ve İbrahim'in aline salât eylediğin gibi. Şüphesiz Sen övülmeye layıksın, yücesin.`,
  },
  {
    id: "barik",
    title: "Allâhümme Bârik",
    category: "dua",
    categoryLabel: "Salavat",
    whenRead: "Allâhümme Salli'nin hemen ardından okunur.",
    arabic: "اللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ",
    turkishReading: `Allâhümme bârik alâ Muhammedin ve alâ âli Muhammed.
Kemâ bârakte alâ İbrâhîme ve alâ âli İbrâhîm.
İnneke hamîdün mecîd.`,
    turkishMeaning: `Allah'ım! Muhammed'e ve Muhammed'in aline bereket ihsan eyle; İbrahim'e ve İbrahim'in aline bereket ihsan eylediğin gibi. Şüphesiz Sen övülmeye layıksın, yücesin.`,
  },
  {
    id: "rabbena_atina",
    title: "Rabbenâ Âtinâ",
    category: "dua",
    categoryLabel: "Dua",
    whenRead: "Son oturuşta Salli ve Barik dualarından sonra okunur.",
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    turkishReading: `Rabbenâ âtinâ fi'd-dünyâ haseneten ve fi'l-âhirati haseneten ve kınâ azâbe'n-nâr.`,
    turkishMeaning: `Rabbimiz! Bize dünyada da iyilik ve güzellik ver, ahirette de iyilik ve güzellik ver. Bizi cehennem azabından koru!`,
  },
  {
    id: "rabbena_agfirli",
    title: "Rabbenâğfirlî",
    category: "dua",
    categoryLabel: "Dua",
    whenRead: "Rabbenâ Âtinâ'dan sonra selam vermeden önce okunur.",
    arabic: "رَبَّنَا اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ",
    turkishReading: `Rabbenagfirlî ve li-vâlideyye ve li'l-mü'minîne yevme yekûmü'l-hisâb.`,
    turkishMeaning: `Rabbimiz! Hesabın görüleceği gün beni, anamı-babamı ve bütün inananları bağışla!`,
  },
  {
    id: "kunut_1",
    title: "Kunut Duası 1",
    category: "dua",
    categoryLabel: "Vitir Duası",
    whenRead: "Yatsı namazından sonra kılınan 3 rekat Vitir namazının 3. rekatında zamm-ı sureden sonra tekbir alınıp ilk olarak okunur.",
    arabic: "اللَّهُمَّ إِنَّا نَسْتَعِينُكَ وَنَسْتَغْفِرُكَ وَنَسْتَهْدِيكَ وَنُؤْمِنُ بِكَ وَنَتُوبُ إِلَيْكَ وَنَتَوَكَّلُ عَلَيْكَ وَنُثْنِي عَلَيْكَ الْخَيْرَ كُلَّهُ نَشْكُرُكَ وَلَا نَكْفُرُكَ وَنَخْلَعُ وَنَتْرُكُ مَنْ يَفْجُرُكَ",
    turkishReading: `Allâhümme innâ neste'înüke ve nestağfiruke ve nestehdîk.
Ve nü'minü bike ve netûbü ileyk.
Ve netevekkelü aleyk.
Ve nüsnî aleyke'l-hayra küllehû neşkürük.
Ve lâ nekfürük.
Ve nahle'u ve netrükü men yefcürük.`,
    turkishMeaning: `Allah'ım! Biz Senden yardım dileriz, günahlarımızı bağışlamanı isteriz ve bize hidayet vermeni dileriz.
Sana inanırız, Sana tövbe ederiz ve yalnız Sana güveniriz.
Bütün hayırlarla Seni överiz, Sana şükrederiz ve nankörlük etmeyiz.
Sana isyan edenleri terk eder ve onlarla bağımızı koparırız.`,
  },
  {
    id: "kunut_2",
    title: "Kunut Duası 2",
    category: "dua",
    categoryLabel: "Vitir Duası",
    whenRead: "Kunut 1 duasının hemen ardından rükûya gitmeden önce okunur.",
    arabic: "اللَّهُمَّ إِيَّاكَ نَعْبُدُ وَلَكَ نُصَلِّي وَنَسْجُدُ وَإِلَيْكَ نَسْعَىٰ وَنَحْفِدُ نَرْجُو رَحْمَتَكَ وَنَخْشَىٰ عَذَابَكَ إِنَّ عَذَابَكَ بِالْكَافِرِينَ مُلْحَقٌ",
    turkishReading: `Allâhümme iyyâke na'büdü ve leke nüsallî ve nescüd.
Ve ileyke nes'â ve nahfid.
Nercû rahmeteke ve nahşâ azâbek.
İnne azâbeke bi'l-kâfirîne mülhık.`,
    turkishMeaning: `Allah'ım! Biz yalnız Sana kulluk ederiz; Senin rızan için namaz kılar ve secde ederiz.
Yalnız Sana yönelir ve Sana koştururuz.
Rahmetini umar, azabından korkarız.
Şüphesiz Senin azabın kâfirlere mutlaka erişecektir.`,
  },
];
