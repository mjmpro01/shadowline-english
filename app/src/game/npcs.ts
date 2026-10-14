import type { Bilingual } from './api'

/**
 * What the people on the farm say when the story has nothing for them: one
 * short line each, in easy English, with its translation to tap for. The story
 * itself — what each of them asks for — comes from the server with the quest.
 */
export const IDLE_LINES: Record<string, Bilingual[]> = {
  sir_shadow: [
    { en: 'A good farmer is a patient farmer.', vi: 'Người nông dân giỏi là người kiên nhẫn.' },
    { en: 'Say your new words out loud. It helps!', vi: 'Hãy đọc to những từ mới. Có ích lắm đấy!' },
    { en: 'Rest when you are tired.', vi: 'Hãy nghỉ khi cậu thấy mệt.' },
  ],
  mira: [
    { en: 'Fresh seeds, every day!', vi: 'Hạt giống tươi mỗi ngày!' },
    { en: 'What would you like today?', vi: 'Hôm nay cậu muốn mua gì nào?' },
  ],
  bram: [
    { en: 'More land means more words.', vi: 'Nhiều đất hơn là nhiều từ hơn.' },
    { en: 'Good soil grows things fast.', vi: 'Đất tốt thì cây lớn nhanh.' },
  ],
}

/** A line for today, so the same person does not say the same thing every time. */
export function idleLine(npc: string, day = new Date().getDate()): Bilingual {
  const lines = IDLE_LINES[npc] ?? IDLE_LINES.sir_shadow
  return lines[day % lines.length]
}
