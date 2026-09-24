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
  'uploads.title': 'Lịch sử upload',
  'uploads.count': (n: number) => `${n} bản thu đã gửi`,
  'uploads.find': 'Tìm bản thu theo tên…',
  'uploads.findLabel': 'Tìm bản thu',
  'uploads.filterLabel': 'Lọc theo trạng thái',
  'uploads.anyState': 'Mọi trạng thái',
  'uploads.noMatch': 'Không có bản thu nào khớp.',
  'uploads.none': 'Chưa upload gì cả.',
  'uploads.details': 'Chi tiết',
  'uploads.retry': 'Thử lại',
  'uploads.nothingToRetry': 'Không có việc nào bỏ dở, nên không xếp lại gì.',
  'uploads.retried': (transcribe: number, cuts: number) =>
    `Đã xếp lại: ${transcribe} lần chép lời và ${cuts} lần cắt hình.`,
  'uploads.clips': 'Clip đã publish',
  'uploads.transcript': 'Chép lời',
  'uploads.attempts': 'Số lần chép lời',
  'uploads.cutsLeft': 'Còn phải cắt',
  'uploads.cutsFailed': 'Cắt đã bỏ',
  'uploads.withoutAudio': 'Clip chưa có tiếng',
  'uploads.state.uploading': 'Đang tải lên',
  'uploads.state.upload-failed': 'Tải lên lỗi',
  'uploads.state.transcribing': 'Đang chép lời',
  'uploads.state.transcribe-failed': 'Không có lời',
  'uploads.state.ready': 'Chờ cắt',
  'uploads.state.cutting': 'Đang cắt hình',
  'uploads.state.cut-failed': 'Có clip cắt lỗi',
  'uploads.state.done': 'Xong',
  'uploads.transcript.none': 'Chưa bắt đầu',
  'uploads.transcript.pending': 'Đang tới',
  'uploads.transcript.ready': 'Đã có',
  'uploads.transcript.failed': 'Đã bỏ',
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
  'nav.cut': 'Cắt bản thu',
  'nav.uploads': 'Lịch sử upload',
  'nav.clips': 'Clip',
  'nav.series': 'Series',
  'nav.tutor': 'Gia sư',
  'nav.users': 'Người dùng',
  'nav.banners': 'Banner',
  'banners.title': 'Banner',
  'banners.subtitle': 'Thông báo ở đầu trang Tổng quan hoặc Thư viện.',
  'banners.new': 'Banner mới',
  'banners.none': 'Chưa có banner nào.',
  'banners.edit': 'Sửa',
  'banners.editTitle': 'Sửa banner',
  'banners.newTitle': 'Banner mới',
  'banners.save': 'Lưu',
  'banners.saving': 'Đang lưu…',
  'banners.fieldTitle': 'Tiêu đề',
  'banners.fieldBody': 'Nội dung',
  'banners.fieldLink': 'Liên kết',
  'banners.fieldLinkHint': 'Một đường dẫn trong app, như /library, hoặc địa chỉ https://. Để trống nếu không cần.',
  'banners.fieldLabel': 'Chữ trên nút',
  'banners.fieldPlacement': 'Hiện ở',
  'banners.fieldLocale': 'Ngôn ngữ',
  'banners.fieldStarts': 'Bắt đầu',
  'banners.fieldEnds': 'Kết thúc',
  'banners.fieldWhenHint': 'Để trống thì bắt đầu ngay hoặc không bao giờ kết thúc.',
  'banners.fieldEnabled': 'Bật',
  'banners.fieldPosition': 'Thứ tự',
  'banners.fieldImage': 'Hình ảnh',
  'banners.imageHint': 'PNG, JPEG hoặc WebP, tối đa 3 MB.',
  'banners.imageAfterSave': 'Lưu banner trước, rồi mới thêm hình.',
  'banners.removeImage': 'Bỏ hình',
  'banners.placement.dashboard': 'Tổng quan',
  'banners.placement.library': 'Thư viện',
  'banners.everyLanguage': 'Mọi ngôn ngữ',
  'banners.status.live': 'Đang hiện',
  'banners.status.scheduled': 'Đã hẹn giờ',
  'banners.status.ended': 'Đã kết thúc',
  'banners.status.off': 'Đang tắt',
  'banners.from': (when: string) => `từ ${when}`,
  'banners.until': (when: string) => `đến ${when}`,
  'banners.turnOn': 'Bật',
  'banners.turnOff': 'Tắt',
  'banners.deleteTitle': 'Xoá banner này?',
  'banners.deleteBody': (title: string) => `“${title}” sẽ bị xoá hẳn, cùng hình của nó.`,
  'users.title': 'Người dùng',
  'users.count': (n: number) => `${n} tài khoản`,
  'users.find': 'Tìm theo tên hoặc email…',
  'users.findLabel': 'Tìm người dùng',
  'users.filterLabel': 'Hiện',
  'users.all': 'Tất cả',
  'users.admins': 'Admin',
  'users.suspended': 'Bị khoá',
  'users.none': 'Không ai khớp.',
  'users.person': 'Người dùng',
  'users.joined': 'Tham gia',
  'users.lastSignIn': 'Đăng nhập gần nhất',
  'users.takes': 'Lần thu',
  'users.questions': 'Câu hỏi gia sư',
  'users.never': '—',
  'users.owner': 'Chủ sở hữu',
  'users.admin': 'Admin',
  'users.you': 'Bạn',
  'users.makeAdmin': 'Cấp quyền admin',
  'users.removeAdmin': 'Thu quyền admin',
  'users.suspend': 'Khoá',
  'users.restore': 'Mở khoá',
  'users.ownerLocked': 'Nằm trong ADMIN_EMAILS — đổi trên server, không đổi ở đây',
  'users.selfLocked': 'Quyền của chính bạn phải do admin khác đổi',
  'users.suspendTitle': 'Khoá tài khoản này?',
  'users.suspendBody': (who: string) =>
    `${who} sẽ bị đăng xuất khỏi mọi nơi ngay bây giờ và không đăng nhập được cho tới khi được mở khoá. Các lần thu và lịch sử vẫn được giữ.`,
  'users.previous': 'Trước',
  'users.next': 'Sau',
  'nav.back': 'Về app học',
  'nav.signOut': 'Đăng xuất',
  'tutor.title': 'Mức dùng gia sư',
  'tutor.subtitle': (model: string, questions: number, minutes: number) =>
    `${model || 'Chưa đặt model'} · mỗi người học hỏi được ${questions} câu trong ${minutes} phút`,
  'tutor.period': 'Khoảng thời gian',
  'tutor.days': (n: number) => `${n} ngày`,
  'tutor.questions': 'Câu hỏi',
  'tutor.learners': 'Người học',
  'tutor.inputTokens': 'Token vào',
  'tutor.outputTokens': 'Token ra',
  'tutor.failed': 'Lỗi',
  'tutor.day': 'Ngày',
  'tutor.learner': 'Người học',
  'tutor.lastAsked': 'Hỏi lần cuối',
  'tutor.byDay': 'Theo ngày',
  'tutor.byLearner': 'Ai hỏi nhiều nhất',
  'tutor.none': 'Chưa ai hỏi gia sư trong khoảng này.',
  'tutor.total': (questions: number, tokens: string) =>
    `${questions} câu hỏi · tổng ${tokens} token`,
  'tutor.tokensNote':
    'Token là số router báo lại. Câu trả lời bị người học bấm Dừng thì không có số token, nên vẫn tính là một câu hỏi nhưng không cộng token.',
}
