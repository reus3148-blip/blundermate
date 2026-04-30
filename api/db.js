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
        const { action, table, data, id, filter } = body || {};
        // chess.com 닉네임은 대소문자 구분 X. 서버에서도 lowercase로 정규화해 구버전 클라이언트 호환.
        const user_id = body?.user_id ? String(body.user_id).toLowerCase() : null;
        const normalizedData = data && data.user_id
            ? { ...data, user_id: String(data.user_id).toLowerCase() }
            : data;

        if (!table || !['vault_items', 'saved_games', 'analyzed_games'].includes(table)) {
            return new Response(JSON.stringify({ error: 'Invalid table' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 허용 컬럼: 임의 컬럼 필터로 SQL 분리 위험을 차단. analyzed_games는 pgn_hash/id로만 조회 가능.
        const FILTER_ALLOWLIST = {
            vault_items: ['source'],
            saved_games: [],
            analyzed_games: ['pgn_hash', 'id'],
        };

        if (action === 'select') {
            if (!user_id) {
                return new Response(JSON.stringify([]), {
                    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            let query = `user_id=eq.${encodeURIComponent(user_id)}`;
            if (filter && typeof filter === 'object') {
                const allowed = FILTER_ALLOWLIST[table] || [];
                for (const [col, val] of Object.entries(filter)) {
                    if (!allowed.includes(col)) continue;
                    if (val == null) continue;
                    query += `&${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`;
                }
            }
            const url = `${supabaseUrl}/rest/v1/${table}?${query}&order=created_at.desc`;
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

        if (action === 'update') {
            // analyzed_games 캐시 PATCH 전용. (user_id, pgn_hash) 조합으로 행 식별.
            // 화이트리스트로 캐시 컬럼만 갱신 — pgn/headers_json/id 등 다른 컬럼은 클라이언트에서 변경 불가.
            // 호출자가 행 존재를 보장(collectAutoBlunders가 먼저 INSERT 완료)해야 의미 있는 작업.
            if (table !== 'analyzed_games') {
                return new Response(JSON.stringify({ error: 'update only supported on analyzed_games' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const pgnHash = filter?.pgn_hash;
            if (!user_id || !pgnHash || !data) {
                return new Response(JSON.stringify({ error: 'user_id, filter.pgn_hash and data required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const ALLOWED_UPDATE_COLS = ['analysis_json', 'analysis_depth', 'analysis_version'];
            const patch = {};
            for (const [col, val] of Object.entries(data)) {
                if (ALLOWED_UPDATE_COLS.includes(col)) patch[col] = val;
            }
            if (Object.keys(patch).length === 0) {
                return new Response(JSON.stringify({ error: 'no allowed columns to update' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const url = `${supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(user_id)}&pgn_hash=eq.${encodeURIComponent(pgnHash)}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
                body: JSON.stringify(patch),
            });
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
