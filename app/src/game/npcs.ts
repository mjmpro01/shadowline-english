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
  // Echo Town: a greeting, before the day's chat.
  elsa: [
    { en: 'Echo Town is glad to have you.', vi: 'Thị trấn Echo rất vui có cậu ở đây.' },
    { en: 'A kind word costs nothing.', vi: 'Một lời tử tế chẳng tốn gì cả.' },
  ],
  orin: [
    { en: 'Every word has its own music.', vi: 'Mỗi từ đều có giai điệu riêng.' },
    { en: 'Listen first. Then speak.', vi: 'Hãy nghe trước. Rồi hẵng nói.' },
  ],
  lina: [
    { en: 'A book a week keeps the Silence away.', vi: 'Mỗi tuần một cuốn sách, Màn Im Lặng sẽ tránh xa.' },
    { en: 'Quiet, please. Readers at work.', vi: 'Xin giữ yên lặng. Mọi người đang đọc sách.' },
  ],
  hugo: [
    { en: 'Coffee is ready!', vi: 'Cà phê xong rồi đây!' },
    { en: 'Sit down, sit down. Tell me your news.', vi: 'Ngồi đi, ngồi đi. Kể tôi nghe chuyện của cậu.' },
  ],
  vy: [
    { en: 'Drink water, sleep well, and smile.', vi: 'Uống nước, ngủ ngon, và mỉm cười nhé.' },
    { en: 'Are you looking after yourself?', vi: 'Cậu có chăm sóc bản thân không đấy?' },
  ],
}

/** A line for today, so the same person does not say the same thing every time. */
export function idleLine(npc: string, day = new Date().getDate()): Bilingual {
  const lines = IDLE_LINES[npc] ?? IDLE_LINES.sir_shadow
  return lines[day % lines.length]
}
