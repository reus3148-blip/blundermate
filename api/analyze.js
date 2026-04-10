// Vercel Edge Function for Streaming Gemini AI
export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const corsHeaders = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
            status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return new Response(JSON.stringify({ error: "API key is not configured on the server." }), { 
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const body = await req.json();
    const { fen, ascii_board, playedMove, classification, evalDrop, best_move, punishment_pv, best_pv } = body || {};
    if (!fen || !playedMove) {
        return new Response(JSON.stringify({ error: "Missing required chess data (fen, playedMove)." }), { 
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const AI_CONFIG = {
        temperature: 0.3,
        maxOutputTokens: 4096,
        topP: 0.8,
        topK: 40
    };

    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ];

    const systemPrompt = `당신은 체스 초보자를 위해 다정하고 자세하게 기보를 복기해 주는 친절한 체스 선생님입니다.
제공된 보드 상태와 엔진 데이터를 바탕으로, 학생이 둔 수가 왜 [${classification}] 판정을 받았는지 3~4개의 단락으로 상세하고 친절하게 해설해 주세요.

[출력 규칙]
반드시 아래의 3가지 마크다운 제목을 사용하여 작성하세요. 불필요한 인사말은 생략합니다.

### 🔥 결정적 순간
학생이 둔 수(${playedMove})로 인해 상황이 어떻게 변했는지 부드러운 어조로 요약해 주세요. (예: "아앗, 중앙을 지키던 나이트를 움직인 건 조금 아쉬운 선택이었어요!")

### ⚠️ 선생님의 분석
학생이 어떤 전술적/전략적 착각을 했는지 구체적으로 설명해 주세요. 특히 상대방이 ${punishment_pv} 수순으로 어떻게 뼈아프게 반격할 수 있는지, 체스 초보자가 이해하기 쉬운 용어(핀, 포크, 공간, 킹의 안전 등)를 사용하여 타이르듯 자세히 설명해 주세요.

### 💡 이렇게 뒀으면 어땠을까요?
대신 엔진이 추천한 ${best_move}를 두었다면 어떤 점이 좋았을지, 이후 ${best_pv}의 흐름을 바탕으로 설명해 주세요. 

[엄격한 제약 사항]
1. 체스 기보(Nxf6 등)나 평가값 숫자(-3.5)를 그대로 나열하지 마세요. 반드시 "나이트가 전개하면서~", "킹이 위험해지면서~" 와 같이 행동으로 풀어서 설명하세요.
2. 학생이 상처받지 않도록 비난하는 어투는 절대 피하고, "다음엔 이렇게 해보세요~" 같은 격려하는 친절한 말투(~해요, ~습니다)를 사용하세요.`;

    const userPrompt = `[상황 데이터]
- 체스판 상태(FEN): ${fen}
- 시각적 보드(ASCII): \n${ascii_board}
- 학생이 둔 수: ${playedMove}
- 평가값 하락폭: ${evalDrop}
- 엔진이 예상하는 상대의 치명적 반격(PV): ${punishment_pv}
- 원래 두었어야 할 엔진 추천 수: ${best_move}
- 추천 수를 두었을 때의 긍정적 전개(PV): ${best_pv}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: AI_CONFIG,
                safetySettings: safetySettings
            }),
            signal: req.signal
        });

        if (!response.ok) {
            return new Response(`❌ Google API Error (${response.status})`, { status: 500, headers: corsHeaders });
        }

        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                const encoder = new TextEncoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        let lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.replace('data: ', '').trim();
                                if (dataStr === '[DONE]') continue;
                                if (!dataStr) continue;
                                try {
                                    const json = JSON.parse(dataStr);
                                    
                                    const finishReason = json.candidates?.[0]?.finishReason;
                                    if (finishReason && finishReason !== 'STOP') {
                                        console.warn("🚨 AI가 답변을 중단했습니다. 사유:", finishReason);
                                    }

                                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (text) {
                                        controller.enqueue(encoder.encode(text));
                                    }
                                } catch (e) {
                                }
                            }
                        }
                    }
                    controller.close();
                } catch (e) {
                    if (e.name !== 'AbortError') controller.error(e);
                } finally {
                    reader.releaseLock();
                }
            }
        });

        return new Response(stream, {
            headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
        });
    } catch (error) {
        if (error.name === 'AbortError') return new Response(null, { status: 499, headers: corsHeaders });
        console.error("Gemini Fetch Error:", error);
        return new Response(`Error: Failed to communicate with AI coach.`, { status: 500, headers: corsHeaders });
    }
}