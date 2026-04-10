// Vercel Serverless Function for Gemini AI (Zero Dependencies)
export default async function handler(req, res) {
    // 로컬 개발 환경(Live Server 등) 및 크로스 도메인 테스트를 위한 CORS 허용 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 브라우저의 CORS 사전 요청(Preflight) 예외 처리
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 오직 POST 요청만 허용합니다.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Vercel 환경 변수(또는 로컬 .env)에서 API 키를 가져옵니다.
    // 윈도우 환경의 보이지 않는 줄바꿈/공백 문자로 인한 404 URL 에러 방지 (.trim() 추가)
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return res.status(500).json({ error: "API key is not configured on the server." });
    }

    // 프론트엔드에서 보낸 체스 국면 데이터를 파싱합니다.
    const { fen, playedMove, bestMove, classification, isUserWhite } = req.body || {};
    if (!fen || !playedMove) {
        return res.status(400).json({ error: "Missing required chess data (fen, playedMove)." });
    }

    // Gemini에게 보낼 프롬프트 작성 (추후 입맛에 맞게 수정 가능)
    const prompt = `
당신은 친절한 체스 코치입니다. 다음 딱 '한 개의 수'에 대해서만 분석해 주세요.
- 체스판 상태(FEN): ${fen}
- 분석할 수: ${playedMove}

이 수가 왜 [${classification || '이런 평가'}]를 받았는지 초보자가 이해하기 쉽게 한국어로 1~2문장으로만 아주 짧게 설명해 주세요. 다른 대안이나 최선의 수와 비교하지 마세요.
`;

    try {
        // 잦은 요청으로 인한 무료 할당량(Quota) 초과(429)를 방지하기 위해, 무료 한도가 넉넉한 gemini-pro 모델로 고정합니다.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Google API Error (${response.status}): ${errorData}`);
        }

        const data = await response.json();
        const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't analyze this move properly.";

        return res.status(200).json({ explanation });
    } catch (error) {
        console.error("Gemini Fetch Error:", error);
        return res.status(500).json({ error: error.message || "Failed to communicate with AI coach." });
    }
}