// Vercel Edge Function — opening_comments CRUD (오프닝별 커뮤니티).
// vault/saved와 달리 read는 공개(opening_key로만 필터) — user_id 격리 안 함.
// insert/delete는 user_id spoofing 가드(요청자 == 데이터). 사칭은 클라이언트 닉네임 입력 자유라
// 자연 가능 — 현 phase 정책상 허용. rate limit은 추후 phase.

import { normalizePlatform } from './_platform.js';
import { jsonResponse, methodGuard, supabaseHeaders } from './_http.js';

export const config = {
    runtime: 'edge',
    regions: ['icn1'],
};

const TABLE = 'opening_comments';
const MAX_BODY = 500;
const MAX_KEY_LEN = 64;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
        const { action, opening_key, id } = body || {};
        const user_id = body?.user_id ? String(body.user_id).toLowerCase() : null;
        const platform = normalizePlatform(body?.platform);

        if (action === 'list') {
            // opening_key 단일 (eq) 또는 opening_keys 배열 (in.(...)) 둘 다 지원.
            // sub-variants 합집합 조회용 — 시실리안 root 화면이 sicilian + sicilian-rossolimo/kan/najdorf 모두 보여줘야 해서.
            const keysRaw = Array.isArray(body?.opening_keys) ? body.opening_keys : (opening_key ? [opening_key] : []);
            const keys = keysRaw.filter(k => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_LEN);
            if (keys.length === 0) return jsonResponse({ error: 'opening_key(s) required' }, 400);
            const rawLimit = parseInt(body?.limit, 10);
            const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), MAX_LIMIT);
            const filter = keys.length === 1
                ? `opening_key=eq.${encodeURIComponent(keys[0])}`
                // PostgREST in.(...)는 괄호 안 콤마 구분 + 각 값 URL-encode. 콤마/괄호가 키에 들어가면 깨질 수 있으나
                // MAX_KEY_LEN 가드 + 슬러그 매핑에서만 사용이라 ASCII alnum-dash로 한정.
                : `opening_key=in.(${keys.map(k => encodeURIComponent(k)).join(',')})`;
            const url = `${supabaseUrl}/rest/v1/${TABLE}?${filter}&order=created_at.desc&limit=${limit}`;
            const res = await fetch(url, { headers: { ...sbHeaders, 'Accept': 'application/json' } });
            const data = await res.json();
            return jsonResponse(data, res.status);
        }

        if (action === 'post') {
            if (!user_id) return jsonResponse({ error: 'user_id required' }, 400);
            if (!opening_key || typeof opening_key !== 'string' || opening_key.length > MAX_KEY_LEN) {
                return jsonResponse({ error: 'opening_key invalid' }, 400);
            }
            const cleaned = typeof body?.body === 'string' ? body.body.trim() : '';
            if (!cleaned || cleaned.length > MAX_BODY) {
                return jsonResponse({ error: `body must be 1-${MAX_BODY} chars` }, 400);
            }
            const row = { opening_key, user_id, platform, body: cleaned };
            const url = `${supabaseUrl}/rest/v1/${TABLE}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { ...sbHeaders, 'Prefer': 'return=representation' },
                body: JSON.stringify(row),
            });
            if (!res.ok) return jsonResponse({ error: 'insert failed' }, res.status);
            const created = await res.json();
            return jsonResponse(Array.isArray(created) ? created[0] : created, 200);
        }

        if (action === 'delete') {
            // user_id + platform 매치 필수 — UUID만 알아도 타 유저 행 삭제 불가.
            if (!id || !user_id) return jsonResponse({ error: 'id and user_id required' }, 400);
            const url = `${supabaseUrl}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user_id)}&platform=eq.${encodeURIComponent(platform)}`;
            const res = await fetch(url, { method: 'DELETE', headers: sbHeaders });
            return jsonResponse({ ok: res.ok }, res.ok ? 200 : res.status);
        }

        return jsonResponse({ error: 'Unknown action' }, 400);
    } catch (e) {
        console.error('Forum API Error:', e);
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}
