import type { Locale } from '../i18n'

/**
 * The privacy policy and the terms of service, in every language the app speaks.
 *
 * Public pages, linked from the login screen and from Google's consent screen,
 * so they must load without an account and say what the service actually does
 * — every claim below is something the code does, not boilerplate. When the
 * code changes what it keeps or who it sends it to, this changes with it, and
 * so does UPDATED.
 */

/** Where people write about their data or these terms. One place to change it. */
export const CONTACT_EMAIL = 'support@shadowline-english.com'

/** The last time either document changed in substance (ISO date). */
export const UPDATED = '2026-10-10'

export type LegalKind = 'privacy' | 'terms'

export interface LegalSection {
  heading: string
  /** A string is a paragraph; an array of strings is a bulleted list. */
  body: (string | string[])[]
}

export interface LegalDoc {
  title: string
  intro: string
  sections: LegalSection[]
}

const privacyEn: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    'Shadowline English ("Shadowline", "we") helps people practise spoken English by shadowing short video clips. This policy explains what we collect when you use the app at app.shadowline-english.com, why, who else sees it, and how you can take it with you or delete it.',
  sections: [
    {
      heading: '1. What we collect',
      body: [
        'Only what the app needs to work:',
        [
          'Account details: your email address and name. If you sign in with Google, Google shares your name, email address and public profile picture with us, and we keep only your name and email address; we do not receive your Google password, contacts, files or anything else in your Google account. If you register with an email and password, the password is held by our sign-in service (Keycloak) and is never stored in plain text.',
          'Your native language and the language you choose for the app.',
          'Your recordings: the audio of each attempt ("take") you record while practising, and the scores and pronunciation analysis we compute from it (pitch, loudness, timing and the words heard).',
          'Your learning activity: the clips you open, your saved vocabulary and review schedule, practice days and streaks.',
          'Questions you ask the AI tutor and its answers.',
          'A profile picture, if you upload one.',
          'Technical data needed to run the service securely: a session cookie, sign-in times, and server logs and metrics (for example request timings and errors).',
        ],
        'We do not use advertising, advertising trackers or third-party analytics, and we do not sell or rent personal data to anyone.',
      ],
    },
    {
      heading: '2. How we use it',
      body: [
        [
          'To sign you in and keep your account secure.',
          'To score your recordings and show you how your speech compares with the clip.',
          'To keep your progress, vocabulary and review schedule between sessions and devices.',
          'To answer your questions in the AI tutor.',
          'To show the app in your language.',
          'To send emails you need, such as confirming your address or resetting a password. We do not send marketing email.',
          'To keep the service running, prevent abuse (for example rate limits on the tutor) and fix problems.',
        ],
      ],
    },
    {
      heading: '3. Google user data',
      body: [
        'If you choose "Continue with Google", we request only the basic scopes needed to sign you in: openid, email and profile. We use your Google name and email address solely to create and identify your Shadowline account. We do not use Google user data for advertising, do not sell it, do not transfer it to others except as described in this policy, and do not use it to train AI models.',
        "Shadowline's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
    },
    {
      heading: '4. Who else sees your data',
      body: [
        [
          'Other learners: the leaderboard shows your display name (or the part of your email address before the @ if you have not set a name) together with your scores and practice days. Your recordings, vocabulary and tutor conversations are never shown to other learners.',
          'The AI tutor: when you ask the tutor a question, your question, the recent conversation and the text of the clip you are practising are sent to the AI model provider that powers the tutor, through an OpenAI-compatible routing service, to generate the answer. Your email address and recordings are not sent.',
          'Our administrators can see account details and usage in order to run and support the service.',
          'Service providers that host our servers, storage and email delivery, who process data only on our instructions.',
          'Authorities, if we are required to by law.',
        ],
        'Speech scoring and transcription run on our own servers; your recordings are not sent to a third-party speech service.',
      ],
    },
    {
      heading: '5. How long we keep it',
      body: [
        'We keep your account data for as long as your account exists. You can delete individual recordings and tutor conversations at any time. When you delete your account, your profile, recordings, scores, vocabulary and tutor conversations are deleted from our database and storage straight away; copies in backups and logs expire on their normal schedule. Sign-in sessions expire on their own.',
      ],
    },
    {
      heading: '6. Your choices and rights',
      body: [
        [
          'Download everything we keep about you from Profile → "Download my data".',
          'Change your name, picture and language in Profile.',
          'Delete your account and all its data from Profile → "Delete my account".',
          'Revoke Shadowline\'s access to your Google account at any time at myaccount.google.com/permissions.',
        ],
        `Depending on where you live you may have further rights, such as to object to processing or to complain to a data-protection authority. To exercise any right, or if you cannot use the options above, email ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: '7. Cookies and local storage',
      body: [
        'We use one essential cookie to keep you signed in, and short-lived cookies that protect the sign-in step. The app also stores small preferences in your browser (your language, theme, the email you asked us to remember, and whether you have seen the guided tour). We do not use cookies for tracking or advertising.',
      ],
    },
    {
      heading: '8. Security',
      body: [
        'Connections are encrypted with HTTPS, recordings are kept in private storage reachable only through short-lived signed links, and access to your data is limited to your own account and our administrators. No system is perfectly secure, but we work to protect your data and will tell you if a breach affects you.',
      ],
    },
    {
      heading: '9. Children',
      body: [
        'Shadowline is built to be a safe space for young learners. If you are under 13, or under the age of digital consent in your country, please use Shadowline only with the permission of a parent or guardian. A parent or guardian who believes their child has given us personal data without permission can email us and we will delete it.',
      ],
    },
    {
      heading: '10. International transfers',
      body: [
        'Our servers and service providers may be located outside your country. Wherever your data is processed, it is protected as described in this policy.',
      ],
    },
    {
      heading: '11. Changes',
      body: [
        'If we change this policy we will update the date at the top, and for significant changes we will tell you in the app before they take effect.',
      ],
    },
    {
      heading: '12. Contact',
      body: [`Questions about this policy or your data: ${CONTACT_EMAIL}.`],
    },
  ],
}

const privacyVi: LegalDoc = {
  title: 'Chính sách quyền riêng tư',
  intro:
    'Shadowline English ("Shadowline", "chúng tôi") giúp mọi người luyện nói tiếng Anh bằng cách nhại theo (shadowing) các đoạn video ngắn. Chính sách này giải thích chúng tôi thu thập gì khi bạn dùng ứng dụng tại app.shadowline-english.com, vì sao, ai khác có thể thấy, và cách bạn tải về hoặc xoá dữ liệu của mình.',
  sections: [
    {
      heading: '1. Chúng tôi thu thập gì',
      body: [
        'Chỉ những gì ứng dụng cần để hoạt động:',
        [
          'Thông tin tài khoản: địa chỉ email và tên. Nếu bạn đăng nhập bằng Google, Google chia sẻ với chúng tôi tên, email và ảnh đại diện công khai, và chúng tôi chỉ lưu tên và email; chúng tôi không nhận mật khẩu Google, danh bạ, tệp hay bất cứ thứ gì khác trong tài khoản Google của bạn. Nếu bạn đăng ký bằng email và mật khẩu, mật khẩu do dịch vụ đăng nhập của chúng tôi (Keycloak) giữ và không bao giờ được lưu dưới dạng văn bản thuần.',
          'Ngôn ngữ mẹ đẻ của bạn và ngôn ngữ bạn chọn cho ứng dụng.',
          'Bản ghi âm: âm thanh của mỗi lượt luyện ("take") bạn ghi, cùng điểm số và phân tích phát âm được tính từ đó (cao độ, độ lớn, nhịp và các từ nghe được).',
          'Hoạt động học: các clip bạn mở, từ vựng đã lưu và lịch ôn tập, ngày luyện tập và chuỗi ngày.',
          'Câu hỏi bạn gửi cho gia sư AI và câu trả lời.',
          'Ảnh đại diện, nếu bạn tải lên.',
          'Dữ liệu kỹ thuật cần để vận hành an toàn: cookie phiên, thời điểm đăng nhập, nhật ký và số liệu máy chủ (ví dụ thời gian xử lý và lỗi).',
        ],
        'Chúng tôi không dùng quảng cáo, công cụ theo dõi quảng cáo hay dịch vụ phân tích của bên thứ ba, và không bán hay cho thuê dữ liệu cá nhân cho bất kỳ ai.',
      ],
    },
    {
      heading: '2. Chúng tôi dùng dữ liệu để làm gì',
      body: [
        [
          'Đăng nhập cho bạn và giữ tài khoản an toàn.',
          'Chấm điểm bản ghi và cho bạn thấy giọng nói của bạn so với clip ra sao.',
          'Lưu tiến độ, từ vựng và lịch ôn tập giữa các lần dùng và các thiết bị.',
          'Trả lời câu hỏi của bạn trong gia sư AI.',
          'Hiển thị ứng dụng bằng ngôn ngữ của bạn.',
          'Gửi những email bạn cần, như xác nhận địa chỉ hoặc đặt lại mật khẩu. Chúng tôi không gửi email quảng cáo.',
          'Duy trì dịch vụ, ngăn lạm dụng (ví dụ giới hạn số câu hỏi cho gia sư) và sửa lỗi.',
        ],
      ],
    },
    {
      heading: '3. Dữ liệu người dùng Google',
      body: [
        'Nếu bạn chọn "Tiếp tục với Google", chúng tôi chỉ yêu cầu các quyền cơ bản để đăng nhập: openid, email và profile. Tên và email Google chỉ được dùng để tạo và nhận diện tài khoản Shadowline của bạn. Chúng tôi không dùng dữ liệu người dùng Google cho quảng cáo, không bán, không chuyển cho bên khác ngoài những gì mô tả trong chính sách này, và không dùng để huấn luyện mô hình AI.',
        'Việc Shadowline sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ Chính sách dữ liệu người dùng của Google API Services, bao gồm các yêu cầu về Sử dụng giới hạn (Limited Use).',
      ],
    },
    {
      heading: '4. Ai khác thấy dữ liệu của bạn',
      body: [
        [
          'Người học khác: bảng xếp hạng hiển thị tên của bạn (hoặc phần trước dấu @ trong email nếu bạn chưa đặt tên) cùng điểm số và số ngày luyện tập. Bản ghi âm, từ vựng và cuộc trò chuyện với gia sư không bao giờ hiển thị cho người học khác.',
          'Gia sư AI: khi bạn hỏi gia sư, câu hỏi, đoạn hội thoại gần đây và lời thoại của clip đang luyện được gửi tới nhà cung cấp mô hình AI vận hành gia sư, thông qua một dịch vụ định tuyến tương thích OpenAI, để tạo câu trả lời. Email và bản ghi âm của bạn không được gửi đi.',
          'Quản trị viên của chúng tôi có thể xem thông tin tài khoản và mức sử dụng để vận hành và hỗ trợ dịch vụ.',
          'Các nhà cung cấp dịch vụ lưu trữ máy chủ, kho dữ liệu và gửi email, những bên chỉ xử lý dữ liệu theo chỉ dẫn của chúng tôi.',
          'Cơ quan nhà nước, nếu pháp luật yêu cầu.',
        ],
        'Việc chấm điểm và chép lời giọng nói chạy trên máy chủ của chính chúng tôi; bản ghi của bạn không được gửi cho dịch vụ nhận dạng giọng nói của bên thứ ba.',
      ],
    },
    {
      heading: '5. Chúng tôi giữ dữ liệu bao lâu',
      body: [
        'Chúng tôi giữ dữ liệu tài khoản chừng nào tài khoản còn tồn tại. Bạn có thể xoá từng bản ghi và từng cuộc trò chuyện với gia sư bất cứ lúc nào. Khi bạn xoá tài khoản, hồ sơ, bản ghi, điểm số, từ vựng và các cuộc trò chuyện với gia sư bị xoá khỏi cơ sở dữ liệu và kho lưu trữ ngay lập tức; bản sao trong bản sao lưu và nhật ký sẽ hết hạn theo lịch thông thường. Phiên đăng nhập tự hết hạn.',
      ],
    },
    {
      heading: '6. Lựa chọn và quyền của bạn',
      body: [
        [
          'Tải về mọi dữ liệu chúng tôi giữ về bạn tại Hồ sơ → "Tải dữ liệu của tôi".',
          'Đổi tên, ảnh và ngôn ngữ trong trang Hồ sơ.',
          'Xoá tài khoản cùng toàn bộ dữ liệu tại Hồ sơ → "Xoá tài khoản".',
          'Thu hồi quyền truy cập của Shadowline vào tài khoản Google bất cứ lúc nào tại myaccount.google.com/permissions.',
        ],
        `Tuỳ nơi bạn sống, bạn có thể có thêm các quyền khác, như phản đối việc xử lý dữ liệu hoặc khiếu nại tới cơ quan bảo vệ dữ liệu. Để thực hiện bất kỳ quyền nào, hoặc nếu bạn không dùng được các lựa chọn trên, hãy email tới ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: '7. Cookie và bộ nhớ trình duyệt',
      body: [
        'Chúng tôi dùng một cookie thiết yếu để giữ bạn đăng nhập, và vài cookie ngắn hạn để bảo vệ bước đăng nhập. Ứng dụng cũng lưu một vài tuỳ chọn nhỏ trong trình duyệt (ngôn ngữ, giao diện sáng/tối, email bạn muốn được ghi nhớ, và việc bạn đã xem hướng dẫn hay chưa). Chúng tôi không dùng cookie để theo dõi hay quảng cáo.',
      ],
    },
    {
      heading: '8. Bảo mật',
      body: [
        'Kết nối được mã hoá bằng HTTPS, bản ghi được giữ trong kho riêng tư chỉ truy cập được qua liên kết có chữ ký và thời hạn ngắn, và quyền truy cập dữ liệu chỉ dành cho chính tài khoản của bạn và quản trị viên. Không hệ thống nào an toàn tuyệt đối, nhưng chúng tôi luôn nỗ lực bảo vệ dữ liệu và sẽ thông báo cho bạn nếu có sự cố ảnh hưởng tới bạn.',
      ],
    },
    {
      heading: '9. Trẻ em',
      body: [
        'Shadowline được xây dựng để là không gian an toàn cho người học nhỏ tuổi. Nếu bạn dưới 13 tuổi, hoặc dưới độ tuổi được tự đồng ý về dữ liệu ở nước bạn, hãy chỉ dùng Shadowline khi có sự cho phép của cha mẹ hoặc người giám hộ. Cha mẹ hoặc người giám hộ cho rằng con mình đã cung cấp dữ liệu cá nhân mà chưa được phép có thể email cho chúng tôi và chúng tôi sẽ xoá dữ liệu đó.',
      ],
    },
    {
      heading: '10. Chuyển dữ liệu ra nước ngoài',
      body: [
        'Máy chủ và nhà cung cấp dịch vụ của chúng tôi có thể đặt ngoài quốc gia của bạn. Dù dữ liệu được xử lý ở đâu, nó vẫn được bảo vệ như mô tả trong chính sách này.',
      ],
    },
    {
      heading: '11. Thay đổi',
      body: [
        'Khi thay đổi chính sách này, chúng tôi sẽ cập nhật ngày ở đầu trang; với thay đổi quan trọng, chúng tôi sẽ thông báo trong ứng dụng trước khi có hiệu lực.',
      ],
    },
    {
      heading: '12. Liên hệ',
      body: [`Câu hỏi về chính sách này hoặc dữ liệu của bạn: ${CONTACT_EMAIL}.`],
    },
  ],
}

const termsEn: LegalDoc = {
  title: 'Terms of Service',
  intro:
    'These terms are the agreement between you and Shadowline English ("Shadowline", "we") for using the app at app.shadowline-english.com. By creating an account or using the app you agree to them. If you do not agree, please do not use Shadowline.',
  sections: [
    {
      heading: '1. The service',
      body: [
        'Shadowline lets you practise spoken English by listening to short clips, recording yourself repeating them, and getting automatic feedback, vocabulary practice and help from an AI tutor. We may add, change or remove features over time.',
      ],
    },
    {
      heading: '2. Your account',
      body: [
        [
          'You need an account to use Shadowline. Give accurate information and keep your sign-in details to yourself; you are responsible for what happens under your account.',
          'If you are under 13, or under the age of digital consent in your country, you may use Shadowline only with the permission of a parent or guardian, who agrees to these terms on your behalf.',
          'Tell us straight away at the address below if you think someone else has used your account.',
        ],
      ],
    },
    {
      heading: '3. Acceptable use',
      body: [
        'Please keep Shadowline a safe, encouraging place. You agree not to:',
        [
          'break the law, or harass, threaten or impersonate anyone;',
          'upload a profile picture or name, or send tutor messages, that are offensive, sexual, hateful or infringe someone else\'s rights;',
          'try to get into other people\'s accounts or data, or into parts of the service you are not meant to reach;',
          'interfere with the service, overload it, or get around limits such as the tutor\'s question limits;',
          'scrape, copy or redistribute the lesson clips, or use the service to build a competing product;',
          'use automated means to create accounts or use the service.',
        ],
      ],
    },
    {
      heading: '4. Your content',
      body: [
        'Your recordings, vocabulary, profile and tutor questions stay yours. You give us permission to store and process them only as needed to provide the service to you, as described in our Privacy Policy. You can download or delete them at any time from your Profile.',
      ],
    },
    {
      heading: '5. Our content',
      body: [
        'The app, its design and the lesson clips and transcripts are owned by Shadowline or its licensors and are provided for your personal, non-commercial learning. You may not copy, publish or sell them.',
      ],
    },
    {
      heading: '6. Scores and the AI tutor',
      body: [
        'Scores, pronunciation analysis and tutor answers are produced automatically to help you practise. They can be wrong or incomplete and are not an official assessment of your English. Do not rely on the tutor for medical, legal, financial or other professional advice.',
      ],
    },
    {
      heading: '7. Price',
      body: [
        'Shadowline is currently free to use. If we introduce paid features we will tell you clearly beforehand, and nothing will be charged without your agreement.',
      ],
    },
    {
      heading: '8. Suspension and ending',
      body: [
        'You can stop using Shadowline and delete your account at any time from your Profile. We may suspend or close an account that breaks these terms or puts other learners or the service at risk; where reasonable we will tell you why. We may also stop offering the service, in which case we will give notice so you can download your data.',
      ],
    },
    {
      heading: '9. Disclaimers',
      body: [
        'We work to keep Shadowline running well, but the service is provided "as is" and "as available", without warranties of any kind, to the extent the law allows. We do not promise that it will always be available, error-free, or that it will achieve any particular learning result.',
      ],
    },
    {
      heading: '10. Limitation of liability',
      body: [
        'To the extent the law allows, Shadowline is not liable for indirect or consequential losses, or for loss of data, arising from your use of the service. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer.',
      ],
    },
    {
      heading: '11. Changes to these terms',
      body: [
        'We may update these terms. We will change the date at the top, and for significant changes we will tell you in the app before they take effect. If you keep using Shadowline after that, you accept the new terms.',
      ],
    },
    {
      heading: '12. Contact',
      body: [`Questions about these terms: ${CONTACT_EMAIL}.`],
    },
  ],
}

const termsVi: LegalDoc = {
  title: 'Điều khoản dịch vụ',
  intro:
    'Các điều khoản này là thoả thuận giữa bạn và Shadowline English ("Shadowline", "chúng tôi") về việc sử dụng ứng dụng tại app.shadowline-english.com. Khi tạo tài khoản hoặc dùng ứng dụng, bạn đồng ý với các điều khoản này. Nếu không đồng ý, xin đừng sử dụng Shadowline.',
  sections: [
    {
      heading: '1. Dịch vụ',
      body: [
        'Shadowline giúp bạn luyện nói tiếng Anh bằng cách nghe các clip ngắn, ghi âm bạn nói lại, và nhận phản hồi tự động, luyện từ vựng cùng sự trợ giúp của gia sư AI. Chúng tôi có thể thêm, thay đổi hoặc bỏ bớt tính năng theo thời gian.',
      ],
    },
    {
      heading: '2. Tài khoản của bạn',
      body: [
        [
          'Bạn cần có tài khoản để dùng Shadowline. Hãy cung cấp thông tin chính xác và giữ kín thông tin đăng nhập; bạn chịu trách nhiệm về những gì diễn ra trong tài khoản của mình.',
          'Nếu bạn dưới 13 tuổi, hoặc dưới độ tuổi được tự đồng ý về dữ liệu ở nước bạn, bạn chỉ được dùng Shadowline khi có sự cho phép của cha mẹ hoặc người giám hộ, người thay bạn đồng ý với các điều khoản này.',
          'Hãy báo ngay cho chúng tôi theo địa chỉ bên dưới nếu bạn nghĩ có người khác đã dùng tài khoản của mình.',
        ],
      ],
    },
    {
      heading: '3. Sử dụng đúng mực',
      body: [
        'Hãy cùng giữ Shadowline là nơi an toàn và đầy khích lệ. Bạn đồng ý không:',
        [
          'vi phạm pháp luật, quấy rối, đe doạ hay mạo danh người khác;',
          'dùng ảnh đại diện, tên hoặc tin nhắn gửi gia sư có nội dung xúc phạm, tình dục, thù ghét hoặc xâm phạm quyền của người khác;',
          'cố truy cập tài khoản hay dữ liệu của người khác, hoặc những phần của dịch vụ không dành cho bạn;',
          'gây cản trở, làm quá tải dịch vụ, hoặc lách các giới hạn như giới hạn câu hỏi của gia sư;',
          'thu thập tự động, sao chép hay phát tán lại các clip bài học, hoặc dùng dịch vụ để xây dựng sản phẩm cạnh tranh;',
          'dùng công cụ tự động để tạo tài khoản hoặc sử dụng dịch vụ.',
        ],
      ],
    },
    {
      heading: '4. Nội dung của bạn',
      body: [
        'Bản ghi âm, từ vựng, hồ sơ và câu hỏi gửi gia sư vẫn thuộc về bạn. Bạn cho phép chúng tôi lưu trữ và xử lý chúng chỉ trong phạm vi cần để cung cấp dịch vụ cho bạn, như mô tả trong Chính sách quyền riêng tư. Bạn có thể tải về hoặc xoá chúng bất cứ lúc nào trong trang Hồ sơ.',
      ],
    },
    {
      heading: '5. Nội dung của chúng tôi',
      body: [
        'Ứng dụng, thiết kế cùng các clip và lời thoại bài học thuộc sở hữu của Shadowline hoặc bên cấp phép, và được cung cấp cho việc học cá nhân, phi thương mại của bạn. Bạn không được sao chép, đăng tải hay bán lại chúng.',
      ],
    },
    {
      heading: '6. Điểm số và gia sư AI',
      body: [
        'Điểm số, phân tích phát âm và câu trả lời của gia sư được tạo tự động để giúp bạn luyện tập. Chúng có thể sai hoặc chưa đầy đủ và không phải là bài đánh giá chính thức trình độ tiếng Anh của bạn. Đừng dựa vào gia sư cho các lời khuyên y tế, pháp lý, tài chính hay chuyên môn khác.',
      ],
    },
    {
      heading: '7. Chi phí',
      body: [
        'Shadowline hiện được sử dụng miễn phí. Nếu sau này có tính năng trả phí, chúng tôi sẽ thông báo rõ ràng trước, và không thu bất kỳ khoản nào khi chưa có sự đồng ý của bạn.',
      ],
    },
    {
      heading: '8. Tạm khoá và chấm dứt',
      body: [
        'Bạn có thể ngừng dùng Shadowline và xoá tài khoản bất cứ lúc nào trong trang Hồ sơ. Chúng tôi có thể tạm khoá hoặc đóng tài khoản vi phạm các điều khoản này hoặc gây rủi ro cho người học khác hay cho dịch vụ; khi hợp lý, chúng tôi sẽ cho bạn biết lý do. Chúng tôi cũng có thể ngừng cung cấp dịch vụ, khi đó sẽ báo trước để bạn kịp tải dữ liệu về.',
      ],
    },
    {
      heading: '9. Miễn trừ bảo đảm',
      body: [
        'Chúng tôi nỗ lực để Shadowline hoạt động tốt, nhưng trong phạm vi pháp luật cho phép, dịch vụ được cung cấp "nguyên trạng" và "tuỳ khả năng sẵn có", không kèm bất kỳ bảo đảm nào. Chúng tôi không cam kết dịch vụ luôn sẵn sàng, không có lỗi, hay đạt được một kết quả học tập cụ thể.',
      ],
    },
    {
      heading: '10. Giới hạn trách nhiệm',
      body: [
        'Trong phạm vi pháp luật cho phép, Shadowline không chịu trách nhiệm về các thiệt hại gián tiếp hay hệ quả, hoặc việc mất dữ liệu, phát sinh từ việc bạn sử dụng dịch vụ. Không điều nào trong các điều khoản này giới hạn trách nhiệm mà pháp luật không cho phép giới hạn, hay quyền của bạn với tư cách người tiêu dùng.',
      ],
    },
    {
      heading: '11. Thay đổi điều khoản',
      body: [
        'Chúng tôi có thể cập nhật các điều khoản này. Khi đó chúng tôi sẽ đổi ngày ở đầu trang, và với thay đổi quan trọng sẽ thông báo trong ứng dụng trước khi có hiệu lực. Nếu bạn tiếp tục dùng Shadowline sau đó, nghĩa là bạn chấp nhận điều khoản mới.',
      ],
    },
    {
      heading: '12. Liên hệ',
      body: [`Câu hỏi về các điều khoản này: ${CONTACT_EMAIL}.`],
    },
  ],
}

export const LEGAL: Record<LegalKind, Record<Locale, LegalDoc>> = {
  privacy: { en: privacyEn, vi: privacyVi },
  terms: { en: termsEn, vi: termsVi },
}
