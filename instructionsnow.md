Rename "Vault" to use i18n strings throughout the app.

In ko.js, update:
  vault_btn: "복기"
  vault_label: "복기"
  vault_see_all: "전체보기 →"
  vault_empty: "저장된 항목이 없습니다"
  vault_title: "복기"  (overlay/page title)

In en.js (if exists), keep as "Vault".

Then find every hardcoded "Vault" string in the UI and replace
with the i18n key. Do not change variable names, function names,
localStorage keys, or any code logic — only visible UI text.