Simplify the home screen — remove all state-based branching.

The home screen must look identical regardless of whether Vault has items or not.

Remove entirely:
- "복습할 항목이 있어요" title
- "저장된 블런더 N개" subtitle  
- Vault preview card showing recent items
- All conditional logic that changes the layout based on Vault contents

Final home screen structure (always the same):

1. Header
   - Left: logo (existing)
   - Right: settings icon (existing)

2. Hero section (padding 24px 16px 20px)
   - Title: "어떤 게임을 분석할까요?" 
   - Subtitle: "Chess.com 유저네임을 입력하세요"
   - Username input row (full width, button always visible)
   - Secondary links: "PGN 붙여넣기 · 직접 입력"
     These must ALWAYS be visible, never hidden

3. Divider

4. My library section
   - Label: "My library"
   - Two buttons side by side: [Vault] [Archive]
   - If Vault has items: show a small count badge on the Vault button only
     e.g. "Vault 3" — font-size 11px, color --ac
   - No other changes based on Vault contents

Do not change any styling. Only remove the conditional branching.