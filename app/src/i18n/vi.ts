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
  'nav.studio': 'Xưởng cắt clip',
  'nav.profile': 'Hồ sơ',
  'nav.tagline': 'HÀNH TRÌNH RỪNG',
  'nav.quest': 'HÀNH TRÌNH',
  'nav.here': 'Ở ĐÂY',
  'nav.collapseShort': 'Thu gọn',
  'nav.collapse': 'Thu gọn menu',
  'nav.expand': 'Mở rộng menu',
  'nav.logout': 'Đăng xuất',

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

  // --- dashboard ------------------------------------------------------------
  'dash.title': 'Tổng quan',
  'dash.subtitle': 'Clip đáng luyện, và điểm của bạn đang đi tới đâu',
  'dash.clipsPractised': 'Clip đã luyện',
  'dash.takesRecorded': 'Bản ghi',
  'dash.averageScore': 'Điểm trung bình',
  'dash.dayStreak': 'Chuỗi ngày',
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
  'profile.studioBody': 'Cắt bản ghi thành clip cho thư viện.',
  'profile.open': 'Mở',

  // --- studio ---------------------------------------------------------------
  'studio.title': 'Xưởng cắt clip',
  'studio.subtitle':
    'Cắt một bản ghi thành từng câu cho thư viện. Người học luyện những clip này; họ không tự thêm được.',
  'studio.tabSeries': (n: number) => `Series (${n})`,
  'studio.hotOn': 'Đang nổi bật',
  'studio.hotOff': 'Đánh dấu nổi bật',
  'studio.episodes': (n: number) => `${n} tập`,
  'studio.seriesName': 'Tên series',
  'studio.seriesAbout': 'Giới thiệu series',
  'studio.episodeName': 'Tên tập',
  'studio.order': 'Thứ tự',
  'studio.inSeries': 'Thuộc series',
  'studio.tabCut': 'Cắt một bản ghi',
  'studio.tabClips': (n: number) => `Clip (${n})`,
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
  'studio.clipsProposed': (n: number) => `đề xuất ${n} clip`,
  'studio.listening': 'Đang nghe ra từng chữ…',
  'studio.transcribing':
    'Đang chép lời — các câu sẽ tự điền khi xong. Bạn cứ cắt tiếp trong lúc đó.',
  'studio.line': 'Câu thoại',
  'studio.categories': 'Thể loại',
  'studio.published': 'Đã đăng',
  'studio.publishedBody': (n: number) => `${n} clip đã vào thư viện.`,
  'studio.cuttingVideo':
    'Video của chúng đang được cắt ở nền — người học luyện phần audio trước được, hình sẽ hiện khi cắt xong từng clip.',
  'studio.noClips': 'Chưa có clip nào — cắt một bản ghi trước đã.',
  'studio.selectAll': 'Chọn tất cả',
  'studio.selectNone': 'Bỏ chọn tất cả',
  'studio.onlyWithLine': 'Chỉ clip có câu thoại',

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
  'studio.decoding': 'Đang giải mã…',
  'studio.saving': 'Đang lưu…',
  'studio.featured': 'Đang nổi bật',
  'studio.feature': 'Cho nổi bật',
  'studio.noTranscript': 'Không chép lời được, nên phần câu thoại bạn tự gõ nhé.',
  'studio.nameOptional': 'Tên (không bắt buộc)',
  'studio.namedWhenPublished': 'Đặt tên khi đăng',

  'profile.changeAvatar': 'Đổi ảnh đại diện',

  // --- shared ---------------------------------------------------------------
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
}
