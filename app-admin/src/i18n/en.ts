/**
 * English, and the shape every other language has to match.
 *
 * The console's own copy, pruned to the keys it uses. It is not shared with the
 * learner app: that catalogue is four hundred sentences about practising,
 * scoring and vocabulary, and a console has no business carrying any of it. The
 * studio keys that are in both are the ones that moved here with the screens.
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

  // --- login ----------------------------------------------------------------

  // --- dashboard ------------------------------------------------------------

  // --- library --------------------------------------------------------------

  // A series holds episodes; an episode holds the clips cut out of it. "Episode"
  // rather than "video" because a clip is already called a video everywhere a
  // learner can see one.
  'library.noSeries': 'No series yet. An admin publishes clips from the studio.',
  'library.takesThisWeek': (n: number) =>
    `${n} ${n === 1 ? 'take' : 'takes'} this week`,
  'library.seriesCounts': (episodes: number, clips: number) =>
    `${episodes} ${episodes === 1 ? 'episode' : 'episodes'} · ${clips} ${clips === 1 ? 'clip' : 'clips'}`,

  // --- a series --------------------------------------------------------------
  'series.noEpisodes': 'Nothing published in this series yet.',
  'series.episodeCounts': (clips: number, seconds: string) => `${clips} clips · ${seconds}`,

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
  'studio.clipsTitle': 'Clips',
  'studio.clipsFound': (n: number) => `${n} clips in the library`,
  'studio.tabSeriesTitle': 'Series',
  'studio.seriesCount': (n: number) => `${n} series`,
  'uploads.title': 'Uploads',
  'uploads.count': (n: number) => `${n} recordings sent`,
  'uploads.find': 'Find a recording by name…',
  'uploads.findLabel': 'Find a recording',
  'uploads.filterLabel': 'Filter by status',
  'uploads.anyState': 'Any status',
  'uploads.noMatch': 'No upload matches that.',
  'uploads.none': 'Nothing has been uploaded yet.',
  'uploads.details': 'Details',
  'uploads.retry': 'Try again',
  'uploads.nothingToRetry': 'Nothing had given up, so nothing was queued.',
  'uploads.retried': (transcribe: number, cuts: number) =>
    `Queued again: ${transcribe} transcript${transcribe === 1 ? '' : 's'} and ${cuts} cut${cuts === 1 ? '' : 's'}.`,
  'uploads.clips': 'Clips published',
  'uploads.transcript': 'Transcript',
  'uploads.attempts': 'Transcription attempts',
  'uploads.cutsLeft': 'Cuts still to do',
  'uploads.cutsFailed': 'Cuts given up on',
  'uploads.withoutAudio': 'Clips with no audio',
  'uploads.state.uploading': 'Uploading',
  'uploads.state.upload-failed': 'Upload failed',
  'uploads.state.transcribing': 'Transcribing',
  'uploads.state.transcribe-failed': 'No transcript',
  'uploads.state.ready': 'Ready to cut',
  'uploads.state.cutting': 'Cutting video',
  'uploads.state.cut-failed': 'Some cuts failed',
  'uploads.state.done': 'Done',
  'uploads.transcript.none': 'Not started',
  'uploads.transcript.pending': 'Coming',
  'uploads.transcript.ready': 'Arrived',
  'uploads.transcript.failed': 'Gave up',
  'studio.title': 'Clip studio',
  'studio.subtitle':
    'Cut a recording into single lines for the library. Learners practise these; they cannot add their own.',
  'studio.hotOn': 'Hot',
  'studio.hotOff': 'Mark hot',
  'studio.episodes': (n: number) => `${n} ${n === 1 ? 'episode' : 'episodes'}`,
  'studio.seriesName': 'Series name',
  'studio.seriesAbout': 'About this series',
  'studio.episodeName': 'Episode name',
  'studio.order': 'Order',
  'studio.inSeries': 'In series',
  'studio.findClip': 'Find a clip by name, line, playlist or category',
  'studio.findClipLabel': 'Find a clip',
  'studio.noMatch': 'No clip in the library matches that.',
  'studio.clipName': 'Name',
  'studio.categories': 'Categories',
  'studio.line': 'Line',
  'studio.deleteClip': 'Delete clip',
  'studio.deleteClipTitle': 'Delete this clip?',
  'studio.deleteClipBody': (title: string) =>
    `“${title}”, its audio and every take anybody has recorded against it all go for good.`,
  'studio.previousPage': 'Previous',
  'studio.nextPage': 'Next',
  'studio.showing': (from: number, to: number, total: number) => `${from}–${to} of ${total}`,
  'studio.upload': 'Upload audio or video',
  'studio.youtube': 'Paste a YouTube URL',
  'studio.youtubeSoon': 'Not available yet — upload a file instead',
  'studio.stepsKicker': 'What happens next',
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
  'studio.stepsFooter': 'Learners practise what is published here. They cannot add clips of their own.',
  'studio.playlist': 'Playlist',
  'studio.playlistHint': 'Lesson or episode name',
  'studio.batchCategories': 'Categories for the batch',
  'studio.batchCategoriesHint': 'interview, daily conversation',
  'studio.applyToAll': 'Apply to all clips',
  'studio.listening': 'Listening for the words…',
  'studio.transcribing':
    'Transcribing — the lines fill themselves in when it finishes. Keep cutting meanwhile.',
  'studio.published': 'Published',
  'studio.publishedBody': (n: number) => `${n} clips are now in the library.`,
  'studio.publishedSilent': (n: number) =>
    `${n} of them went up without their audio. A take against one of those is kept and measured, but not scored — publish the batch again to put the sound back.`,
  'studio.publishFailed': 'Publishing stopped',
  'studio.publishFailedKept':
    'The cut is still here, exactly as you left it. Nothing has been thrown away — try again when you know what went wrong.',
  'studio.savingClips': (done: number, total: number) => `Saving clips… ${done} of ${total}`,
  'studio.savingAudio': (done: number, total: number) => `Sending audio… ${done} of ${total}`,
  'studio.noClips': 'No clips yet — cut a recording first.',




  'studio.decoding': 'Decoding…',
  'studio.saving': 'Saving…',
  'studio.featured': 'Featured',
  'studio.feature': 'Feature',
  'studio.noTranscript': 'The words could not be transcribed, so the lines are yours to type.',
  'studio.nameOptional': 'Name (optional)',
  'studio.namedWhenPublished': 'Named when published',


  // --- shared ---------------------------------------------------------------
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'studio.deleteEpisode': 'Delete episode',
  'studio.deleteEpisodeTitle': 'Delete this episode?',
  'studio.deleteEpisodeBody': (title: string, clips: number) =>
    `“${title}”, its ${clips} ${clips === 1 ? 'clip' : 'clips'} and the recording they were cut from all go for good, along with every take anybody has recorded against them.`,
  'studio.deleteSeries': 'Delete series',
  'studio.deleteSeriesTitle': 'Delete this series?',
  'studio.deleteSeriesBody': (title: string) =>
    `“${title}” is empty, so only the name goes.`,
  'studio.deleteSeriesBlocked': 'Delete its episodes first — a series with clips in it is not deleted by accident.',
  'common.loading': 'Loading…',
  // --- console navigation ---------------------------------------------------
  'nav.cut': 'Cut a recording',
  'nav.uploads': 'Uploads',
  'nav.clips': 'Clips',
  'nav.series': 'Series',
  'nav.tutor': 'Tutor usage',
  'nav.users': 'Users',
  // --- users ----------------------------------------------------------------
  'users.title': 'Users',
  'users.count': (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'}`,
  'users.find': 'Find by name or email…',
  'users.findLabel': 'Find a user',
  'users.filterLabel': 'Show',
  'users.all': 'Everyone',
  'users.admins': 'Admins',
  'users.suspended': 'Suspended',
  'users.none': 'Nobody matches that.',
  'users.person': 'Person',
  'users.joined': 'Joined',
  'users.lastSignIn': 'Last sign-in',
  'users.takes': 'Takes',
  'users.questions': 'Tutor questions',
  'users.never': '—',
  'users.owner': 'Owner',
  'users.admin': 'Admin',
  'users.you': 'You',
  'users.makeAdmin': 'Make admin',
  'users.removeAdmin': 'Remove admin',
  'users.suspend': 'Suspend',
  'users.restore': 'Restore',
  'users.ownerLocked': 'In ADMIN_EMAILS — changed on the server, not here',
  'users.selfLocked': 'Another admin has to change your own access',
  'users.suspendTitle': 'Suspend this account?',
  'users.suspendBody': (who: string) =>
    `${who} is signed out everywhere now and cannot sign in until the account is restored. Their takes and history stay.`,
  'users.previous': 'Previous',
  'users.next': 'Next',
  'nav.back': 'Back to the app',
  'nav.signOut': 'Sign out',
  // --- tutor usage ----------------------------------------------------------
  'tutor.title': 'Tutor usage',
  'tutor.subtitle': (model: string, questions: number, minutes: number) =>
    `${model || 'No model set'} · each learner can ask ${questions} questions per ${minutes} minutes`,
  'tutor.period': 'Period',
  'tutor.days': (n: number) => `${n} days`,
  'tutor.questions': 'Questions',
  'tutor.learners': 'Learners',
  'tutor.inputTokens': 'Tokens in',
  'tutor.outputTokens': 'Tokens out',
  'tutor.failed': 'Failed',
  'tutor.day': 'Day',
  'tutor.learner': 'Learner',
  'tutor.lastAsked': 'Last asked',
  'tutor.byDay': 'By day',
  'tutor.byLearner': 'Who asks most',
  'tutor.none': 'Nobody has asked the tutor anything in this period.',
  'tutor.total': (questions: number, tokens: string) =>
    `${questions} questions · ${tokens} tokens in total`,
  'tutor.tokensNote':
    'Tokens are what the router reported. An answer the learner stopped reports none, so it is counted as a question but not in tokens.',
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
