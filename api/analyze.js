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
        maxOutputTokens: 2048,
        topP: 0.8,
        topK: 40
    };

    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ];

    const systemPrompt = `You are a concise chess coach. Analyze the move "${playedMove}" (classified: ${classification}) and respond in Korean.

Write exactly 2 sections:

### 문제점
Why this move is bad. What does the opponent gain, and how does it hurt your position? Reference the punishment line ${punishment_pv || 'opponent response'} in plain language. Max 2 sentences.

### 개선안
What ${best_move} achieves instead, based on ${best_pv || 'the engine line'}. Be specific and direct. Max 2 sentences.

Rules:
- Korean only. No greetings, no encouragement, no filler phrases.
- Tone: direct and analytical, like a chess coach reviewing a game — not a teacher talking to a child.
- Never write raw notation (Nxf6) or eval numbers (-3.5). Describe piece movements in words.
- Total response must be under 200 Korean characters.`;

    const userPrompt = `FEN: ${fen}
Board:
${ascii_board}
Played: ${playedMove} | Classification: ${classification} | Eval drop: ${evalDrop}
Best move: ${best_move} | Best line: ${best_pv}
Opponent punishment line: ${punishment_pv}`;

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