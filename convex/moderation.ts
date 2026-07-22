// Canonical banned-username list, enforced server-side in solutions.create
// and imported client-side by SolveModal for instant feedback.
// Usernames are at most 3 uppercase characters.
export const BANNED_USERNAMES = new Set([
  "FAG", "SEX", "DIK", "DIE", "KKK", "NIG", "FAT", "GAY", "JEW", "TIT",
  "CUM", "COK", "SHT", "STD", "ASS", "DIC", "FUC", "FUK", "FCK", "HOE",
  "VAG", "PUS", "JIZ", "NGR", "NGA", "XXX", "CNT", "KNT", "FGT", "DYK",
  "KYS", "NAZ", "HIV", "RPE", "PDO",
]);

export function isUsernameBanned(username: string): boolean {
  return BANNED_USERNAMES.has(username.toUpperCase());
}
