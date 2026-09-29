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
  'uploads.state.cutting': 'Đang cắt clip',
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
  'studio.seriesJoins': (title: string, episodes: number) =>
    `Thêm vào series "${title}" (đang có ${episodes} tập).`,
  'studio.seriesTypo': (title: string) =>
    `Đã có series tên "${title}". Tên này sẽ tạo một series riêng — có phải gõ nhầm?`,
  'studio.seriesUse': (title: string) => `Dùng "${title}"`,
  'studio.seriesNew': 'Sẽ tạo series mới.',
  'studio.publishedBefore': (series: string, date: string) =>
    `Bản thu cùng tên file này đã được đăng vào "${series}" ngày ${date}. Đăng lại sẽ tạo thêm một tập trùng câu thoại.`,
  'studio.batchCategories': 'Thể loại cho cả đợt',
  'studio.batchCategoriesHint': 'phỏng vấn, hội thoại hằng ngày',
  'studio.applyToAll': 'Áp dụng cho mọi clip',
  'studio.published': 'Đã đăng',
  'studio.publishedBody': (n: number) => `${n} clip đã vào thư viện.`,
  'studio.publishedSilent': (n: number) =>
    `${n} clip trong số đó lên mà chưa có tiếng. Bài thu vào những clip này vẫn được giữ và đo, nhưng không chấm điểm — publish lại lô này để đưa tiếng lên.`,
  'studio.cutOnServer': (video: boolean) =>
    video
      ? 'Âm thanh và hình của các clip đang được cắt trên server — mỗi clip xong sau vài giây. Lần thu trong lúc chờ sẽ được chấm khi clip có âm thanh.'
      : 'Âm thanh của các clip đang được cắt trên server — mỗi clip xong sau vài giây. Lần thu trong lúc chờ sẽ được chấm khi clip có âm thanh.',
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
  // --- trạng thái chép lời -----------------------------------------------------
  'transcript.uploading': 'Đang gửi bản thu lên máy chủ. Chép lời bắt đầu khi gửi xong.',
  'transcript.uploadFailed':
    'Bản thu chưa tới được máy chủ, nên không có gì để chép lời. Hãy gõ câu thoại, hoặc tải file lên lại.',
  'transcript.announceFailedWhy': (reason: string) => `Máy chủ không nhận bản thu: ${reason}`,
  'transcript.sendFailedWhy': (reason: string) => `File chưa gửi xong: ${reason}`,
  'transcript.resend': 'Gửi lại file',
  'transcript.hint.api':
    'API không trả lời. Kiểm tra API có đang chạy (go run ./cmd/api trong server/, hoặc docker compose up -d api).',
  'transcript.hint.store':
    'Kho file (MinIO hoặc S3) không nhận file. Kiểm tra nó có đang chạy: docker compose up -d minio',
  'transcript.hint.tooLarge': 'Bản thu tối đa 2 GB. Hãy cắt ngắn hoặc nén file lại.',
  'transcript.hint.signIn': 'Phiên đăng nhập đã hết. Đăng nhập lại rồi gửi lại file.',
  'transcript.checking': 'Đang hỏi máy chủ về phần chép lời…',
  'transcript.queued': (ahead: number, waited: string) =>
    ahead === 0
      ? `Đang xếp hàng, sắp tới lượt · đã chờ ${waited}`
      : `Đang xếp hàng · ${ahead} bản thu phía trước · đã chờ ${waited}`,
  'transcript.running': (elapsed: string, attempt: number, max: number) =>
    `Đang chép lời · đã chạy ${elapsed} · lần thử ${attempt}/${max}`,
  'transcript.lastError': (reason: string) => `Lần thử trước bị lỗi: ${reason}`,
  'transcript.neverSeen':
    'Chưa có máy chép lời nào chạy ở đây. Bản thu đã vào hàng đợi nhưng không có ai nhận — hãy khởi động service transcribing.',
  'transcript.offline': (ago: string) =>
    `Máy chép lời đã ngừng từ ${ago} trước. Bản thu vẫn trong hàng đợi và sẽ được nhận ngay khi service chạy lại.`,
  'transcript.offlineRunning': (ago: string) =>
    `Máy chép lời im lặng từ ${ago} trước, giữa lúc đang chép bản thu này. Việc sẽ được nhận lại khi service chạy lại.`,
  'transcript.howToStart':
    'docker compose up -d transcribing — hoặc trong scoring/: python -m shadowline.transcriber',
  'transcript.ready': (words: number) =>
    `Đã chép ${words} từ. Các câu trống đã được điền — hãy kiểm tra lại.`,
  'transcript.failed': (attempts: number, reason: string) =>
    `Chép lời thất bại sau ${attempts} lần thử: ${reason}`,
  'transcript.failedNoReason': 'Chép lời thất bại, và lý do không được lưu lại.',
  'transcript.typeMeanwhile': 'Bạn vẫn gõ câu thoại bằng tay được.',
  'transcript.retry': 'Chép lời lại',
  'transcript.retryFailed': 'Không đưa lại vào hàng đợi được.',
  'transcript.worker.online': (busy: boolean) =>
    busy ? 'Máy chép lời đang chạy · đang làm việc' : 'Máy chép lời đang chạy · đang rảnh',
  'transcript.worker.offline': (ago: string) =>
    `Máy chép lời không chạy · thấy lần cuối ${ago} trước`,
  'transcript.worker.never': 'Máy chép lời chưa từng chạy',
  'time.seconds': (n: number) => `${n} giây`,
  'time.minutes': (n: number) => `${n} phút`,
  'time.hours': (n: number) => `${n} giờ`,
  'time.days': (n: number) => `${n} ngày`,
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
  // --- đăng nhập ------------------------------------------------------------------
  'login.lead': 'Đăng nhập bằng tài khoản quản trị để quản lý thư viện.',
  'login.google': 'Tiếp tục với Google',
  'login.tryAgain': 'Thử lại với Google',
  'login.or': 'hoặc bằng email',
  'login.email': 'Email',
  'login.password': 'Mật khẩu',
  'login.signIn': 'Đăng nhập',
  'login.signingIn': 'Đang đăng nhập…',
  'login.forgot': 'Quên mật khẩu?',
  'login.notAdmin': (email: string) =>
    `${email} đã đăng nhập, nhưng không phải tài khoản quản trị. Trang này dành cho người quản lý thư viện.`,
  'login.useAnother': 'Đăng nhập bằng tài khoản khác',
  'login.error.expired': 'Liên kết đăng nhập đã hết hạn. Hãy thử lại.',
  'login.error.browser': 'Việc đăng nhập bắt đầu ở trình duyệt hoặc tab khác. Hãy thử lại từ đây.',
  'login.error.cancelled': 'Bạn đã huỷ đăng nhập.',
  'login.error.failed': 'Google không xác nhận được tài khoản. Hãy thử lại.',
  'login.error.server': 'Có lỗi phía máy chủ. Hãy thử lại sau ít phút.',
  'login.error.suspended': 'Tài khoản này đã bị khoá.',
  'login.error.unknown': 'Đăng nhập không thành công. Hãy thử lại.',
  // --- xem trước clip của một tập ---------------------------------------------------
  'preview.show': (clips: number) => `Xem ${clips} clip`,
  'preview.hide': 'Ẩn clip',
  'preview.asInApp': 'Đúng như người học thấy trong app, theo thứ tự câu được nói.',
  'preview.openEpisode': 'Mở tập này trong app',
  'preview.openInApp': 'Mở trong app',
  'preview.play': 'Phát thử',
  'preview.noSound': 'Clip này chưa có âm thanh để phát.',
  'preview.noLine': 'Clip này chưa có câu thoại',
  'preview.featured': 'Nổi bật',
  'preview.pictureCutting': 'Đang cắt hình',
  'preview.soundCutting': 'Đang cắt âm thanh',
  'preview.soundOnly': 'Chỉ có âm thanh',
  'series.noClips': 'Tập này chưa có clip nào.',
  'worker.cutting.online': (busy: boolean) =>
    busy ? 'Máy cắt đang chạy · đang làm việc' : 'Máy cắt đang chạy · đang rảnh',
  'worker.cutting.offline': (ago: string) => `Máy cắt không chạy · thấy lần cuối ${ago} trước`,
  'worker.cutting.never': 'Máy cắt chưa từng báo tín hiệu',
  'worker.cutting.neverHint':
    'Chưa có máy cắt nào báo tín hiệu. Không có máy cắt thì clip đăng lên sẽ không có hình lẫn âm thanh. Nếu clip có hình mà thiếu âm thanh, máy cắt đang chạy là bản cũ chỉ cắt hình: hãy build lại và khởi động lại nó (docker compose up -d --build cutting, hoặc chạy lại python -m shadowline.cutter), các clip thiếu âm thanh sẽ được cắt lại.',
  'preview.missingSound': 'Thiếu âm thanh gốc',
  'uploads.cutError': (reason: string) => `Lý do máy cắt bỏ cuộc: ${reason}`,
  'uploads.cutErrorUnknown':
    'Không có lý do nào được lưu cho các lần cắt này. Clip có hình mà thiếu âm thanh thường là do máy cắt bản cũ chỉ cắt hình: hãy khởi động lại máy cắt bằng code mới rồi bấm Thử lại.',
  // --- hệ thống: phiên bản của từng thành phần ------------------------------------
  'nav.system': 'Hệ thống',
  'system.title': 'Hệ thống',
  'system.subtitle': 'Mỗi thành phần của Shadowline đang chạy code phiên bản nào, và có đang chạy hay không.',
  'system.refresh': 'Kiểm tra lại',
  'system.link': (version: string) => `Phiên bản ${version}`,
  'system.linkBehind': (version: string) => `Phiên bản ${version} · kiểm tra hệ thống`,
  'system.allSame': (version: string) => `Mọi thành phần đang chạy cùng một phiên bản: ${version}.`,
  'system.apiOld':
    'Máy chủ API đang chạy code cũ, từ trước khi nó báo được phiên bản. Hãy khởi động lại API bằng code mới trước, rồi bấm Kiểm tra lại.',
  'system.someBehind': (n: number, version: string) =>
    `${n} thành phần không chạy cùng phiên bản với API (${version}), hoặc không chạy. Hãy khởi động lại bằng code mới.`,
  'system.part': 'Thành phần',
  'system.version': 'Phiên bản',
  'system.since': 'Chạy từ',
  'system.state': 'Trạng thái',
  'system.console': 'Trang quản trị',
  'system.api': 'Máy chủ API',
  'system.transcribing': 'Máy chép lời',
  'system.cutting': 'Máy cắt',
  'system.scoring': 'Máy chấm điểm',
  'system.dubbing': 'Máy lồng tiếng',
  'system.glossing': 'Máy tra từ',
  'system.health.same': 'Cùng phiên bản API',
  'system.health.different': 'Khác phiên bản',
  'system.health.unknown': 'Không rõ phiên bản (bản cũ)',
  'system.health.offline': 'Không chạy',
  'system.health.never': 'Chưa từng báo tín hiệu',
  'system.health.unreported': 'API bản cũ chưa hỏi đến',
  'system.howTitle': 'Cách cập nhật một thành phần',
  'system.howBody':
    'Kéo code mới về, rồi khởi động lại thành phần đó — process đang chạy giữ nguyên code lúc nó khởi động. Dùng Docker thì build lại và khởi động lại tất cả; khi chạy dev thì dừng rồi chạy lại lệnh của nó.',
  'system.howDev':
    'go run ./cmd/api · python -m shadowline.cutter (hoặc .transcriber, .worker, .dubber, .glosser) · npm run dev',
  'nav.tagline': 'TRANG QUẢN TRỊ',
  'pageError.title': 'Trang này gặp lỗi',
  'pageError.body':
    'Có phần trên trang bị lỗi. Nếu trang quản trị vừa được cập nhật, có thể API hoặc một worker vẫn chạy code cũ: trang Hệ thống sẽ cho biết phần nào.',
  'pageError.reload': 'Tải lại',
  'pageError.system': 'Mở trang Hệ thống',
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
