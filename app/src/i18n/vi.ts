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
  'nav.dashboard': 'Tổng quan',
  'nav.library': 'Thư viện',
  'nav.vocabulary': 'Từ vựng',
  'nav.progress': 'Tiến độ',
  'nav.profile': 'Hồ sơ',
  'nav.tagline': 'HÀNH TRÌNH RỪNG',
  'nav.quest': 'HÀNH TRÌNH',
  'nav.here': 'Ở ĐÂY',
  'nav.collapseShort': 'Thu gọn',
  'nav.collapse': 'Thu gọn menu',
  'nav.expand': 'Mở rộng menu',
  'nav.logout': 'Đăng xuất',

  // --- tutor -----------------------------------------------------------------
  'tutor.name': 'Gia sư',
  'tutor.open': 'Hỏi gia sư',
  'tutor.close': 'Đóng gia sư',
  'tutor.about': (title: string) => `Đang xem: ${title}`,
  'tutor.general': 'Hỏi chung về tiếng Anh',
  'tutor.intro':
    'Hỏi về phát âm, một từ, một điểm ngữ pháp, hay cách luyện tập. Mở một clip trước thì mình thấy được câu thoại và điểm các lần bạn thu.',
  'tutor.introClip':
    'Mình thấy được câu này và điểm các lần bạn thu nó. Hỏi gì cũng được — bằng tiếng Anh hay tiếng Việt.',
  'tutor.askExplain': 'Câu này nghĩa là gì, và khi nào thì mình nói câu này?',
  'tutor.askSounds': 'Âm nào trong câu này khó nhất với mình?',
  'tutor.askFix': 'Lần thu vừa rồi mình nên sửa gì?',
  'tutor.askLinking': 'Nối âm giữa các từ hoạt động thế nào?',
  'tutor.askTh': 'Phát âm "th" cho đúng thế nào?',
  'tutor.askRoutine': 'Mỗi ngày nên luyện shadowing thế nào?',
  'tutor.placeholder': 'Hỏi gia sư…',
  'tutor.listen': 'Nghe',
  'tutor.send': 'Gửi',
  'tutor.stop': 'Dừng',
  'tutor.restart': 'Cuộc trò chuyện mới',
  'tutor.thinking': 'Đang nghĩ…',
  'tutor.failed': 'Gia sư chưa trả lời được lúc này. Thử lại sau chút nhé.',
  'tutor.note': 'Gia sư là AI và có thể sai — điểm của bạn là do app đo, không phải do gia sư.',

  // --- login ----------------------------------------------------------------
  'login.brand': 'Shadowing Hero',
  'login.brandAccent': 'English',
  'login.tagline': 'Nói thật dũng cảm. Lên cấp tiếng Anh, từng nhiệm vụ một.',
  'login.google': 'Tiếp tục với Google',
  'login.orEmail': 'hoặc tiếp tục bằng email',
  'login.emailLabel': 'Email',
  'login.emailPlaceholder': 'hero@example.com',
  'login.password': 'Mật khẩu',
  'login.passwordPlaceholder': 'Nhập mật khẩu bí mật của bạn',
  'login.showPassword': 'Hiện mật khẩu',
  'login.hidePassword': 'Ẩn mật khẩu',
  'login.name': 'Tên',
  'login.namePlaceholder': 'Gọi bạn là gì?',
  'login.remember': 'Ghi nhớ tôi',
  'login.signIn': 'Đăng nhập',
  'login.register': 'Tạo tài khoản',
  'login.sendReset': 'Gửi link đặt lại',
  'login.forgot': 'Quên mật khẩu?',
  'login.forgotSent': 'Nếu email đó đã đăng ký, link đặt lại mật khẩu đang được gửi.',
  'login.newHero': 'Anh hùng mới?',
  'login.toRegister': 'Tạo tài khoản',
  'login.toSignIn': 'Quay lại đăng nhập',
  'login.trust': 'Không gian an toàn, khích lệ cho người học trẻ. Tiến độ của bạn được giữ riêng tư.',
  'login.signingIn': 'Đang đăng nhập…',
  'login.error.expired': 'Liên kết đăng nhập đó đã hết hạn. Thử lại nhé.',
  'login.error.browser': 'Lần đăng nhập đó bắt đầu ở trình duyệt hoặc tab khác. Thử lại ở đây nhé.',
  'login.error.cancelled': 'Bạn đã huỷ đăng nhập — không có gì được chia sẻ với Shadowline.',
  'login.error.failed': 'Không hoàn tất được việc đăng nhập. Thử lại nhé.',
  'login.error.unknown': 'Đăng nhập chưa xong. Thử lại nhé.',
  'login.tryAgain': 'Thử lại với Google',
  'login.error.server': 'Có lỗi ở phía chúng tôi. Thử lại sau một lát.',
  'login.error.unverified': 'Email này chưa được xác nhận. Dùng “Quên mật khẩu” để nhận link qua email, hoặc đăng nhập bằng Google.',
  'login.verifySent': 'Sắp xong rồi — chúng tôi đã gửi một link tới địa chỉ đó. Mở link để xác nhận email, rồi đăng nhập.',
  'login.error.suspended': 'Tài khoản này đã bị khoá. Nếu bạn nghĩ đây là nhầm lẫn, hãy liên hệ với chúng tôi.',
  'banner.close': 'Đóng thông báo này',
  'profile.theme': 'Giao diện',
  'profile.theme.light': 'Sáng',
  'profile.theme.dark': 'Tối',
  'profile.theme.system': 'Theo thiết bị',
  'profile.yourData': 'Dữ liệu của bạn',
  'profile.exportBody': 'Mọi thứ Shadowline lưu về bạn — các lần thu, điểm, từ vựng — trong một file.',
  'profile.export': 'Tải dữ liệu của tôi',
  'profile.exporting': 'Đang chuẩn bị…',
  'profile.password': 'Đổi mật khẩu',
  'profile.passwordTitle': 'Đổi mật khẩu',
  'profile.passwordCurrent': 'Mật khẩu hiện tại',
  'profile.passwordNext': 'Mật khẩu mới',
  'profile.passwordAgain': 'Nhập lại mật khẩu mới',
  'profile.passwordMismatch': 'Hai mật khẩu mới không giống nhau.',
  'profile.passwordShort': 'Ít nhất 8 ký tự.',
  'profile.passwordChanged': 'Đã đổi mật khẩu.',
  'profile.delete': 'Xoá tài khoản',
  'profile.deleteTitle': 'Xoá tài khoản của bạn?',
  'profile.deleteBody':
    'Các lần thu, bản ghi âm, điểm và từ vựng của bạn sẽ bị xoá vĩnh viễn và không khôi phục được. Hãy tải dữ liệu về trước nếu muốn giữ lại.',
  'profile.deleteConfirm': (email: string) => `Gõ ${email} để xác nhận`,
  'profile.deleteForever': 'Xoá vĩnh viễn',
  'profile.failed': 'Chưa làm được. Thử lại sau một lát nhé.',

  // --- dashboard ------------------------------------------------------------
  'dash.title': 'Tổng quan',
  'dash.subtitle': 'Clip đáng luyện, và điểm của bạn đang đi tới đâu',
  'dash.clipsPractised': 'Clip đã luyện',
  'dash.takesRecorded': 'Bản ghi',
  'dash.averageScore': 'Điểm trung bình',
  'dash.dayStreak': 'Chuỗi ngày',
  'practice.cheerGold': 'Giỏi quá! 🎉',
  'practice.cheerTop': 'Xuất sắc! 🌟',
  'dash.firstTitle': 'Bắt đầu hành trình của bạn',
  'dash.firstBody': 'Nghe một câu, nói theo, rồi xem giọng bạn giống bản gốc tới đâu. Chưa tới một phút.',
  'dash.stepListen': 'Nghe',
  'dash.stepSpeak': 'Nói theo',
  'dash.stepScore': 'Xem điểm',
  'dash.firstStart': 'Luyện câu đầu tiên',
  'dash.firstBrowse': 'Xem thư viện',
  'dash.leaderboard': 'Bảng xếp hạng',
  'dash.learners': (n: number) =>
    n === 1 ? 'mới chỉ có mình bạn' : `${n} người học`,
  'dash.nobodyScored': 'Chưa ai có bản ghi được chấm — ghi một bản là bạn lên bảng.',
  'dash.featured': 'Clip nổi bật',
  'dash.you': 'Bạn',
  'dash.takesAndClips': (takes: number, clips: number) =>
    `${takes} bản ghi · ${clips} clip`,

  // --- library --------------------------------------------------------------
  'library.title': 'Thư viện',
  'library.practice': 'Luyện',
  'library.takes': (n: number) => `${n} bản ghi`,
  'library.openAnalysis': (title: string) => `Mở phân tích cho ${title}`,

  'library.searchLabel': 'Tìm trong thư viện',
  'library.searchTree': 'Tìm series, tập, câu thoại',
  'library.noSeries': 'Chưa có series nào. Quản trị viên đăng clip từ xưởng cắt.',
  'library.hot': 'Nổi bật',
  'library.hotTitle': 'Do đội Shadowline chọn',
  'library.takesThisWeek': (n: number) => `${n} bản ghi tuần này`,
  'library.seriesCounts': (episodes: number, clips: number) =>
    `${episodes} tập · ${clips} clip`,
  'library.openSeries': (title: string) => `Mở ${title}`,
  'library.foundSeries': 'Series',
  'library.foundEpisodes': 'Tập',
  'library.foundClips': 'Clip',
  'library.searchTooShort': 'Gõ từ hai chữ cái trở lên.',
  'library.searchNothing': (query: string) => `Không có gì trong thư viện khớp với “${query}”.`,
  'library.searching': 'Đang tìm…',

  // --- a series --------------------------------------------------------------
  'series.back': 'Thư viện',
  'series.noEpisodes': 'Series này chưa có gì được đăng.',
  'series.episodeCounts': (clips: number, seconds: string) => `${clips} clip · ${seconds}`,
  'series.notFound': 'Series này không có trong thư viện — có thể nó đã được đổi tên.',
  'series.openEpisode': (title: string) => `Mở ${title}`,

  // --- an episode ------------------------------------------------------------
  'episode.notFound': 'Tập này không có trong thư viện — có thể nó đã bị xoá.',
  'episode.noClips': 'Tập này chưa có clip nào.',

  // --- playlist -------------------------------------------------------------
  'playlist.clipsAndPractised': (clips: number, practised: number) =>
    `${clips} clip · đã luyện ${practised}`,
  'playlist.percentPractised': (percent: number) => `đã luyện ${percent}%`,
  'playlist.practiceNext': (title: string) => `Luyện tiếp — ${title}`,

  // --- practice -------------------------------------------------------------
  'practice.lineOf': (current: number, total: number) => `Câu ${current} / ${total}`,
  'practice.hearClip': 'Nghe lại clip',
  'practice.watchClip': 'Xem lại clip',
  'practice.hearClipTitle': 'Phát bản gốc của clip',
  'practice.noOriginal': 'Clip này không có bản ghi gốc',
  'practice.record': 'Ghi âm',
  'practice.rerecord': 'Ghi lại',
  'practice.stop': 'Dừng',
  'practice.waitingForScore': 'Đang chờ chấm điểm bản ghi trước',
  'practice.nextLine': 'Câu tiếp theo',
  'practice.dubReview': 'Xem lồng tiếng',
  'practice.seeAnalysis': 'Xem phân tích',
  'practice.saveDub': 'Lưu bản lồng tiếng',
  'practice.resetMic': 'Đặt lại micro',
  'practice.exit': 'Thoát',
  'practice.wordsHeard': (heard: number, total: number) =>
    heard === total
      ? `Nghe được đủ các từ.`
      : `Nghe được ${heard}/${total} từ — những từ được đánh dấu chưa rõ.`,
  'practice.tapWord': 'Chạm vào một từ để lưu vào Từ vựng — chạm lần nữa để bỏ',
  'practice.recording': 'Đang ghi — đọc to câu này',
  'practice.secondsLeft': (seconds: string) => `còn ${seconds}s`,
  'practice.askingMic': 'Đang xin quyền dùng micro…',
  'practice.micDenied': 'Micro bị từ chối. Cho phép trong trình duyệt rồi thử lại.',
  'practice.micUnsupported': 'Trình duyệt này không ghi âm được.',
  'practice.measuring': 'Đang đo cao độ của bạn…',
  'practice.pitchGuide': 'Đường cao độ mẫu',
  'practice.pitchLoading': 'Đang đọc cao độ bản gốc…',
  'practice.pitchUnavailable': 'Chưa có đường cao độ cho clip này.',
  'practice.pitchSource': 'Bản gốc (nhìn theo đây)',
  'practice.pitchYou': 'Bạn',
  'practice.scoreKicker': 'Điểm khớp cao độ',
  'practice.topBand': 'Bậc cao nhất — không còn bậc nào trên nữa',
  'practice.toNextBand': (points: number) => `thêm ${points} điểm nữa là lên bậc`,
  'practice.added': 'Đã thêm vào Từ vựng',
  'practice.removed': 'Đã bỏ khỏi Từ vựng',
  'practice.lookingUp': 'Đang tra từ này…',
  'practice.noDefinition': 'Từ này chưa có nghĩa.',
  'practice.close': 'Đóng',
  'practice.nothingToMeasure': 'Không có gì để đo',
  'practice.notScored': 'Chưa chấm',

  // --- scores ---------------------------------------------------------------
  'score.great': 'Shadowing rất tốt',
  'score.getting': 'Sắp được rồi — thử lại nhé',
  'score.needs': 'Cần ghi lại',
  'tier.bronze': 'Đồng',
  'tier.silver': 'Bạc',
  'tier.gold': 'Vàng',
  'metric.Intonation': 'Ngữ điệu',
  'metric.Rhythm': 'Nhịp điệu',
  'metric.Stress': 'Trọng âm',
  'metric.Variation': 'Độ biến thiên',

  // --- analysis -------------------------------------------------------------
  'analysis.wordsHeard': (heard: number, total: number) =>
    heard === total ? `Đủ các từ đều rõ.` : `Có ${heard}/${total} từ nghe rõ.`,
  'analysis.wordsHint': 'Từ được đánh dấu là từ chúng tôi không nghe rõ, không phải từ bạn đọc sai.',
  'analysis.wordsUnchecked': 'Bản ghi này chưa được kiểm tra từ ngữ.',
  'analysis.pitchContour': 'Đường cao độ',
  'analysis.measured': 'đã đo',
  'analysis.original': 'Bản gốc',
  'analysis.myTake': 'Bản của tôi',
  'analysis.source': 'Bản gốc (±1 cung)',
  'analysis.you': 'Bạn',
  'analysis.summary': 'Tóm tắt',
  'analysis.take': (n: number) => `Bản ${n}`,
  'analysis.watchDub': 'Xem bản lồng tiếng',
  'analysis.measuring': 'Đang đo',
  'analysis.practiceAgain': 'Luyện lại câu này',

  // --- dub ------------------------------------------------------------------
  'dub.back': 'Phân tích',
  'dub.muted': 'đã tắt tiếng gốc',
  'dub.myVoice': 'Giọng tôi',
  'dub.original': 'Bản gốc',
  'dub.asVideo': 'Bản lồng tiếng dạng video',
  'dub.export': 'Xuất bản lồng tiếng',
  'dub.takes': 'Các bản ghi',
  'dub.noRecording': 'Bản ghi này không có âm thanh được lưu.',
  'dub.noOriginal':
    'Clip này chưa có âm thanh gốc — gắn ở màn hình Luyện để so sánh bằng tai.',
  'dub.play': 'Phát',
  'dub.position': 'Vị trí phát',
  'dub.noTakeAudio': 'Bản ghi này không có âm thanh',
  'dub.noOriginalAudio': 'Chưa gắn âm thanh gốc',
  'dub.preparing': 'Đang tạo tệp…',
  'dub.download': 'Tải về',

  // --- vocabulary -----------------------------------------------------------
  'vocab.title': 'Từ vựng',
  'vocab.due': (n: number) => `${n} từ đến hạn ôn`,
  'vocab.nothingDue': 'Hôm nay không có từ nào đến hạn.',
  'vocab.nextDue': (days: number) =>
    days <= 1 ? 'Từ tiếp theo đến hạn vào ngày mai.' : `Từ tiếp theo đến hạn sau ${days} ngày.`,
  'vocab.practiseAnyway': 'Vẫn muốn ôn',
  'vocab.dueNow': 'Đến hạn',
  'vocab.dueIn': (days: number) => (days <= 1 ? 'Hạn ngày mai' : `Hạn sau ${days} ngày`),
  'vocab.memoryPractice': 'Luyện ghi nhớ',
  'vocab.all': 'Tất cả',
  'vocab.new': 'Mới',
  'vocab.learning': 'Đang học',
  'vocab.known': 'Đã thuộc',
  'vocab.markLearned': 'Đánh dấu đang học',
  'vocab.markKnown': 'Đánh dấu đã thuộc',
  'vocab.from': (title: string) => `từ “${title}”`,
  'vocab.empty': 'Chưa có từ nào. Chạm vào một từ trong phụ đề khi đang luyện.',
  'vocab.notLookedUp': 'Chưa tra nghĩa của từ này.',

  // --- flashcards -----------------------------------------------------------
  'cards.progress': (current: number, total: number) => `${current} / ${total}`,
  'cards.reveal': 'Hiện nghĩa',
  'cards.gotIt': 'Nhớ rồi',
  'cards.stillLearning': 'Chưa thuộc',
  'cards.sayAloud': 'Đọc to lên',
  'cards.trySentence': (word: string) => `Thử đặt một câu của riêng bạn với "${word}".`,
  'cards.summary': (reviewed: number, known: number) =>
    `Đã ôn ${reviewed} từ — ${known} từ đánh dấu đã thuộc`,
  'cards.again': 'Ôn lại lượt nữa',
  'cards.scheduled': 'Mỗi từ đã được hẹn ngày gặp lại — nhớ càng chắc thì càng lâu sau mới hỏi.',
  'cards.done': 'Về Từ vựng',

  // --- progress -------------------------------------------------------------
  'progress.title': 'Tiến độ',
  'progress.all': 'Tất cả',
  'progress.chartLabel': 'Điểm trung bình theo thời gian',
  'progress.noScores': 'Chưa có điểm nào',
  'progress.noScoresBody':
    'Ghi một bản là nó hiện ở đây. Luyện thêm một ngày nữa là chỗ này thành đường biểu đồ.',
  'progress.findClip': 'Tìm một clip',
  'progress.scoreToday': 'Điểm của bạn hôm nay',
  'progress.metricToday': (metric: string) => `${metric} hôm nay`,
  'progress.oneDay':
    'Mới có một ngày. Luyện thêm một ngày nữa là chỗ này thành đường bạn đọc được.',
  'progress.needPractice': 'Cần luyện thêm',
  'progress.needPracticeEmpty': 'Ghi vài bản là những câu yếu nhất sẽ hiện ở đây.',
  'progress.practiceNow': 'Luyện ngay',
  'progress.nextUp': 'Tiếp theo',
  'progress.workOn': (metric: string) =>
    `${metric} đang là điểm thấp nhất của bạn — câu này hợp để luyện nó.`,
  'progress.anotherTake': 'Đáng ghi thêm một bản.',
  'progress.notPractised': 'Bạn chưa luyện clip này.',

  // --- profile --------------------------------------------------------------
  'profile.title': 'Hồ sơ',
  'profile.account': 'Tài khoản',
  'profile.clipsInLibrary': 'Clip trong thư viện',
  'profile.totalTakes': 'Tổng số bản ghi',
  'profile.wordsTracked': 'Từ đang theo dõi',
  'profile.edit': 'Sửa hồ sơ',
  'profile.save': 'Lưu',
  'profile.cancel': 'Huỷ',
  'profile.name': 'Tên',
  'profile.avatar': 'Ảnh đại diện',
  'profile.language': 'Ngôn ngữ',
  'profile.editTitle': 'Sửa hồ sơ',
  'profile.email': 'Email',
  'profile.avatarHint': 'Thả một ảnh vào chỗ đại diện, hoặc bấm vào để chọn tệp',

  // --- studio ---------------------------------------------------------------
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

  'dash.nothingFeatured': 'Chưa có clip nổi bật — quản trị viên chọn ở xưởng cắt.',
  'dash.rank': 'Hạng',
  'dash.learner': 'Người học',
  'dash.avgScore': 'Điểm TB',
  'dash.takes': 'Bản ghi',
  'playlist.allPractised': 'Mọi clip ở đây đều đã được luyện ít nhất một lần.',
  'vocab.learned': 'Đã học',
  'vocab.noWords': 'Chưa có từ nào — chạm vào một từ khi đang luyện để thêm.',
  'cards.saidAloud': 'Đã đọc to',

  'practice.waitingMic': 'Đang chờ micro…',
  'practice.micBlocked': 'Micro đã bị chặn. Cho phép trong trình duyệt để ghi âm.',
  'practice.tooQuiet': 'Bản ghi quá ngắn hoặc quá nhỏ để lần ra cao độ',
  'practice.tryCloser': '— thử lại, ghé gần micro hơn.',
  'practice.takeRecorded': 'Đã ghi xong',
  'practice.nothingToScore':
    'Clip này không có âm thanh gốc, nên không có gì để chấm cách bạn đọc.',
  'dub.withoutSound': (title: string) => `${title}, không có tiếng`,

  'analysis.backToEpisode': 'Tập',
  'analysis.noTakes': 'Chưa có bản ghi nào — luyện clip này để xem phân tích cao độ.',
  'analysis.chartLabel': 'Biểu đồ đường cao độ',
  'analysis.playOriginal': 'Phát bản gốc của clip',
  'analysis.noOriginalAttached': 'Clip này chưa gắn bản ghi gốc',
  'analysis.playTake': 'Phát bản ghi này',
  'analysis.takeNoAudio': 'Bản ghi này không có âm thanh',
  'analysis.measuringPitch': 'Đang đo cao độ của bạn…',
  'analysis.couldNotMeasure': 'Không đo được bản ghi này.',
  'analysis.noContour': 'Bản ghi này không có đường cao độ.',
  'analysis.beingScored': 'Bản ghi của bạn đang được chấm — thường chỉ mất một lát.',
  'analysis.couldNotScore': 'Chúng tôi không chấm được bản này.',
  'analysis.noSourceAudio':
    'Điểm số so cách bạn đọc với âm thanh gốc của clip, mà clip này lại thiếu.',
  'analysis.noScore': 'Bản ghi này không có điểm.',

  'score.bestSoFar': (score: number) => `Cao nhất ${score}`,
  'score.bestSoFarWeakest': (score: number, metric: string, value: number) =>
    `Cao nhất ${score} — ${metric.toLowerCase()} yếu nhất, chỉ ${value}`,

  'profile.changeAvatar': 'Đổi ảnh đại diện',

  // --- shared ---------------------------------------------------------------
  'common.cancel': 'Huỷ',
  'common.delete': 'Xoá',
  'take.delete': 'Xoá bản ghi này',
  'take.deleteTitle': 'Xoá bản ghi này?',
  'take.deleteBody': (n: number) =>
    `Bản ghi và điểm của nó mất hẳn. Bạn có ${n} bản ghi cho clip này.`,
  'common.loading': 'Đang tải…',
  'common.cantReach': 'Không kết nối được Shadowline',
  'common.somethingWrong': 'Đã có lỗi xảy ra.',
  'common.clipNotHere': 'Clip này không có ở đây',
  'common.clipRemoved': 'Có thể nó đã bị gỡ khỏi thư viện.',
  'dub.making': 'Đang ghép giọng bạn lên hình…',
  'dub.recordFirst': 'Ghi một bản trước đã',
  'dub.makeVideo': 'Tạo video đè bản ghi này lên bản gốc',
  'dub.noVideoToDub': 'Clip này không có video để lồng tiếng',
  'common.loadFailed': 'Không tải được. Kiểm tra kết nối rồi thử lại.',
  'common.retry': 'Thử lại',
  'common.noSuchClip': 'Clip đó không có trong thư viện.',
  'common.backToLibrary': 'Về thư viện',

  // --- guide ----------------------------------------------------------------
  'nav.guide': 'Hướng dẫn',
  'dash.firstGuide': 'Cách dùng',
  'practice.howTo': 'Chưa rõ cách luyện? Xem hướng dẫn',
  'profile.help': 'Trợ giúp',
  'profile.helpBody': 'Các bước luyện một câu, ý nghĩa của điểm, và cách xử lý khi micro hay clip trục trặc.',
  'guide.title': 'Hướng dẫn sử dụng',
  'guide.lead':
    'Shadowline giúp bạn nói tiếng Anh tự nhiên hơn bằng cách nhại theo (shadowing) những câu thoại thật: nghe, nói theo ngay, rồi so giọng mình với bản gốc. Mỗi câu chưa tới một phút.',
  'guide.contents': 'Mục lục',
  'guide.practiceTitle': 'Luyện một câu trong 5 bước',
  'guide.practiceIntro': 'Đây là việc bạn sẽ làm nhiều nhất. Làm thử một lần là quen.',
  'guide.pick.title': 'Chọn một clip',
  'guide.pick.body':
    'Vào Thư viện, mở một series rồi một tập, hoặc gõ vào ô tìm kiếm. Bấm Luyện trên một clip để bắt đầu.',
  'guide.listen.title': 'Nghe trước',
  'guide.listen.body':
    'Phát clip một hai lần trước khi nói. Để ý chỗ người nói lên giọng, xuống giọng, nhấn và ngắt. Dòng phiên âm IPA dưới phụ đề chỉ cách đọc, và chạm vào một từ sẽ lưu nó vào Từ vựng.',
  'guide.record.title': 'Ghi âm giọng bạn',
  'guide.record.body':
    'Bấm Ghi âm rồi nói theo ngay. Máy tự dừng khi hết độ dài câu gốc, hoặc bạn bấm Dừng. Lần đầu, trình duyệt sẽ hỏi quyền dùng micro: hãy cho phép.',
  'guide.waveLabel': 'Dải sóng âm khi luyện: bản gốc màu tím, giọng bạn màu xanh, và một vạch đỏ chạy theo',
  'guide.wavePurple': 'Tím — bản gốc. Chỗ sóng cao là chỗ cần nhấn.',
  'guide.waveCyan': 'Xanh — giọng bạn. Hiện dần khi bạn nói và ở lại sau đó để so.',
  'guide.waveRed': 'Vạch đỏ — chỗ đang ghi, hoặc chỗ clip đang phát.',
  'guide.score.title': 'Xem điểm',
  'guide.score.body':
    'Vài giây sau bạn nhận điểm khớp cao độ trên thang 100: giọng bạn lên xuống giống bản gốc tới đâu. Dưới câu thoại, app cho biết nghe được bao nhiêu từ và đánh dấu những từ chưa rõ. Xem phân tích chia điểm ra ngữ điệu, nhịp điệu, trọng âm và độ biến thiên. Chưa ưng thì Ghi lại — mọi bản ghi đều được lưu.',
  'guide.tierBronze': (name: string) => `${name}: dưới 50`,
  'guide.tierSilver': (name: string) => `${name}: 50–74`,
  'guide.tierGold': (name: string) => `${name}: từ 75 trở lên`,
  'guide.next.title': 'Sang câu tiếp',
  'guide.next.body':
    'Một clip có thể có nhiều câu — góc trên cho biết bạn đang ở câu nào. Bấm Câu tiếp theo để sang câu sau.',
  'guide.moreTitle': 'Khi đã luyện rồi',
  'guide.words.title': 'Từ vựng của bạn',
  'guide.words.body':
    'Những từ bạn chạm khi luyện nằm trong Từ vựng, kèm nghĩa và phát âm. Luyện ghi nhớ cho bạn ôn chúng bằng thẻ: đọc to từ, lật xem nghĩa, rồi đánh dấu đã nhớ hay chưa thuộc. Từ nào đến hạn sẽ tự quay lại.',
  'guide.dub.title': 'Nghe giọng mình trong cảnh phim',
  'guide.dub.body':
    'Sau khi ghi âm, Xem lồng tiếng phát clip bằng giọng của bạn thay cho giọng gốc, để bạn nghe mình khớp tới đâu. Lưu bản lồng tiếng tải nó về dạng video.',
  'guide.progress.title': 'Theo dõi tiến bộ',
  'guide.progress.body':
    'Tiến độ vẽ điểm trung bình của bạn theo thời gian, cho biết kỹ năng nào cần luyện thêm, và xếp sẵn những câu yếu nhất để luyện lại.',
  'guide.tipsTitle': 'Mẹo để điểm cao hơn',
  'guide.tip.quiet': 'Ngồi chỗ yên tĩnh và nói to, rõ, như đang nói chuyện thật với ai đó.',
  'guide.tip.headphones': 'Đeo tai nghe khi phát clip, để micro không thu lại tiếng loa.',
  'guide.tip.listenFirst': 'Nghe câu hai ba lần trước khi ghi. Nhại theo cả giai điệu, không chỉ từng từ.',
  'guide.tip.tune': 'Nhìn sóng tím: chỗ sóng cao thì nhấn mạnh. Cố cho sóng xanh của bạn lên cao đúng những chỗ đó.',
  'guide.tip.tutor': (button: string) =>
    `Nếu thấy nút “${button}”, bạn có thể hỏi gia sư về câu đang luyện: nghĩa, cách dùng, cách phát âm.`,
  'guide.helpTitle': 'Gặp trục trặc?',
  'guide.faq.mic.q': 'Bấm Ghi âm mà không ghi được gì',
  'guide.faq.mic.a': (button: string) =>
    `Có thể trình duyệt đang chặn micro. Bấm biểu tượng ổ khoá cạnh địa chỉ trang, cho phép Micro, bấm “${button}” rồi thử lại. Nếu vẫn không được, hãy dùng Chrome hoặc Safari bản mới.`,
  'guide.faq.noOriginal.q': 'Clip báo không có bản ghi gốc',
  'guide.faq.noOriginal.a':
    'Clip này chưa có âm thanh gốc để so, nên bản ghi của bạn được lưu nhưng không chấm điểm. Hãy chọn clip khác; clip này sẽ có âm thanh khi xử lý xong.',
  'guide.faq.tooShort.q': 'Máy dừng ghi trước khi tôi nói xong',
  'guide.faq.tooShort.a': (button: string) =>
    `Máy ghi đúng bằng độ dài câu gốc, để bạn nói kịp nhịp người bản xứ. Nghe lại clip, bắt đầu nói ngay khi bấm ghi, rồi bấm “${button}”.`,
  'guide.faq.score.q': 'Điểm chưa hiện ra',
  'guide.faq.score.a':
    'Chấm điểm mất vài giây, và chưa thể ghi bản mới cho tới khi chấm xong. Chờ điểm hiện rồi hãy ghi tiếp.',
  'guide.faq.words.q': 'Vì sao có từ bị đánh dấu?',
  'guide.faq.words.a':
    'Đó là những từ app chưa nghe rõ trong bản ghi của bạn — không hẳn là bạn đọc sai. Nói chậm và rõ hơn ở những từ đó rồi ghi lại.',
  'guide.readyTitle': 'Sẵn sàng chưa?',
  'guide.readyBody': 'Chọn một clip bạn thích và luyện câu đầu tiên.',
  'guide.readyGo': 'Tới Thư viện',

  // --- tour -----------------------------------------------------------------
  'tour.counter': (step: number, total: number) => `Bước ${step}/${total}`,
  'tour.skip': 'Bỏ qua hướng dẫn',
  'tour.close': 'Đóng',
  'tour.next': 'Tiếp',
  'tour.begin': 'Bắt đầu',
  'tour.finish': 'Bắt đầu luyện',
  'tour.pressIt': 'Bấm vào nút đang sáng',
  'tour.replay': 'Chạy hướng dẫn từng bước',
  'tour.replayBody': 'Các popup dẫn bạn luyện một câu, bấm từng nút một.',
  'tour.welcome.title': 'Chào mừng bạn tới Shadowline!',
  'tour.welcome.body':
    'Mình sẽ dẫn bạn luyện câu đầu tiên: nghe, nói theo, rồi xem bạn giống bản gốc tới đâu. Chỉ mất khoảng một phút.',
  'tour.start.title': 'Mở câu đầu tiên',
  'tour.start.body': 'Bấm vào đây để mở một câu và luyện.',
  'tour.start.waiting': 'Về Tổng quan hoặc Thư viện để tiếp tục hướng dẫn.',
  'tour.practice.waiting': 'Mở một clip và bấm Luyện để tiếp tục hướng dẫn.',
  'tour.listen.title': 'Nghe trước',
  'tour.listen.body':
    'Phát bản gốc một hai lần. Để ý chỗ giọng lên, xuống, chỗ được nhấn và chỗ ngắt.',
  'tour.caption.title': 'Chạm một từ để lưu',
  'tour.caption.body':
    'Chạm vào bất kỳ từ nào trong câu để lưu vào Từ vựng, kèm nghĩa. Dòng bên dưới là cách đọc.',
  'tour.record.title': 'Giờ nói theo nào',
  'tour.record.body':
    'Bấm Ghi âm và nói ngay. Nếu trình duyệt hỏi quyền dùng micro, hãy cho phép. Máy tự dừng khi hết câu.',
  'tour.wave.title': 'Nhìn hai dải sóng',
  'tour.wave.body':
    'Tím là bản gốc: chỗ sóng cao là chỗ cần nhấn. Xanh là giọng bạn, hiện ra khi bạn nói và giữ lại sau đó. Vạch đỏ là chỗ bạn đang ở.',
  'tour.result.title': 'Điểm của bạn',
  'tour.result.body':
    'Trên thang 100 — giọng bạn lên xuống giống bản gốc tới đâu. Từ 75 là bậc Vàng. Chưa tới thì cứ Ghi lại, bao nhiêu lần cũng được.',
  'tour.unscored.title': 'Bản ghi đã được lưu',
  'tour.unscored.body':
    'Clip này chưa có âm thanh gốc để so, nên lần này không có điểm. Clip có âm thanh sẽ được chấm trên thang 100 — từ 75 là bậc Vàng.',
  'tour.result.waiting': 'Đang chấm bản ghi của bạn… mất vài giây.',
  'tour.after.title': 'Làm gì tiếp',
  'tour.after.body':
    'Sang câu tiếp theo, nghe giọng bạn lồng vào clip, hoặc xem phân tích chi tiết bản ghi.',
  'tour.vocabulary.title': 'Từ vựng của bạn',
  'tour.vocabulary.body': 'Những từ bạn chạm sẽ nằm ở đây, kèm thẻ ôn tập để bạn nhớ lâu.',
  'tour.done.title': 'Xong rồi!',
  'tour.done.body':
    'Bạn đã luyện xong câu đầu tiên. Mọi thứ khác có trong mục Hướng dẫn, và bạn có thể chạy lại phần này từ đó.',
}
