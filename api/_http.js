// HTTP 보일러플레이트 — Vercel Edge Functions 공유.
// _ 시작 파일은 Vercel이 endpoint로 라우팅하지 않음.

// Access-Control-Allow-Credentials는 의도적으로 미설정.
// '*' Allow-Origin과 credentials:true 조합은 CORS 스펙상 invalid (브라우저 거부).
// 클라이언트는 credentials:'include' 안 씀 — 쿠키/Authorization 자동 전송 불필요.
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type'
};

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// OPTIONS preflight 처리 + POST 외 거절. 통과 → null, 그 외 → 즉시 응답할 Response.
export function methodGuard(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
    }
    return null;
}

// Supabase REST API 호출용 헤더 (anon/service 키 공통).
// extra가 먼저 spread → 호출자가 실수로 'Authorization' 등 핵심 헤더를 덮어쓰지 못함.
export function supabaseHeaders(key, extra = {}) {
    return {
        ...extra,
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
    };
}
