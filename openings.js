// 한국어 오프닝 이름 매핑 모듈.
// Chess.com 아마추어~중급 빈도 상위 ~30개를 하드코딩하고,
// 나머지는 ECO 범위별 한국어 계열명 + 슬러그에서 추출한 영어 세부명으로 대체한다.
// 예) 테이블에 있음: C53 → "지우오코 피아노"
//     테이블에 없음: B98 → "시실리안 Najdorf Variation" (한국어 계열 + 영어 세부)

const NAMES_KO = {
    'B01': '스칸디나비안',
    'B07': '피어츠',
    'B10': '카로칸',
    'B12': '카로칸 어드밴스',
    'B18': '카로칸 클래시컬',
    'B22': '시실리안 알라핀',
    'B23': '시실리안 클로즈드',
    'B40': '시실리안 타이마노프',
    'B90': '시실리안 나이도르프',
    'C00': '프렌치',
    'C02': '프렌치 어드밴스',
    'C11': '프렌치 클래시컬',
    'C23': '비숍스 오프닝',
    'C30': '킹스 갬빗',
    'C41': '필리도어',
    'C42': '페트로프',
    'C45': '스카치',
    'C50': '이탈리안 게임',
    'C53': '지우코 피아노',
    'C54': '지우코 피아노',
    'C60': '루이 로페즈',
    'C65': '루이 로페즈 베를린',
    'C68': '루이 로페즈 익스체인지',
    'C78': '루이 로페즈',
    'D02': '런던 시스템',
    'D10': '슬라브',
    'D20': '퀸즈 갬빗 액셉티드',
    'D30': '퀸즈 갬빗 디클라인드',
    'D37': '퀸즈 갬빗 디클라인드',
    'E00': '카탈란',
    'E20': '님조 인디언',
    'E60': '킹스 인디언',
};

// 범위 매칭. 위에서부터 첫 매치 사용 (구체적인 패턴이 앞에 오도록 정렬).
// 각 항목: [ECO 정규식, 한국어 계열명, 슬러그에서 제거할 영어 접두어]
// Chess.com 슬러그는 아포스트로피/악센트를 제거하므로 제거용 접두어도 동일하게 표기 ("Kings" 등).
const RANGES = [
    [/^A0[0-3]/, '기타 오프닝', ''],
    [/^A0[4-9]/, '레티', 'Reti Opening'],
    [/^A[1-3]/, '잉글리시', 'English Opening'],
    [/^A[4-7]/, '인디언', 'Indian'],
    [/^A[8-9]/, '더치', 'Dutch Defense'],
    [/^B00/, '킹스 폰', 'Kings Pawn'],
    [/^B01/, '스칸디나비안', 'Scandinavian Defense'],
    [/^B0[2-5]/, '알레킨', 'Alekhines Defense'],
    [/^B06/, '모던', 'Modern Defense'],
    [/^B0[7-9]/, '피르크', 'Pirc Defense'],
    [/^B1/, '카로칸', 'Caro-Kann Defense'],
    [/^B[2-9]/, '시실리안', 'Sicilian Defense'],
    [/^C[01]/, '프렌치', 'French Defense'],
    [/^C2/, '오픈 게임', 'Kings Pawn'],
    [/^C3/, '킹스 갬빗', 'Kings Gambit'],
    [/^C4/, '오픈 게임', ''],
    [/^C5/, '이탈리안', 'Italian Game'],
    [/^C[6-9]/, '루이 로페즈', 'Ruy Lopez'],
    [/^D0/, '퀸즈 폰', 'Queens Pawn'],
    [/^D[1-2]/, '퀸즈 갬빗', 'Queens Gambit'],
    [/^D[3-6]/, '퀸즈 갬빗 디클라인드', 'Queens Gambit Declined'],
    [/^D[7-9]/, '그륀펠트', 'Grunfeld Defense'],
    [/^E0/, '카탈란', 'Catalan Opening'],
    [/^E1/, '퀸즈 인디언', 'Queens Indian Defense'],
    [/^E[2-5]/, '님조 인디언', 'Nimzo-Indian Defense'],
    [/^E[6-9]/, '킹스 인디언', 'Kings Indian Defense'],
];

export function getDisplayName(eco, ecoUrl) {
    if (eco && NAMES_KO[eco]) return NAMES_KO[eco];

    const range = eco ? RANGES.find(([re]) => re.test(eco)) : null;
    const tail = extractTail(ecoUrl, range?.[2] || '');

    if (range) {
        return tail ? `${range[1]} ${tail}` : range[1];
    }
    return tail || '';
}

function extractTail(ecoUrl, enFamilyToStrip) {
    if (!ecoUrl) return '';
    const slug = ecoUrl.split('/openings/')[1] || '';
    const cleaned = slug
        .replace(/-\d+\..*$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    if (!enFamilyToStrip) return cleaned;
    return cleaned.replace(new RegExp(`^${enFamilyToStrip}\\s*:?\\s*`, 'i'), '').trim();
}
