import type { Messages } from './en'

/**
 * Vietnamese.
 *
 * Typed as `Messages`, so a key that is missing, misspelled, or takes different
 * arguments from the English is a compile error rather than an English sentence
 * appearing in the middle of a Vietnamese screen.
 *
 * Two things are deliberately left in English. "Shadowing" is the name of the
 * technique and the word a learner will meet in every other source about it, so
 * translating it would teach them a term nobody else uses. And the four metric
 * names keep their English alongside the Vietnamese, because they are what the
 * analysis chart is labelled with in the literature.
 *
 * Vietnamese marks no plural, so every counting sentence here is one form where
 * the English needs two.
 */
export const vi: Messages = {
  // --- navigation and shell -------------------------------------------------

  // --- login ----------------------------------------------------------------

  // --- dashboard ------------------------------------------------------------

  // --- library --------------------------------------------------------------

  'library.noSeries': 'Chưa có series nào. Quản trị viên đăng clip từ xưởng cắt.',
  'library.takesThisWeek': (n: number) => `${n} bản ghi tuần này`,
  'library.seriesCounts': (episodes: number, clips: number) =>
    `${episodes} tập · ${clips} clip`,

  // --- a series --------------------------------------------------------------
  'series.noEpisodes': 'Series này chưa có gì được đăng.',
  'series.episodeCounts': (clips: number, seconds: string) => `${clips} clip · ${seconds}`,

  // --- an episode ------------------------------------------------------------

  // --- playlist -------------------------------------------------------------

  // --- practice -------------------------------------------------------------

  // --- scores ---------------------------------------------------------------

  // --- analysis -------------------------------------------------------------

  // --- dub ------------------------------------------------------------------

  // --- vocabulary -----------------------------------------------------------

  // --- flashcards -----------------------------------------------------------

  // --- progress -------------------------------------------------------------

  // --- profile --------------------------------------------------------------

  // --- studio ---------------------------------------------------------------
  'studio.clipsTitle': 'Clip',
  'studio.clipsFound': (n: number) => `${n} clip trong thư viện`,
  'studio.tabSeriesTitle': 'Bộ phim',
  'studio.seriesCount': (n: number) => `${n} bộ`,
  'studio.title': 'Xưởng cắt clip',
  'studio.subtitle':
    'Cắt một bản ghi thành từng câu cho thư viện. Người học luyện những clip này; họ không tự thêm được.',
  'studio.hotOn': 'Đang nổi bật',
  'studio.hotOff': 'Đánh dấu nổi bật',
  'studio.episodes': (n: number) => `${n} tập`,
  'studio.seriesName': 'Tên series',
  'studio.seriesAbout': 'Giới thiệu series',
  'studio.episodeName': 'Tên tập',
  'studio.order': 'Thứ tự',
  'studio.inSeries': 'Thuộc series',
  'studio.findClip': 'Tìm clip theo tên, câu thoại, playlist hoặc thẻ',
  'studio.findClipLabel': 'Tìm clip',
  'studio.noMatch': 'Không có clip nào trong thư viện khớp.',
  'studio.clipName': 'Tên',
  'studio.categories': 'Thẻ',
  'studio.line': 'Câu thoại',
  'studio.deleteClip': 'Xoá clip',
  'studio.deleteClipTitle': 'Xoá clip này?',
  'studio.deleteClipBody': (title: string) =>
    `“${title}”, phần âm thanh của nó và mọi bản thu người học đã ghi cho nó đều mất hẳn.`,
  'studio.previousPage': 'Trước',
  'studio.nextPage': 'Sau',
  'studio.showing': (from: number, to: number, total: number) => `${from}–${to} / ${total}`,
  'studio.upload': 'Tải lên audio hoặc video',
  'studio.youtube': 'Dán đường dẫn YouTube',
  'studio.youtubeSoon': 'Chưa dùng được — tải tệp lên thay nhé',
  'studio.stepsKicker': 'Tiếp theo sẽ thế nào',
  'studio.step1Title': 'Tải một bản ghi lên.',
  'studio.step1': 'Dài một tiếng cũng được — nó được cắt thành từng câu, không luyện cả bài.',
  'studio.step2Title': 'Phần lời tự viết ra.',
  'studio.step2':
    'Whisper chép lại ở nền và tự điền từng câu, kèm phiên âm. Bạn cứ cắt tiếp trong lúc đó.',
  'studio.step3Title': 'Chỉnh lại ranh giới.',
  'studio.step3':
    'Mỗi clip được đề xuất từ những khoảng lặng; kéo, tách, hoặc bỏ chọn clip bạn không muốn.',
  'studio.step4Title': 'Đăng.',
  'studio.step4': 'Clip đã chọn vào thư viện, và video của chúng được cắt ở nền.',
  'studio.stepsFooter':
    'Người học luyện những gì được đăng ở đây. Họ không tự thêm clip được.',
  'studio.playlist': 'Playlist',
  'studio.playlistHint': 'Tên bài học hoặc tập',
  'studio.batchCategories': 'Thể loại cho cả đợt',
  'studio.batchCategoriesHint': 'phỏng vấn, hội thoại hằng ngày',
  'studio.applyToAll': 'Áp dụng cho mọi clip',
  'studio.listening': 'Đang nghe ra từng chữ…',
  'studio.transcribing':
    'Đang chép lời — các câu sẽ tự điền khi xong. Bạn cứ cắt tiếp trong lúc đó.',
  'studio.published': 'Đã đăng',
  'studio.publishedBody': (n: number) => `${n} clip đã vào thư viện.`,
  'studio.publishedSilent': (n: number) =>
    `${n} clip trong số đó lên mà chưa có tiếng. Bài thu vào những clip này vẫn được giữ và đo, nhưng không chấm điểm — publish lại lô này để đưa tiếng lên.`,
  'studio.publishFailed': 'Publish đã dừng',
  'studio.publishFailedKept':
    'Bản cắt vẫn còn nguyên như lúc bạn để lại. Không có gì bị bỏ đi — xem lỗi rồi thử lại.',
  'studio.savingClips': (done: number, total: number) => `Đang lưu clip… ${done}/${total}`,
  'studio.savingAudio': (done: number, total: number) => `Đang gửi tiếng… ${done}/${total}`,
  'studio.noClips': 'Chưa có clip nào — cắt một bản ghi trước đã.',




  'studio.decoding': 'Đang giải mã…',
  'studio.saving': 'Đang lưu…',
  'studio.featured': 'Đang nổi bật',
  'studio.feature': 'Cho nổi bật',
  'studio.noTranscript': 'Không chép lời được, nên phần câu thoại bạn tự gõ nhé.',
  'studio.nameOptional': 'Tên (không bắt buộc)',
  'studio.namedWhenPublished': 'Đặt tên khi đăng',


  // --- shared ---------------------------------------------------------------
  'common.cancel': 'Huỷ',
  'common.delete': 'Xoá',
  'studio.deleteEpisode': 'Xoá tập',
  'studio.deleteEpisodeTitle': 'Xoá tập này?',
  'studio.deleteEpisodeBody': (title: string, clips: number) =>
    `“${title}”, ${clips} clip trong đó và bản ghi gốc đều mất hẳn, cùng mọi bản thu mà người học đã ghi cho chúng.`,
  'studio.deleteSeries': 'Xoá series',
  'studio.deleteSeriesTitle': 'Xoá series này?',
  'studio.deleteSeriesBody': (title: string) =>
    `“${title}” đang rỗng, nên chỉ mất cái tên.`,
  'studio.deleteSeriesBlocked': 'Xoá các tập trước đã — series còn clip thì không bị xoá nhầm.',
  'common.loading': 'Đang tải…',
}
