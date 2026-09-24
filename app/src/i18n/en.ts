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
  'nav.studio': 'Clip studio',
  'nav.profile': 'Profile',
  'nav.tagline': 'FOREST QUEST',
  'nav.quest': 'QUEST',
  'nav.here': 'HERE',
  'nav.collapseShort': 'Collapse',
  'nav.collapse': 'Collapse the menu',
  'nav.expand': 'Expand the menu',
  'nav.logout': 'Log out',

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
  'login.newHero': 'New hero?',
  'login.toRegister': 'Create an account',
  'login.toSignIn': 'Back to sign in',
  'login.trust': 'A safe, encouraging space for young learners. Your progress stays private.',
  'login.signingIn': 'Signing you in…',
  'login.error.expired': 'That sign-in link expired. Try again.',
  'login.error.browser': 'That sign-in started in another browser or tab. Try again here.',
  'login.error.cancelled': 'Sign-in was cancelled — nothing was shared with Shadowline.',
  'login.error.failed': 'Sign-in could not be completed. Try again.',
  'login.error.unknown': 'Sign-in did not complete. Try again.',
  'login.tryAgain': 'Try Google again',
  'login.error.server': 'Something went wrong on our side. Try again in a moment.',

  // --- dashboard ------------------------------------------------------------
  'dash.title': 'Dashboard',
  'dash.subtitle': 'Clips worth practising, and how your scores are going',
  'dash.clipsPractised': 'Clips practised',
  'dash.takesRecorded': 'Takes recorded',
  'dash.averageScore': 'Average score',
  'dash.dayStreak': 'Day streak',
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
  'profile.editTitle': 'Edit profile',
  'profile.email': 'Email',
  'profile.avatarHint': 'Drop an image on the avatar, or click it to browse',
  'profile.studioBody': 'Cut recordings into clips for the library.',
  'profile.open': 'Open',

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

  'score.bestSoFar': (score: number) => `Best so far ${score}`,
  'score.bestSoFarWeakest': (score: number, metric: string, value: number) =>
    `Best so far ${score} — ${metric.toLowerCase()} is the weakest at ${value}`,

  'profile.changeAvatar': 'Change avatar',

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
