// Vercel Edge Function — Supabase CRUD proxy for vault_items and saved_games
import { normalizePlatform } from './_platform.js';
import { jsonResponse, methodGuard, supabaseHeaders } from './_http.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const rejection = methodGuard(req);
    if (rejection) return rejection;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return jsonResponse({ error: 'Supabase not configured' }, 500);
    }

    const sbHeaders = supabaseHeaders(supabaseKey);

    try {
        const body = await req.json();
        const { action, table, data, id, filter } = body || {};
        // chess.com 닉네임은 대소문자 구분 X. 서버에서도 lowercase로 정규화해 구버전 클라이언트 호환.
        const user_id = body?.user_id ? String(body.user_id).toLowerCase() : null;
        const platform = normalizePlatform(body?.platform);
        const normalizedData = data
            ? {
                ...data,
                ...(data.user_id ? { user_id: String(data.user_id).toLowerCase() } : {}),
                // 클라이언트가 데이터에 platform을 넣지 않거나 다른 값을 넣어도 서버가 강제 정규화 — spoofing 차단.
                platform,
            }
            : data;

        if (!table || !['vault_items', 'saved_games', 'analyzed_games'].includes(table)) {
            return jsonResponse({ error: 'Invalid table' }, 400);
        }

        // 허용 컬럼: 임의 컬럼 필터로 SQL 분리 위험을 차단. analyzed_games는 pgn_hash/id로만 조회 가능.
        const FILTER_ALLOWLIST = {
            vault_items: ['source'],
            saved_games: [],
            analyzed_games: ['pgn_hash', 'id'],
        };

        if (action === 'select') {
            if (!user_id) {
                return jsonResponse([]);
            }
            let query = `user_id=eq.${encodeURIComponent(user_id)}&platform=eq.${encodeURIComponent(platform)}`;
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
            return jsonResponse(result, res.status);
        }

        if (action === 'insert') {
            // 요청자의 user_id와 데이터의 user_id가 일치해야 함.
            // 피해자 이름으로 데이터 생성(user_id spoofing)을 서버에서 차단.
            // platform은 normalizedData 단계에서 강제 동기화되므로 추가 검증 불필요.
            if (!user_id || !normalizedData || normalizedData.user_id !== user_id) {
                return jsonResponse({ error: 'user_id mismatch or missing' }, 400);
            }
            const url = `${supabaseUrl}/rest/v1/${table}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
                body: JSON.stringify(normalizedData)
            });
            return jsonResponse({ ok: res.ok }, res.ok ? 200 : res.status);
        }

        if (action === 'delete') {
            // user_id를 쿼리에 강제 포함 — UUID만 알아도 타 유저 행 삭제 불가.
            if (!id || !user_id) {
                return jsonResponse({ error: 'id and user_id required' }, 400);
            }
            const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user_id)}&platform=eq.${encodeURIComponent(platform)}`;
            const res = await fetch(url, { method: 'DELETE', headers: sbHeaders });
            return jsonResponse({ ok: res.ok }, res.ok ? 200 : res.status);
        }

        if (action === 'update') {
            // 테이블별로 화이트리스트된 컬럼만 갱신 — 임의 컬럼(예: id, user_id, platform) 변경 차단.
            // 행 식별 필터도 테이블별 화이트리스트 — analyzed_games는 (user_id, pgn_hash), saved_games는 id.
            const UPDATE_SCHEMA = {
                analyzed_games: {
                    cols: ['analysis_json', 'analysis_depth', 'analysis_version'],
                    filterCol: 'pgn_hash',
                },
                saved_games: {
                    cols: ['title', 'notes', 'category'],
                    filterCol: 'id',
                },
            };
            const schema = UPDATE_SCHEMA[table];
            if (!schema) {
                return jsonResponse({ error: 'update not supported on this table' }, 400);
            }
            const filterVal = filter?.[schema.filterCol];
            if (!user_id || !filterVal || !data) {
                return jsonResponse({ error: `user_id, filter.${schema.filterCol} and data required` }, 400);
            }
            const patch = {};
            for (const [col, val] of Object.entries(data)) {
                if (schema.cols.includes(col)) patch[col] = val;
            }
            if (Object.keys(patch).length === 0) {
                return jsonResponse({ error: 'no allowed columns to update' }, 400);
            }
            const url = `${supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(user_id)}&platform=eq.${encodeURIComponent(platform)}&${schema.filterCol}=eq.${encodeURIComponent(filterVal)}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
                body: JSON.stringify(patch),
            });
            return jsonResponse({ ok: res.ok }, res.ok ? 200 : res.status);
        }

        return jsonResponse({ error: 'Unknown action' }, 400);

    } catch (e) {
        console.error('DB API Error:', e);
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}
