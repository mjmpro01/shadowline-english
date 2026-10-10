/**
 * English, and the shape every other language has to match.
 *
 * This file is the source of truth twice over: it is what the app shows when
 * nothing else is chosen, and its keys are the type every other locale is
 * checked against. A translation that is missing a key, or spells one wrong, or
 * takes different arguments, does not compile — which is the whole reason this
 * is a typed object rather than a bag of JSON.
 *
 * A value is either a string or a function. Functions are for the places where
 * a sentence depends on a number or a name, because the rules differ per
 * language and are the translator's business, not the caller's: English needs
 * "1 take" and "2 takes", Vietnamese needs neither.
 */
export const en = {
  // --- navigation and shell -------------------------------------------------
  'nav.dashboard': 'Dashboard',
  'nav.library': 'Library',
  'nav.vocabulary': 'Vocabulary',
  'nav.progress': 'Progress',
  'nav.profile': 'Profile',
  // The tab bar on a phone has a fifth of the width each: one long word
  // there would be cut off, so these two have a shorter name.
  'nav.tab.dashboard': 'Home',
  'nav.tab.vocabulary': 'Words',
  'nav.tagline': 'FOREST QUEST',
  'nav.quest': 'QUEST',
  'nav.here': 'HERE',
  'nav.collapseShort': 'Collapse',
  'nav.collapse': 'Collapse the menu',
  'nav.expand': 'Expand the menu',
  'nav.logout': 'Log out',

  // --- tutor -----------------------------------------------------------------
  'tutor.name': 'Tutor',
  'tutor.open': 'Ask the tutor',
  'tutor.close': 'Close the tutor',
  'tutor.about': (title: string) => `Looking at: ${title}`,
  'tutor.general': 'General English questions',
  'tutor.intro':
    'Ask about pronunciation, a word, a grammar point, or how to practise. Open a clip first and I can see the line and how your takes measured.',
  'tutor.introClip':
    'I can see this line and how your takes of it measured. Ask me anything about it — in English or Vietnamese.',
  'tutor.askExplain': 'What does this line mean, and when would I say it?',
  'tutor.askSounds': 'Which sounds in this line are hardest for me?',
  'tutor.askFix': 'What should I fix in my last take?',
  'tutor.askLinking': 'How does linking between words work?',
  'tutor.askTh': 'How do I say "th" properly?',
  'tutor.askRoutine': 'How should I practise shadowing each day?',
  'tutor.placeholder': 'Ask the tutor…',
  'tutor.listen': 'Listen',
  'tutor.send': 'Send',
  'tutor.stop': 'Stop',
  'tutor.restart': 'New chat',
  'tutor.history': 'Past conversations',
  'tutor.backToChat': 'Back to the chat',
  'tutor.historyLoading': 'Finding your conversations…',
  'tutor.historyEmpty': 'No conversations yet. Ask the tutor something and it will be kept here.',
  'tutor.historyFailed': 'Your conversations could not be loaded. Try again in a moment.',
  'tutor.untitled': 'A conversation',
  'tutor.delete': (title: string) => `Delete “${title}”`,
  'tutor.deleteConfirm': 'Delete this conversation? It cannot be brought back.',
  'tutor.thinking': 'Thinking…',
  'tutor.failed': 'The tutor could not answer just now. Try again in a moment.',
  'tutor.note': 'An AI tutor. It can be wrong — your scores come from the app, not from it.',

  // --- native language (asked on the first sign-in) -------------------------
  'native.welcome': (name: string) => (name ? `Welcome, ${name}!` : 'Welcome, hero!'),
  'native.title': 'What is your native language?',
  'native.subtitle':
    'Shadowline will talk to you in it, so all your energy goes into your English. You can change the app language later in your profile.',
  'native.label': 'Native language',
  'native.continue': 'Continue',
  'native.saving': 'Saving…',
  'native.more': 'More languages are on the way.',

  // --- login ----------------------------------------------------------------
  'login.brand': 'Shadowing Hero',
  'login.brandAccent': 'English',
  'login.tagline': 'Speak bravely. Level up your English, one quest at a time.',
  'login.google': 'Continue with Google',
  'login.orEmail': 'or continue with email',
  'login.emailLabel': 'Email',
  'login.emailPlaceholder': 'hero@example.com',
  'login.password': 'Password',
  'login.passwordPlaceholder': 'Enter your secret password',
  'login.showPassword': 'Show password',
  'login.hidePassword': 'Hide password',
  'login.name': 'Name',
  'login.namePlaceholder': 'What should we call you?',
  'login.remember': 'Remember me',
  'login.signIn': 'Log in',
  'login.register': 'Create account',
  'login.sendReset': 'Send reset link',
  'login.forgot': 'Forgot password?',
  'login.forgotSent': 'If that email is registered, a reset link is on its way.',
  'login.toSignIn': 'Back to sign in',
  'login.trust': 'A safe, encouraging space for young learners. Your progress stays private.',
  'login.signingIn': 'Signing you in…',
  'login.creating': 'Creating your account…',
  'login.sending': 'Sending…',
  'login.modes': 'Sign in or create an account',
  'login.hint.login': 'Welcome back, hero! Your next quest is waiting.',
  'login.hint.register': 'Join the guild — it takes less than a minute.',
  'login.hint.forgot': 'Enter your email and we will send you a link to set a new password.',
  'login.passwordRule': 'At least 8 characters. Mix letters, numbers and symbols to make it stronger.',
  'login.strength.label': 'Password strength',
  'login.strength.weak': 'Weak',
  'login.strength.fair': 'Fair',
  'login.strength.good': 'Good',
  'login.strength.strong': 'Strong',
  'login.checkInbox': 'Check your inbox',
  'login.error.expired': 'That sign-in link expired. Try again.',
  'login.error.browser': 'That sign-in started in another browser or tab. Try again here.',
  'login.error.cancelled': 'Sign-in was cancelled — nothing was shared with Shadowline.',
  'login.error.failed': 'Sign-in could not be completed. Try again.',
  'login.error.unknown': 'Sign-in did not complete. Try again.',
  'login.tryAgain': 'Try Google again',
  'login.error.server': 'Something went wrong on our side. Try again in a moment.',
  'login.error.unverified': 'That email address is not confirmed yet. Use “Forgot password” to get a link sent to it, or sign in with Google.',
  'login.verifySent': 'Almost there — we sent a link to that address. Open it to confirm your email, then sign in.',
  'login.error.suspended': 'This account has been suspended. If you think that is a mistake, contact us.',

  'banner.close': 'Close this announcement',

  // --- dashboard ------------------------------------------------------------
  'dash.title': 'Dashboard',
  'dash.subtitle': 'Clips worth practising, and how your scores are going',
  'dash.openClip': (title: string) => `Open ${title}`,
  'dash.clipsPractised': 'Clips practised',
  'dash.takesRecorded': 'Takes recorded',
  'dash.averageScore': 'Average score',
  'dash.dayStreak': 'Day streak',
  'practice.cheerGold': 'Great job! 🎉',
  'practice.cheerTop': 'Amazing! 🌟',
  'dash.firstTitle': 'Start your journey',
  'dash.firstBody': 'Hear one line, say it back, and see how close your voice came. It takes less than a minute.',
  'dash.stepListen': 'Listen',
  'dash.stepSpeak': 'Say it',
  'dash.stepScore': 'See your score',
  'dash.firstStart': 'Practise my first line',
  'dash.firstBrowse': 'Browse the library',
  'dash.leaderboard': 'Leaderboard',
  'dash.learners': (n: number) =>
    n === 1 ? 'you are the only learner so far' : `${n} learners`,
  'dash.nobodyScored': 'Nobody has a scored take yet — record one and you are on the board.',
  'dash.featured': 'Featured clips',
  'dash.you': 'You',
  'dash.takesAndClips': (takes: number, clips: number) =>
    `${takes} ${takes === 1 ? 'take' : 'takes'} · ${clips} ${clips === 1 ? 'clip' : 'clips'}`,

  // --- library --------------------------------------------------------------
  'library.title': 'Library',
  'library.practice': 'Practice',
  'library.takes': (n: number) => `${n} ${n === 1 ? 'take' : 'takes'}`,
  'library.openAnalysis': (title: string) => `Open analysis for ${title}`,

  // A series holds episodes; an episode holds the clips cut out of it. "Episode"
  // rather than "video" because a clip is already called a video everywhere a
  // learner can see one.
  'library.searchLabel': 'Search the library',
  'library.searchTree': 'Search series, episodes and lines',
  'library.noSeries': 'No series yet. An admin publishes clips from the studio.',
  'library.hot': 'Hot',
  'library.hotTitle': 'Picked by the Shadowline team',
  'library.takesThisWeek': (n: number) =>
    `${n} ${n === 1 ? 'take' : 'takes'} this week`,
  'library.seriesCounts': (episodes: number, clips: number) =>
    `${episodes} ${episodes === 1 ? 'episode' : 'episodes'} · ${clips} ${clips === 1 ? 'clip' : 'clips'}`,
  'library.openSeries': (title: string) => `Open ${title}`,
  'library.foundSeries': 'Series',
  'library.foundEpisodes': 'Episodes',
  'library.foundClips': 'Clips',
  'library.searchTooShort': 'Type two letters or more.',
  'library.searchNothing': (query: string) => `Nothing in the library matches “${query}”.`,
  'library.searching': 'Searching…',

  // --- a series --------------------------------------------------------------
  'series.back': 'Library',
  'series.noEpisodes': 'Nothing published in this series yet.',
  'series.episodeCounts': (clips: number, seconds: string) => `${clips} clips · ${seconds}`,
  'series.notFound': 'That series is not in the library — it may have been renamed.',
  'series.openEpisode': (title: string) => `Open ${title}`,

  // --- an episode ------------------------------------------------------------
  'episode.notFound': 'That episode is not in the library — it may have been removed.',
  'episode.noClips': 'No clips in this episode yet.',

  // --- playlist -------------------------------------------------------------
  'playlist.clipsAndPractised': (clips: number, practised: number) =>
    `${clips} ${clips === 1 ? 'clip' : 'clips'} · ${practised} practised`,
  'playlist.percentPractised': (percent: number) => `${percent}% practised`,
  'playlist.practiceNext': (title: string) => `Practice next — ${title}`,

  // --- practice -------------------------------------------------------------
  'practice.lineOf': (current: number, total: number) => `Line ${current} of ${total}`,
  'practice.hearClip': 'Hear clip again',
  'practice.watchClip': 'Watch clip again',
  'practice.hearClipTitle': "Play the clip's original",
  'practice.noOriginal': 'This clip has no original recording',
  'practice.record': 'Record',
  'practice.rerecord': 'Re-record',
  'practice.stop': 'Stop',
  'practice.waitingForScore': 'Waiting for the last take to be scored',
  'practice.nextLine': 'Next line',
  'practice.dubReview': 'Dub review',
  'practice.seeAnalysis': 'See analysis',
  'practice.saveDub': 'Save dub',
  'practice.resetMic': 'Reset mic',
  'practice.exit': 'Exit',
  'practice.wordsHeard': (heard: number, total: number) =>
    heard === total
      ? `We heard every word.`
      : `We heard ${heard} of ${total} words — the marked ones did not come through.`,
  'practice.tapWord': 'Tap a word to add it to Vocabulary — tap again to undo',
  'practice.recording': 'Recording — read the line aloud',
  'practice.secondsLeft': (seconds: string) => `${seconds}s left`,
  'practice.askingMic': 'Asking for the microphone…',
  'practice.micDenied': 'Microphone access was refused. Allow it in your browser and try again.',
  'practice.micUnsupported': "This browser can't record audio.",
  'practice.measuring': 'Measuring your pitch…',
  'practice.pitchGuide': 'Source pitch contour',
  'practice.pitchLoading': 'Reading the source pitch…',
  'practice.pitchUnavailable': 'No pitch contour for this clip yet.',
  'practice.pitchSource': 'Source (follow this)',
  'practice.pitchYou': 'You',
  'practice.scoreKicker': 'Pitch match score',
  'practice.topBand': 'Top band — nothing above this one',
  'practice.toNextBand': (points: number) => `${points} more for the next band`,
  'practice.added': 'Added to Vocabulary',
  'practice.removed': 'Removed from Vocabulary',
  'practice.lookingUp': 'Looking this word up…',
  'practice.noDefinition': 'No definition for this one yet.',
  'practice.close': 'Close',
  'practice.nothingToMeasure': 'Nothing to measure',
  'practice.notScored': 'Not scored',

  // --- scores ---------------------------------------------------------------
  'score.great': 'Great shadowing',
  'score.getting': 'Getting there — try again',
  'score.needs': 'Needs another take',
  'tier.bronze': 'Bronze',
  'tier.silver': 'Silver',
  'tier.gold': 'Gold',
  'metric.Intonation': 'Intonation',
  'metric.Rhythm': 'Rhythm',
  'metric.Stress': 'Stress',
  'metric.Variation': 'Variation',

  // --- analysis -------------------------------------------------------------
  'analysis.wordsHeard': (heard: number, total: number) =>
    heard === total ? `Every word came through.` : `${heard} of ${total} words came through.`,
  'analysis.wordsHint': 'A marked word is one we did not hear, not one you said wrongly.',
  'analysis.wordsUnchecked': 'The words in this take were not checked.',
  'analysis.pitchContour': 'Pitch contour',
  'analysis.measured': 'measured',
  'analysis.original': 'Original',
  'analysis.myTake': 'My take',
  'analysis.source': 'Source (±1 semitone)',
  'analysis.you': 'You',
  'analysis.summary': 'Summary',
  'analysis.take': (n: number) => `Take ${n}`,
  'analysis.watchDub': 'Watch dub playback',
  'analysis.measuring': 'Measuring',
  'analysis.practiceAgain': 'Practise this line again',

  // --- dub ------------------------------------------------------------------
  'dub.back': 'Analysis',
  'dub.muted': 'original audio muted',
  'dub.myVoice': 'My voice',
  'dub.original': 'Original',
  'dub.asVideo': 'This dub as a video',
  'dub.export': 'Export this dub',
  'dub.takes': 'Takes',
  'dub.noRecording': 'This take has no recording stored.',
  'dub.noOriginal':
    'No original audio for this clip yet — attach it on the Practice screen to compare by ear.',
  'dub.play': 'Play',
  'dub.position': 'Playback position',
  'dub.noTakeAudio': 'This take has no recording',
  'dub.noOriginalAudio': 'No original audio attached',
  'dub.preparing': 'Making the file…',
  'dub.download': 'Download',
  'dub.open': 'Open',

  // --- vocabulary -----------------------------------------------------------
  'vocab.title': 'Vocabulary',
  'vocab.due': (n: number) => `${n} ${n === 1 ? 'word' : 'words'} to review`,
  'vocab.nothingDue': 'Nothing to review today.',
  'vocab.nextDue': (days: number) =>
    days <= 1 ? 'The next word is due tomorrow.' : `The next word is due in ${days} days.`,
  'vocab.practiseAnyway': 'Practise anyway',
  'vocab.dueNow': 'Due',
  'vocab.dueIn': (days: number) => (days <= 1 ? 'Due tomorrow' : `Due in ${days} days`),
  'vocab.memoryPractice': 'Memory practice',
  'vocab.all': 'All',
  'vocab.new': 'New',
  'vocab.learning': 'Learning',
  'vocab.known': 'Known',
  'vocab.markLearned': 'Mark learned',
  'vocab.markKnown': 'Mark known',
  'vocab.from': (title: string) => `from “${title}”`,
  'vocab.empty': 'No words yet. Tap one in a caption while practising.',
  'vocab.notLookedUp': 'Meaning not looked up yet.',

  // --- flashcards -----------------------------------------------------------
  'cards.progress': (current: number, total: number) => `${current} of ${total}`,
  'cards.reveal': 'Reveal meaning',
  'cards.gotIt': 'Got it',
  'cards.stillLearning': 'Still learning',
  'cards.sayAloud': 'Say it aloud',
  'cards.trySentence': (word: string) => `Try using "${word}" in a sentence of your own.`,
  'cards.summary': (reviewed: number, known: number) =>
    `Reviewed ${reviewed} ${reviewed === 1 ? 'word' : 'words'} — ${known} marked known`,
  'cards.again': 'Go round again',
  'cards.scheduled': 'Each word is booked in for another day — the better you knew it, the further off.',
  'cards.done': 'Back to Vocabulary',

  // --- progress -------------------------------------------------------------
  'progress.title': 'Progress',
  'progress.all': 'All',
  'progress.chartLabel': 'Average score over time',
  'progress.noScores': 'No scores yet',
  'progress.noScoresBody':
    'Record a take and it lands here. Two days of practice and this becomes a line.',
  'progress.findClip': 'Find a clip',
  'progress.scoreToday': 'Your score today',
  'progress.metricToday': (metric: string) => `${metric} today`,
  'progress.oneDay':
    'One day so far. Practise on another day and this becomes a line you can read.',
  'progress.needPractice': 'Need practice',
  'progress.needPracticeEmpty': 'Record a few takes and the weakest lines show up here.',
  'progress.practiceNow': 'Practice now',
  'progress.nextUp': 'Next up',
  'progress.workOn': (metric: string) =>
    `${metric} is your lowest score so far — this is a good line to work it on.`,
  'progress.anotherTake': 'Worth another take.',
  'progress.notPractised': 'You have not practised this one yet.',

  // --- profile --------------------------------------------------------------
  'profile.title': 'Profile',
  'profile.account': 'Account',
  'profile.clipsInLibrary': 'Clips in the library',
  'profile.totalTakes': 'Total takes',
  'profile.wordsTracked': 'Words tracked',
  'profile.edit': 'Edit profile',
  'profile.save': 'Save',
  'profile.cancel': 'Cancel',
  'profile.name': 'Name',
  'profile.avatar': 'Avatar',
  'profile.language': 'Language',
  'profile.theme': 'Look',
  'profile.theme.light': 'Light',
  'profile.theme.dark': 'Dark',
  'profile.theme.system': 'Same as device',
  'profile.yourData': 'Your data',
  'profile.exportBody': 'Everything Shadowline keeps about you — takes, scores, words — as one file.',
  'profile.export': 'Download my data',
  'profile.exporting': 'Preparing…',
  'profile.password': 'Change password',
  'profile.passwordTitle': 'Change your password',
  'profile.passwordCurrent': 'Current password',
  'profile.passwordNext': 'New password',
  'profile.passwordAgain': 'New password again',
  'profile.passwordMismatch': 'The two new passwords are not the same.',
  'profile.passwordShort': 'At least 8 characters.',
  'profile.passwordChanged': 'Password changed.',
  'profile.delete': 'Delete my account',
  'profile.deleteTitle': 'Delete your account?',
  'profile.deleteBody':
    'Your takes, recordings, scores and words are deleted for good, and cannot be brought back. Download your data first if you want to keep it.',
  'profile.deleteConfirm': (email: string) => `Type ${email} to confirm`,
  'profile.deleteForever': 'Delete for good',
  'profile.failed': 'That did not work. Try again in a moment.',
  'profile.editTitle': 'Edit profile',
  'profile.email': 'Email',
  'profile.avatarHint': 'Drop an image on the avatar, or click it to browse',

  // --- studio ---------------------------------------------------------------
  'studio.step1Title': 'Upload a recording.',
  'studio.step1': 'An hour is fine — it is cut into single lines, not practised whole.',
  'studio.step2Title': 'The words write themselves.',
  'studio.step2':
    'Whisper transcribes it in the background and fills each line in, with its pronunciation. Keep cutting meanwhile.',
  'studio.step3Title': 'Move the boundaries.',
  'studio.step3':
    'Every clip is proposed from the silences; drag, split or unselect the ones you do not want.',
  'studio.step4Title': 'Publish.',
  'studio.step4':
    'The selected clips reach the library, and their video is cut in the background.',

  'dash.nothingFeatured': 'Nothing featured yet — an admin picks these in the clip studio.',
  'dash.rank': 'Rank',
  'dash.learner': 'Learner',
  'dash.avgScore': 'Avg score',
  'dash.takes': 'Takes',
  'playlist.allPractised': 'Every clip here has been practised at least once.',
  'vocab.learned': 'Learned',
  'vocab.noWords': 'No words here yet — tap a word while practising to add it.',
  'cards.saidAloud': 'Said it aloud',

  'practice.waitingMic': 'Waiting for microphone…',
  'practice.micBlocked': 'Microphone access was blocked. Allow it in your browser to record a take.',
  'practice.tooQuiet': 'The recording was too short or too quiet to track a pitch',
  'practice.tryCloser': '— try again closer to the mic.',
  'practice.takeRecorded': 'Take recorded',
  'practice.nothingToScore':
    'This clip has no original audio, so there is nothing to score your delivery against.',
  'dub.withoutSound': (title: string) => `${title}, without its sound`,

  'analysis.backToEpisode': 'Episode',
  'analysis.noTakes': 'No takes recorded yet — practice this clip to see your pitch analysis.',
  'analysis.chartLabel': 'Pitch contour chart',
  'analysis.playOriginal': "Play the clip's original",
  'analysis.noOriginalAttached': 'No original recording attached to this clip',
  'analysis.playTake': 'Play this take',
  'analysis.takeNoAudio': 'This take has no recording',
  'analysis.measuringPitch': 'Measuring your pitch…',
  'analysis.couldNotMeasure': 'This recording could not be measured.',
  'analysis.noContour': 'No contour for this take.',
  'analysis.beingScored': 'Your take is being scored — this usually takes a moment.',
  'analysis.couldNotScore': 'We couldn’t score this one.',
  'analysis.noSourceAudio':
    'Scores compare your delivery with the clip’s original audio, which this clip is missing.',
  'analysis.noScore': 'This take has no score.',
  'analysis.couldNotScoreBecause': (reason: string) => `We couldn’t score this one: ${reason}.`,
  'analysis.startPractising': 'Start practising',
  'analysis.recordAnother': 'Record another take',
  'analysis.distance': (semitones: number) =>
    `Your pitch sat ${semitones.toFixed(1)} semitone${semitones.toFixed(1) === '1.0' ? '' : 's'} from the source on average. `,
  'analysis.allClose': (score: number) =>
    `All four measures landed close together, around ${score} — work on the whole line rather than one part of it.`,
  'analysis.strongestWeakest': (strongest: string, high: number, weakest: string, low: number) =>
    `${strongest} was your strongest at ${high}; ${weakest.toLowerCase()} is the one to work on, at ${low}.`,

  'score.bestSoFar': (score: number) => `Best so far ${score}`,
  'score.bestSoFarWeakest': (score: number, metric: string, value: number) =>
    `Best so far ${score} — ${metric.toLowerCase()} is the weakest at ${value}`,

  'profile.changeAvatar': 'Change avatar',

  // --- errors from the server, by the code it gives them (lib/errors.ts) -------
  'error.network': 'Could not reach the server. Check your connection and try again.',
  'error.signIn': 'Your session has ended — sign in again.',
  'error.server': 'Something went wrong on our side. Try again in a moment.',
  'error.loginWrong': 'Wrong email or password.',
  'error.loginMissing': 'Enter your email and a password.',
  'error.loginUnavailable': 'Signing in with an email is not available here — continue with Google instead.',
  'error.passwordShort': 'A password needs at least 8 characters.',
  'error.passwordNone': 'Passwords are not kept on this server, so there is none to change here.',
  'error.deleteConfirm': 'Type your email address to confirm.',
  'error.nameEmpty': 'Your name cannot be empty.',
  'error.limitSignIn': 'Too many sign-in attempts — wait a few minutes and try again.',
  'error.limitAccounts': 'Too many new accounts from here — try again later.',
  'error.limitRequests': 'Too many requests — wait a few minutes and try again.',
  'error.limitPasswords': 'Too many wrong passwords — wait a few minutes and try again.',
  'error.limitWords': 'That is a lot of new words — try again in a while.',
  'error.wordTooLong': 'That is too long to be a word.',
  'error.dubNoVideo': 'This clip has no video to dub onto.',
  'error.dubFailed': 'Could not start the export.',
  'error.tutorUnreachable': 'The tutor could not answer just now — try again in a moment.',
  'error.tutorSilent': 'The tutor had nothing to say — try asking again.',
  'error.tutorEmpty': 'Type a question first.',
  'error.tutorTooLong': 'That question is too long — keep it under 2,000 characters.',
  'error.tutorUnavailable': 'The tutor is not set up on this server.',
  'error.tutorEveryone': 'The tutor has answered all it can for today — try again later.',
  'error.tutorWindow': (seconds: number) => `That is a lot of questions at once — try again in ${seconds} seconds.`,
  'error.tutorDay': (hours: number) =>
    `You have asked the tutor a lot today — it can answer again in about ${hours} hour${hours === 1 ? '' : 's'}.`,
  'error.tutorWindowSoon': 'That is a lot of questions at once — wait a moment and try again.',
  'error.tutorDaySoon': 'You have asked the tutor a lot today — try again later.',
  'error.takeNoSpeech': 'No speech was found in the recording',
  'error.takeUnreadable': 'The recording could not be read',
  'error.takeFailed': 'Scoring did not finish',

  // --- shared ---------------------------------------------------------------
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'take.delete': 'Delete this take',
  'take.deleteTitle': 'Delete this take?',
  'take.deleteBody': (n: number) =>
    `The recording and its score go for good. You have ${n} ${n === 1 ? 'take' : 'takes'} on this clip.`,
  'common.loading': 'Loading…',
  'common.cantReach': 'Can’t reach Shadowline',
  'common.somethingWrong': 'Something went wrong.',
  'common.clipNotHere': 'That clip isn’t here',
  'common.clipRemoved': 'It may have been removed from the library.',
  'dub.making': 'Putting your voice on the picture…',
  'dub.recordFirst': 'Record a take first',
  'dub.makeVideo': 'Make a video of this take over the original',
  'dub.noVideoToDub': 'This clip has no video to dub onto',
  'common.loadFailed': 'Could not load that. Check your connection and try again.',
  'common.retry': 'Try again',
  'common.noSuchClip': 'That clip is not in the library.',
  'common.backToLibrary': 'Back to the library',

  // --- guide ----------------------------------------------------------------
  'nav.guide': 'Guide',
  'nav.main': 'Main',
  'nav.skip': 'Skip to content',
  'dash.firstGuide': 'How it works',
  'practice.howTo': 'Not sure how this works? Read the guide',
  'profile.help': 'Help',
  'profile.helpBody': 'The steps of practising a line, what the score means, and what to do when the microphone or a clip misbehaves.',
  'guide.title': 'How to use Shadowline',
  'guide.lead':
    'Shadowline helps you speak English more naturally by shadowing real lines: listen, say it straight after, then compare your voice with the original. A line takes less than a minute.',
  'guide.contents': 'Contents',
  'guide.practiceTitle': 'Practise a line in 5 steps',
  'guide.practiceIntro': 'This is what you will do most. Once through and it is familiar.',
  'guide.pick.title': 'Pick a clip',
  'guide.pick.body':
    'In the Library, open a series and then an episode, or type into the search box. Press Practice on a clip to start.',
  'guide.listen.title': 'Listen first',
  'guide.listen.body':
    'Play the clip once or twice before you speak. Notice where the voice rises and falls, what it stresses and where it pauses. The IPA line under the caption shows how to say it, and tapping a word saves it to your Vocabulary.',
  'guide.record.title': 'Record yourself',
  'guide.record.body':
    'Press Record and start speaking straight away. It stops on its own at the length of the line, or press Stop. The first time, your browser asks to use the microphone: allow it.',
  'guide.waveLabel': 'The practice strip: the original in purple, you in cyan, and a red line that moves',
  'guide.wavePurple': 'Purple — the original. Where it is tall is where to push.',
  'guide.waveCyan': 'Cyan — your voice. It grows as you speak and stays afterwards to compare.',
  'guide.waveRed': 'Red line — where the recording is, or where the clip is while it plays.',
  'guide.score.title': 'Read your score',
  'guide.score.body':
    'A few seconds later you get a pitch-match score out of 100: how closely your voice rises and falls with the original. Under the line it says how many words were heard, and marks the ones that were not clear. See analysis breaks it down into intonation, rhythm, stress and variation. Not happy? Re-record — every take is kept.',
  'guide.tierBronze': (name: string) => `${name}: under 50`,
  'guide.tierSilver': (name: string) => `${name}: 50–74`,
  'guide.tierGold': (name: string) => `${name}: 75 and up`,
  'guide.next.title': 'Move on',
  'guide.next.body':
    'A clip can have several lines — the counter at the top says which one you are on. Press Next line for the next.',
  'guide.moreTitle': 'Once you have practised',
  'guide.words.title': 'Your words',
  'guide.words.body':
    'Words you tap while practising land in Vocabulary with their meaning and pronunciation. Memory practice goes through them as cards: say the word aloud, reveal the meaning, then mark it as known or still learning. Words come back when they are due.',
  'guide.dub.title': 'Hear yourself in the scene',
  'guide.dub.body':
    'After a take, Dub review plays the clip with your voice in place of the original, so you can hear how well you fit. Save dub downloads it as a video.',
  'guide.progress.title': 'Watch yourself improve',
  'guide.progress.body':
    'Progress charts your average score over time, shows which skill needs work, and lines up your weakest lines to try again.',
  'guide.tipsTitle': 'Tips for a better score',
  'guide.tip.quiet': 'Find somewhere quiet and speak up, clearly, as if you were really talking to someone.',
  'guide.tip.headphones': 'Wear headphones while the clip plays, so the microphone does not pick up the speaker.',
  'guide.tip.listenFirst': 'Hear the line two or three times before recording. Copy the tune, not just the words.',
  'guide.tip.tune': 'Watch the purple wave: where it is tall, stress it. Try to make your cyan wave rise in the same places.',
  'guide.tip.tutor': (button: string) =>
    `If you see a “${button}” button, the tutor can answer questions about the line you are on: what it means, how it is used, how to say it.`,
  'guide.helpTitle': 'Something not working?',
  'guide.faq.mic.q': 'Record does not record anything',
  'guide.faq.mic.a': (button: string) =>
    `Your browser may be blocking the microphone. Click the lock icon beside the address, allow the microphone, press “${button}” and try again. If it still will not, try an up-to-date Chrome or Safari.`,
  'guide.faq.noOriginal.q': 'The clip says it has no original recording',
  'guide.faq.noOriginal.a':
    'There is no original sound to compare with yet, so your take is kept but not scored. Pick another clip; this one gets its sound once it has finished processing.',
  'guide.faq.tooShort.q': 'It stopped recording before I finished',
  'guide.faq.tooShort.a': (button: string) =>
    `It records for as long as the original line, so you keep pace with the speaker. Listen again, start speaking the moment you press record, then “${button}”.`,
  'guide.faq.score.q': 'My score has not appeared',
  'guide.faq.score.a':
    'Scoring takes a few seconds, and a new take cannot start until it is done. Wait for the score, then record again.',
  'guide.faq.words.q': 'Why are some words marked?',
  'guide.faq.words.a':
    'Those are words that were not clear in your take — not necessarily words you said wrong. Say them a little slower and clearer, and record again.',
  'guide.readyTitle': 'Ready?',
  'guide.readyBody': 'Pick a clip you like and practise your first line.',
  'guide.readyGo': 'Go to the Library',

  // --- tour -----------------------------------------------------------------
  'tour.counter': (step: number, total: number) => `Step ${step} of ${total}`,
  'tour.skip': 'Skip the tour',
  'tour.close': 'Close',
  'tour.next': 'Next',
  'tour.begin': 'Show me',
  'tour.finish': 'Start practising',
  'tour.pressIt': 'Press the lit-up button',
  'tour.replay': 'Take the guided tour',
  'tour.replayBody': 'Popups that walk you through practising a line, one button at a time.',
  'tour.welcome.title': 'Welcome to Shadowline!',
  'tour.welcome.body':
    'I will walk you through your first line: listen, say it back, and see how close you got. It takes about a minute.',
  'tour.start.title': 'Open your first line',
  'tour.start.body': 'Press this to open a line to practise.',
  'tour.start.waiting': 'Go to the Dashboard or the Library to carry on with the tour.',
  'tour.practice.waiting': 'Open a clip and press Practice to carry on with the tour.',
  'tour.listen.title': 'Listen first',
  'tour.listen.body':
    'Play the original once or twice. Notice where the voice goes up and down, what it stresses and where it pauses.',
  'tour.caption.title': 'Tap a word to keep it',
  'tour.caption.body':
    'Tap any word in the line to save it to your Vocabulary, with its meaning. The line under it shows how to say it.',
  'tour.record.title': 'Now say it back',
  'tour.record.body':
    'Press Record and speak straight away. If your browser asks to use the microphone, allow it. It stops by itself at the end of the line.',
  'tour.wave.title': 'Watch the two waves',
  'tour.wave.body':
    'Purple is the original: where it is tall, push. Cyan is you, drawn as you speak and kept afterwards. The red line shows where you are.',
  'tour.result.title': 'Your score',
  'tour.result.body':
    'Out of 100 — how closely your voice rose and fell with the original. 75 and up is gold. Not there yet? Re-record as often as you like.',
  'tour.unscored.title': 'Your take is kept',
  'tour.unscored.body':
    'This clip has no original sound to compare with, so there is no score this time. Clips with sound get a score out of 100 — 75 and up is gold.',
  'tour.result.waiting': 'Scoring your take… it takes a few seconds.',
  'tour.after.title': 'What next',
  'tour.after.body':
    'Move to the next line, hear your voice dubbed over the clip, or see a detailed analysis of your take.',
  'tour.vocabulary.title': 'Your words',
  'tour.vocabulary.body': 'The words you tap wait for you here, with cards to help you remember them.',
  'tour.done.title': 'That is it!',
  'tour.done.body':
    'You have practised your first line. The Guide has everything else, and this tour can be taken again from there.',
} as const

/** Every key the app can ask for. Other locales are checked against this. */
export type MessageKey = keyof typeof en

/**
 * The shape a locale has to have: the same keys, taking the same arguments.
 *
 * Literal types are widened back to `string` on purpose. `as const` above is
 * what makes the key list exact, but it also pins every value to the English
 * sentence itself — without this, a locale would have to repeat the English
 * word for word to typecheck, which is the opposite of the point.
 */
export type Messages = {
  [K in MessageKey]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string
}
