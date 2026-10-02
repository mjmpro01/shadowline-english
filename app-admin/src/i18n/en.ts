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
  'uploads.state.cutting': 'Cutting clips',
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
  'studio.seriesJoins': (title: string, episodes: number) =>
    `Joins the series "${title}", which has ${episodes} episode${episodes === 1 ? '' : 's'}.`,
  'studio.seriesTypo': (title: string) =>
    `There is a series called "${title}". This name would start a separate one — a typo?`,
  'studio.seriesUse': (title: string) => `Use "${title}"`,
  'studio.seriesNew': 'Starts a new series.',
  'studio.publishedBefore': (series: string, date: string) =>
    `A recording with this file name was already published, in "${series}" on ${date}. Publishing again adds a second episode with the same lines.`,
  'studio.batchCategories': 'Categories for the batch',
  'studio.batchCategoriesHint': 'interview, daily conversation',
  'studio.applyToAll': 'Apply to all clips',
  'studio.published': 'Published',
  'studio.publishedBody': (n: number) => `${n} clips are now in the library.`,
  'studio.publishedSilent': (n: number) =>
    `${n} of them went up without their audio. A take against one of those is kept and measured, but not scored — publish the batch again to put the sound back.`,
  'studio.cutOnServer': (video: boolean) =>
    video
      ? 'Their sound and picture are being cut on the server — each clip is ready a few seconds after the last. A take recorded meanwhile is scored once its clip has a sound.'
      : 'Their sound is being cut on the server — each clip is ready a few seconds after the last. A take recorded meanwhile is scored once its clip has a sound.',
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
  // --- transcription status --------------------------------------------------
  'transcript.uploading':
    'Sending the recording to the server. Transcription starts once it has landed.',
  'transcript.uploadFailed':
    'The recording never reached the server, so nothing could transcribe it. Type the lines, or load the file again.',
  'transcript.announceFailedWhy': (reason: string) =>
    `The server would not take the upload: ${reason}`,
  'transcript.sendFailedWhy': (reason: string) =>
    `The file did not finish sending: ${reason}`,
  'transcript.resend': 'Send the file again',
  'transcript.hint.api':
    'The API is not answering. Check that it is running (go run ./cmd/api in server/, or docker compose up -d api).',
  'transcript.hint.store':
    'The file store (MinIO or S3) did not take it. Check that it is running: docker compose up -d minio',
  'transcript.hint.tooLarge': 'Recordings are limited to 2 GB. Cut the file shorter, or compress it.',
  'transcript.hint.signIn': 'The session has ended. Sign in again, then send the file again.',
  'transcript.checking': 'Asking the server about the transcript…',
  'transcript.queued': (ahead: number, waited: string) =>
    ahead === 0
      ? `Queued, next in line · waiting ${waited}`
      : `Queued · ${ahead} recording${ahead === 1 ? '' : 's'} ahead · waiting ${waited}`,
  'transcript.running': (elapsed: string, attempt: number, max: number) =>
    `Transcribing · ${elapsed} so far · attempt ${attempt} of ${max}`,
  'transcript.lastError': (reason: string) => `The attempt before this one failed: ${reason}`,
  'transcript.neverSeen':
    'No transcriber has run here yet. The recording is queued, but nothing is reading the queue — start the transcribing service.',
  'transcript.offline': (ago: string) =>
    `The transcriber stopped ${ago} ago. The recording is still queued and is picked up as soon as the service runs again.`,
  'transcript.offlineRunning': (ago: string) =>
    `The transcriber went quiet ${ago} ago, in the middle of this recording. It is picked up again once the service is back.`,
  'transcript.howToStart':
    'docker compose up -d transcribing — or from scoring/: python -m shadowline.transcriber',
  'transcript.ready': (words: number) =>
    `Transcribed ${words} words. Empty lines have been filled in — check them.`,
  'transcript.failed': (attempts: number, reason: string) =>
    `Transcription gave up after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${reason}`,
  'transcript.failedNoReason': 'Transcription gave up, and the reason was not kept.',
  'transcript.typeMeanwhile': 'The lines can still be typed by hand.',
  'transcript.retry': 'Transcribe again',
  'transcript.retryFailed': 'Could not queue it again.',
  'transcript.worker.online': (busy: boolean) =>
    busy ? 'Transcriber running · working' : 'Transcriber running · idle',
  'transcript.worker.offline': (ago: string) => `Transcriber not running · last seen ${ago} ago`,
  'transcript.worker.never': 'Transcriber has never run',
  'time.seconds': (n: number) => `${n}s`,
  'time.minutes': (n: number) => `${n} min`,
  'time.hours': (n: number) => `${n} h`,
  'time.days': (n: number) => `${n} day${n === 1 ? '' : 's'}`,
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
  'nav.skip': 'Skip to content',
  'nav.uploads': 'Uploads',
  'nav.clips': 'Clips',
  'nav.series': 'Series',
  'nav.tutor': 'Tutor usage',
  'nav.users': 'Users',
  'nav.banners': 'Banners',
  // --- banners --------------------------------------------------------------
  'banners.title': 'Banners',
  'banners.subtitle': 'Announcements at the top of the dashboard or the library.',
  'banners.new': 'New banner',
  'banners.none': 'No banners yet.',
  'banners.edit': 'Edit',
  'banners.editTitle': 'Edit banner',
  'banners.newTitle': 'New banner',
  'banners.save': 'Save',
  'banners.saving': 'Saving…',
  'banners.fieldTitle': 'Title',
  'banners.fieldBody': 'Text',
  'banners.fieldLink': 'Link',
  'banners.fieldLinkHint': 'A path in the app, like /library, or an https:// address. Leave empty for none.',
  'banners.fieldLabel': 'Button label',
  'banners.fieldPlacement': 'Shown on',
  'banners.fieldLocale': 'Language',
  'banners.fieldStarts': 'Starts',
  'banners.fieldEnds': 'Ends',
  'banners.fieldWhenHint': 'Leave empty to start now or never end.',
  'banners.fieldEnabled': 'On',
  'banners.fieldPosition': 'Order',
  'banners.fieldImage': 'Picture',
  'banners.imageHint': 'PNG, JPEG or WebP, up to 3 MB.',
  'banners.imageAfterSave': 'Save the banner first, then add a picture.',
  'banners.removeImage': 'Remove picture',
  'banners.placement.dashboard': 'Dashboard',
  'banners.placement.library': 'Library',
  'banners.everyLanguage': 'Every language',
  'banners.status.live': 'Showing',
  'banners.status.scheduled': 'Scheduled',
  'banners.status.ended': 'Ended',
  'banners.status.off': 'Off',
  'banners.from': (when: string) => `from ${when}`,
  'banners.until': (when: string) => `until ${when}`,
  'banners.turnOn': 'Turn on',
  'banners.turnOff': 'Turn off',
  'banners.deleteTitle': 'Delete this banner?',
  'banners.deleteBody': (title: string) => `“${title}” goes for good, with its picture.`,
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
  'users.actions': 'Actions',
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
  // --- login -------------------------------------------------------------------
  'login.heading': 'Shadowline admin console',
  'login.lead': 'Sign in with an admin account to manage the library.',
  'login.google': 'Continue with Google',
  'login.tryAgain': 'Try Google again',
  'login.or': 'or with email',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.signIn': 'Sign in',
  'login.signingIn': 'Signing in…',
  'login.forgot': 'Forgot your password?',
  'login.notAdmin': (email: string) =>
    `${email} is signed in, but it is not an admin account. The console is for the people who run the library.`,
  'login.useAnother': 'Sign in with another account',
  'login.error.expired': 'That sign-in link expired. Try again.',
  'login.error.browser': 'The sign-in started in another browser or tab. Try again from here.',
  'login.error.cancelled': 'Sign-in was cancelled.',
  'login.error.failed': 'Google could not confirm the account. Try again.',
  'login.error.server': 'Something went wrong on our side. Try again in a moment.',
  'login.error.unverified': 'That email address is not confirmed yet. Sign in with Google, or confirm it from the learner app.',
  'login.error.suspended': 'This account has been suspended.',
  'login.error.unknown': 'Sign-in did not work. Try again.',
  // --- previewing an episode's clips -----------------------------------------
  'preview.show': (clips: number) => `See its ${clips} clip${clips === 1 ? '' : 's'}`,
  'preview.hide': 'Hide the clips',
  'preview.asInApp': 'As a learner sees them in the app, in the order they were spoken.',
  'preview.openEpisode': 'Open this episode in the app',
  'preview.openInApp': 'Open in the app',
  'preview.play': 'Play',
  'preview.noSound': 'This clip has no sound to play yet.',
  'preview.noLine': 'No line written for this clip',
  'preview.featured': 'Featured',
  'preview.pictureCutting': 'Picture being cut',
  'preview.soundCutting': 'Sound being cut',
  'preview.soundOnly': 'Sound only',
  'series.noClips': 'No clips in this episode.',
  'worker.cutting.online': (busy: boolean) =>
    busy ? 'Cutter running · working' : 'Cutter running · idle',
  'worker.cutting.offline': (ago: string) => `Cutter not running · last seen ${ago} ago`,
  'worker.cutting.never': 'Cutter has never reported in',
  'worker.cutting.neverHint':
    'No cutter has reported in. Without one, published clips get neither picture nor sound. If clips have their picture but no sound, the cutter running is an old one that cut only pictures: rebuild and restart it (docker compose up -d --build cutting, or restart python -m shadowline.cutter), and the clips missing sound are cut again.',
  'preview.missingSound': 'No original sound',
  'uploads.cutError': (reason: string) => `Why the cutter gave up: ${reason}`,
  'uploads.cutErrorUnknown':
    'No reason was kept for these cuts. Clips with a picture and no sound usually mean an old cutter that cut only pictures: restart the cutter on the current code, then press Try again.',
  // --- system: which code every part runs ------------------------------------
  'nav.system': 'System',
  'system.title': 'System',
  'system.subtitle': 'Which code every part of Shadowline is running, and whether it is running at all.',
  'system.refresh': 'Check again',
  'system.link': (version: string) => `Version ${version}`,
  'system.linkBehind': (version: string) => `Version ${version} · check the system`,
  'system.allSame': (version: string) => `Every part is running the same code: ${version}.`,
  'system.apiOld':
    'The API server is running code from before it could say which version it is. Restart it on the current code first, then check again.',
  'system.someBehind': (n: number, version: string) =>
    `${n} part${n === 1 ? ' is' : 's are'} not on the API's code (${version}), or not running. Restart ${n === 1 ? 'it' : 'them'} on the current code.`,
  'system.part': 'Part',
  'system.version': 'Version',
  'system.since': 'Running since',
  'system.state': 'State',
  'system.console': 'Admin console',
  'system.api': 'API server',
  'system.transcribing': 'Transcriber',
  'system.cutting': 'Cutter',
  'system.scoring': 'Scorer',
  'system.dubbing': 'Dubber',
  'system.glossing': 'Glosser',
  'system.health.same': 'Same as the API',
  'system.health.different': 'Different code',
  'system.health.unknown': 'Version unknown (old)',
  'system.health.offline': 'Not running',
  'system.health.never': 'Never reported in',
  'system.health.unreported': 'Not asked by this API',
  'system.howTitle': 'How to bring a part up to date',
  'system.howBody':
    'Pull the current code, then restart the part — a running process keeps the code it started with. With Docker, rebuild and restart everything; in development, stop and start its command.',
  'system.howDev':
    'go run ./cmd/api · python -m shadowline.cutter (or .transcriber, .worker, .dubber, .glosser) · npm run dev',
  'nav.tagline': 'ADMIN CONSOLE',
  'nav.back': 'Back to the app',
  'pageError.title': 'This page stopped working',
  'pageError.body':
    'Something on it failed. If the console was just updated, the API or a worker may still be on older code: the System page says which.',
  'pageError.reload': 'Reload',
  'pageError.system': 'Open System',
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
