// Vercel Edge Function — 배포 정보 노출.
// GitHub API 호출(rate limit 60/h, 외부 의존)을 대체. Vercel이 환경변수로 주입하는
// VERCEL_GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_AUTHOR_DATE 를 그대로 반환.
//
// 로컬 vercel dev에선 env가 없을 수 있어 빈 응답. 클라이언트는 폴백으로 처리.
import { jsonResponse, methodGuard } from './_http.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const rejection = methodGuard(req, ['GET']);
    if (rejection) return rejection;

    const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
    const commitDate = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || '';
    const deployId = process.env.VERCEL_DEPLOYMENT_ID || '';

    return jsonResponse({
        sha: sha.slice(0, 7),
        commitDate,
        deployId,
    });
}
