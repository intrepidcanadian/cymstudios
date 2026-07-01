export interface Video {
  id: string
  title: string
  short: string
  tag: string
  year: string
  dur: string
  code: string
}

/**
 * Featured films for the editorial reel.
 * Runtime/codes are editorial devices — not literal video lengths.
 */
export const VIDEOS: readonly Video[] = [
  { id: 'TpDAeRkc9gk', title: 'BSL Season 22 — Player Intros', short: 'Player Intros', tag: 'Broadcast', year: '2025', dur: '08:42', code: 'F01' },
  { id: 'NTiKNaKZAF8', title: '2v2 Random Starcraft — $500 Prize Pool', short: '2v2 Random Brood War', tag: 'Tournament', year: '2025', dur: '02:14:20', code: 'F02' },
  { id: 'Q82c39DQoJc', title: 'Season 3 Bombastic 2v2 — $1,000 Prize Pool', short: 'BSL 2v2 Season 3', tag: 'Tournament', year: '2025', dur: '03:02:55', code: 'F03' },
  { id: '9RJzUTqOm5M', title: 'Bombastic Qualifications — Season 3', short: 'S3 Qualifiers', tag: 'Coverage', year: '2025', dur: '01:41:10', code: 'F04' },
  { id: 's-l4dQm7-uc', title: '2023 2v2 Shield Battery Tournament', short: 'Shield Battery 2v2', tag: 'Archive', year: '2023', dur: '04:12:33', code: 'F05' },
  { id: 'B0BGMrKSYWw', title: 'BSL Starleague 22 — RO32 Week 2', short: 'Starleague 22 · RO32', tag: 'Broadcast', year: '2024', dur: '05:58:01', code: 'F06' },
  { id: '2GBAga5YZ_k', title: 'cymstudio.app — Product Demo', short: 'Product Demo', tag: 'Demo', year: '2026', dur: '01:20', code: 'F07' },
] as const
