Update all UI text for the library/archive section using i18n strings.

In ko.js, update or add:
  archive_label: "보관함"
  archive_vault_btn: "복기"
  archive_saved_games_btn: "저장된 게임"

In en.js, update or add:
  archive_label: "Archive"
  archive_vault_btn: "Vault"
  archive_saved_games_btn: "Saved Games"

Then replace in the UI:
- "My library" → strings.archive_label
- "Vault" (home screen button) → strings.archive_vault_btn
- "Archive" (home screen button) → strings.archive_saved_games_btn

Do not change variable names, function names, localStorage keys,
or any code logic. Only visible UI text.