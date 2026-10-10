// The landing page's two small jobs for JavaScript: switching the language,
// and letting sections fade in as they scroll into view. Everything works
// without it — the English text is in the HTML, which is what crawlers and
// Google's reviewers read.
;(function () {
  'use strict'

  var STORAGE_KEY = 'shadowline.landing.lang'

  var VI = {
    skip: 'Bỏ qua tới nội dung',
    'nav.how': 'Cách hoạt động',
    'nav.features': 'Tính năng',
    'nav.why': 'Vì sao shadowing',
    'nav.faq': 'Hỏi đáp',
    'nav.signIn': 'Đăng nhập',
    'nav.start': 'Bắt đầu miễn phí',
    'hero.eyebrow': 'Luyện phát âm theo cách diễn viên tập luyện',
    'hero.title1': 'Nói tiếng Anh như',
    'hero.title2': 'những thước phim bạn yêu.',
    'hero.lead':
      'Shadowline English biến các cảnh phim ngắn thành nhiệm vụ luyện nói. Nghe một câu của người bản xứ, ghi âm bạn nói lại, và xem ngay nhịp, trọng âm, ngữ điệu của bạn giống bản gốc đến đâu — chỉ trong vài giây.',
    'hero.cta': 'Bắt đầu luyện — miễn phí',
    'hero.secondary': 'Xem cách hoạt động',
    'hero.p1': 'Miễn phí sử dụng',
    'hero.p2': 'Chạy ngay trên trình duyệt — không cần cài đặt',
    'hero.p3': 'Tiếng Anh & Tiếng Việt',
    'mock.compare': 'Giọng bạn so với bản gốc',
    'mock.original': 'Bản gốc',
    'mock.you': 'Bạn',
    'mock.tip': 'Nhịp rất tốt! Nhấn mạnh hơn một chút vào “time”.',
    'strip.1a': '3 bước',
    'strip.1b': 'nghe · nhại · so sánh',
    'strip.2a': 'Vài giây',
    'strip.2b': 'từ lúc ghi âm tới khi có điểm',
    'strip.3a': 'Cảnh thật',
    'strip.3b': 'tiếng Anh tự nhiên, đời thường',
    'strip.4a': 'Riêng tư',
    'strip.4b': 'bản ghi của bạn là của bạn',
    'how.eyebrow': 'Cách hoạt động',
    'how.title': 'Mỗi lần một câu. Mỗi ngày gần hơn một chút.',
    'how.s1t': 'Nghe',
    'how.s1b': 'Chọn một cảnh trong thư viện và nghe một câu do người bản xứ nói — nghe lại bao nhiêu lần tuỳ thích.',
    'how.s2t': 'Nhại theo',
    'how.s2b': 'Ghi âm bạn nói lại đúng câu đó, bắt chước giai điệu, trọng âm và nhịp càng sát càng tốt.',
    'how.s3t': 'So sánh & tiến bộ',
    'how.s3b': 'Nhận điểm và xem cao độ, nhịp của bạn vẽ chồng lên bản gốc. Thử lại và nhìn hai đường dần trùng nhau.',
    'feat.eyebrow': 'Tính năng',
    'feat.title': 'Mọi thứ bạn cần để tự tin nói tiếng Anh',
    'feat.lead':
      'Xây dựng quanh một ý tưởng: cách nhanh nhất để nói tự nhiên là bắt chước lời nói tự nhiên — kèm nhận xét trung thực sau mỗi lần thử.',
    'feat.1t': 'Nhận xét cao độ & nhịp',
    'feat.1b': 'Xem giai điệu câu nói của bạn đặt cạnh người nói, và chỗ bạn nói nhanh hơn hay chậm hơn.',
    'feat.2t': 'Điểm cho mỗi lần thu',
    'feat.2b': 'Điểm rõ ràng sau mỗi bản ghi, kèm lịch sử các lần thử để bạn thấy được sự tiến bộ.',
    'feat.3t': 'Từ vựng nhớ lâu',
    'feat.3b': 'Chạm vào bất kỳ từ nào trong clip để xem phát âm và nghĩa, lưu lại và ôn bằng thẻ ghi nhớ theo lịch giãn cách.',
    'feat.4t': 'Gia sư AI luôn bên cạnh',
    'feat.4b': 'Hỏi cách phát âm một âm, nghĩa thật của một cụm từ, hay vì sao điểm giảm — gia sư biết câu bạn đang luyện.',
    'feat.5t': 'Lồng tiếng cảnh phim',
    'feat.5b': 'Tắt tiếng gốc và đặt giọng của bạn vào clip, rồi xuất bản lồng tiếng thành video để chia sẻ.',
    'feat.6t': 'Chuỗi ngày & bảng xếp hạng',
    'feat.6b': 'Chuỗi ngày luyện tập, tiến độ theo thời gian và bảng xếp hạng thân thiện giúp bạn duy trì thói quen.',
    'tutor.eyebrow': 'Gặp gia sư của bạn',
    'tutor.title': 'Vướng một âm? Cứ hỏi.',
    'tutor.lead':
      'Gia sư thấy chính câu bạn đang luyện, nên lời khuyên dành cho câu của bạn — không phải sách giáo khoa. Giải thích bằng tiếng mẹ đẻ khi bạn cần.',
    'tutor.t1': 'Mẹo về khẩu hình, trọng âm và nối âm',
    'tutor.t2': 'Nghĩa và cách dùng của từ, cụm từ',
    'tutor.t3': 'Cuộc trò chuyện riêng tư và có thể xoá',
    'tutor.q': 'Phát âm “th” trong “through” thế nào ạ?',
    'tutor.a':
      'Đặt nhẹ đầu lưỡi giữa hai hàm răng và thổi hơi nhẹ — không rung dây thanh. Rồi lướt ngay sang “roo”. Thử chậm: <b>th…roo</b>, rồi nhanh dần.',
    'tutor.q2': 'Hiểu rồi! Em thử lại ngay đây 🎙️',
    'why.eyebrow': 'Vì sao shadowing',
    'why.title': 'Tai dẫn đường. Giọng theo sau.',
    'why.lead1':
      'Shadowing — nhại lại lời người bản xứ ngay sau khi nghe — là cách phiên dịch viên và diễn viên luyện tập. Nó xây dựng nhịp, trọng âm và ngữ điệu giúp tiếng Anh nghe tự nhiên, điều mà bài tập ngữ pháp không chạm tới.',
    'why.lead2':
      'Shadowline giúp phương pháp này đo được. Thay vì đoán mình nói đúng chưa, bạn nhìn thấy — và những buổi luyện ngắn mỗi ngày cộng dồn rất nhanh.',
    'why.native': 'Bản xứ',
    'why.day1': 'Ngày 1',
    'why.day14': 'Ngày 14',
    'safe.title': 'An toàn, riêng tư và đầy khích lệ',
    'safe.body':
      'Dành cho người học ở mọi lứa tuổi. Đăng nhập bằng Google chỉ chia sẻ tên và email của bạn. Bản ghi âm không bao giờ hiển thị cho người khác, không có quảng cáo, và bạn có thể tải về hoặc xoá toàn bộ dữ liệu bất cứ lúc nào.',
    'faq.eyebrow': 'Hỏi đáp',
    'faq.title': 'Giải đáp thắc mắc',
    'faq.q1': 'Shadowline English có miễn phí không?',
    'faq.a1': 'Có. Bạn có thể đăng ký và luyện tập miễn phí. Nếu sau này có tính năng trả phí, chúng tôi sẽ thông báo rõ ràng trước.',
    'faq.q2': 'Tôi có cần cài đặt gì không?',
    'faq.a2':
      'Không. Shadowline chạy trên trình duyệt hiện đại ở điện thoại, máy tính bảng hay máy tính. Bạn chỉ cần micro — và có thể thêm vào màn hình chính như một ứng dụng.',
    'faq.q3': 'Tôi cần trình độ tiếng Anh thế nào?',
    'faq.a3': 'Trình độ nào cũng được. Người mới bắt đầu với câu ngắn, chậm; người giỏi có thể luyện lời nói nhanh, tự nhiên. Bạn tự chọn clip.',
    'faq.q4': 'Phát âm của tôi được chấm điểm thế nào?',
    'faq.a4':
      'Chúng tôi so sánh cao độ, độ lớn và nhịp trong bản ghi của bạn với người nói gốc, từng câu một, và chỉ ra chỗ khớp, chỗ lệch.',
    'faq.q5': 'Ai có thể nghe bản ghi của tôi?',
    'faq.a5': 'Chỉ bạn. Bản ghi được chấm trên máy chủ của chính chúng tôi, không bao giờ hiển thị cho người học khác, và bạn có thể xoá bất cứ lúc nào.',
    'faq.q6': 'Có phù hợp với trẻ em không?',
    'faq.a6': 'Shadowline được thiết kế là không gian an toàn, khích lệ cho người học nhỏ tuổi. Trẻ dưới 13 tuổi nên sử dụng khi có sự cho phép của cha mẹ hoặc người giám hộ.',
    'final.title': 'Nhiệm vụ đầu tiên chỉ mất hai phút.',
    'final.lead': 'Chọn một clip, nhấn ghi âm, và nghe bạn giống đến đâu.',
    'final.cta': 'Bắt đầu luyện — miễn phí',
    'footer.tagline': 'Nói thật dũng cảm. Lên cấp tiếng Anh, từng câu một.',
    'footer.product': 'Sản phẩm',
    'footer.legal': 'Pháp lý',
    'footer.privacy': 'Chính sách quyền riêng tư',
    'footer.terms': 'Điều khoản dịch vụ',
    'footer.contact': 'Liên hệ',
    'footer.rights': 'Bảo lưu mọi quyền.',
    'footer.top': 'Lên đầu trang ↑',
  }

  var META = {
    en: {
      title: 'Shadowline English — Speak English by shadowing real clips',
      description: document.querySelector('meta[name="description"]').getAttribute('content'),
    },
    vi: {
      title: 'Shadowline English — Luyện nói tiếng Anh bằng cách nhại theo phim',
      description:
        'Shadowline English giúp bạn luyện nói tiếng Anh bằng cách nhại theo các đoạn video ngắn: nghe người bản xứ, ghi âm giọng bạn và nhận phản hồi ngay về phát âm, nhịp và ngữ điệu — miễn phí, ngay trên trình duyệt.',
    },
  }

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'))
  // The English is whatever the HTML says, captured once, so there is a single
  // copy of it to maintain.
  var EN = {}
  nodes.forEach(function (node) {
    var key = node.getAttribute('data-i18n')
    if (!(key in EN)) EN[key] = node.innerHTML
  })

  function apply(lang) {
    var dict = lang === 'vi' ? VI : EN
    nodes.forEach(function (node) {
      var text = dict[node.getAttribute('data-i18n')]
      if (text != null) node.innerHTML = text
    })
    document.documentElement.lang = lang
    document.title = META[lang].title
    document.querySelector('meta[name="description"]').setAttribute('content', META[lang].description)
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-lang') === lang))
    })
  }

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      return null
    }
  }

  function initial() {
    var params = new URLSearchParams(location.search)
    var asked = params.get('lang')
    if (asked === 'vi' || asked === 'en') return asked
    var saved = stored()
    if (saved === 'vi' || saved === 'en') return saved
    var langs = navigator.languages || [navigator.language || 'en']
    for (var i = 0; i < langs.length; i++) {
      var base = String(langs[i]).toLowerCase().split('-')[0]
      if (base === 'vi' || base === 'en') return base
    }
    return 'en'
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-lang]')
    if (!button) return
    var lang = button.getAttribute('data-lang')
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch (e) {
      /* a private window still switches, it just will not remember */
    }
    apply(lang)
  })

  var first = initial()
  if (first !== 'en') apply(first)

  var year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())

  // Sections ease in as they arrive. Marked here rather than in the HTML so a
  // browser without JavaScript never hides anything.
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js')
    var targets = document.querySelectorAll(
      '.section-head, .step, .feature, .split > *, .safe, .faq details, .final-inner',
    )
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('reveal')
      observer.observe(el)
    })
  }
})()
