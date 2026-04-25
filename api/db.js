// Vercel Edge Function — Supabase CRUD proxy for vault_items and saved_games
export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const corsHeaders = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const sbHeaders = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
    };

    try {
        const body = await req.json();
        const { action, table, data, id } = body || {};
        // chess.com 닉네임은 대소문자 구분 X. 서버에서도 lowercase로 정규화해 구버전 클라이언트 호환.
        const user_id = body?.user_id ? String(body.user_id).toLowerCase() : null;
        const normalizedData = data && data.user_id
            ? { ...data, user_id: String(data.user_id).toLowerCase() }
            : data;

        if (!table || !['vault_items', 'saved_games'].includes(table)) {
            return new Response(JSON.stringify({ error: 'Invalid table' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'select') {
            if (!user_id) {
                return new Response(JSON.stringify([]), {
                    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const url = `${supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(user_id)}&order=created_at.desc`;
            const res = await fetch(url, { headers: { ...sbHeaders, 'Accept': 'application/json' } });
            const result = await res.json();
            return new Response(JSON.stringify(result), {
                status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'insert') {
            // 요청자의 user_id와 데이터의 user_id가 일치해야 함.
            // 피해자 이름으로 데이터 생성(user_id spoofing)을 서버에서 차단.
            if (!user_id || !normalizedData || normalizedData.user_id !== user_id) {
                return new Response(JSON.stringify({ error: 'user_id mismatch or missing' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const url = `${supabaseUrl}/rest/v1/${table}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
                body: JSON.stringify(normalizedData)
            });
            return new Response(JSON.stringify({ ok: res.ok }), {
                status: res.ok ? 200 : res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'delete') {
            // user_id를 쿼리에 강제 포함 — UUID만 알아도 타 유저 행 삭제 불가.
            if (!id || !user_id) {
                return new Response(JSON.stringify({ error: 'id and user_id required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user_id)}`;
            const res = await fetch(url, { method: 'DELETE', headers: sbHeaders });
            return new Response(JSON.stringify({ ok: res.ok }), {
                status: res.ok ? 200 : res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Unknown action' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error('DB API Error:', e);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
