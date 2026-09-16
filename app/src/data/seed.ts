

/**
 * Reference content, not records.
 *
 * Clips, takes, vocabulary and profiles all live on the server now. What is left
 * here is the dictionary the app looks words up in and the illustrative copy the
 * Progress screen shows — content the app ships with rather than data belonging
 * to anyone.
 */


/** A sentence to say the word in, for the speaking half of memory practice. */
export const EXAMPLES: Record<string, string> = {
  brilliant: 'The team came up with a brilliant plan to fix the bug.',
  honestly: "Honestly, I don't think we have enough time.",
  exactly: "That's exactly what I was thinking.",
  energy: 'She brings so much energy to every rehearsal.',
  'showing up': 'Showing up on time matters more than talking about it.',
  'at the end of the day': 'At the end of the day, we just want the client happy.',
  expect: "I didn't expect the meeting to run so long.",
  'kind of': "It's kind of hard to explain without seeing it.",
}

/** Stand-in for a dictionary / translation API on tapped caption words. */
export const LOOKUP: Record<string, { ipa: string; meaning: string }> = {
  expecting: { ipa: '/ɪkˈspektɪŋ/', meaning: 'anticipating that something will happen' },
  reaction: { ipa: '/riˈækʃən/', meaning: 'a response to something that happens' },
  winning: { ipa: '/ˈwɪnɪŋ/', meaning: 'succeeding or coming first in a contest' },
  showing: { ipa: '/ˈʃəʊɪŋ/', meaning: 'letting something be seen' },
  consistency: { ipa: '/kənˈsɪstənsi/', meaning: 'acting the same way over time' },
  finished: { ipa: '/ˈfɪnɪʃt/', meaning: 'completed; done with something' },
  minute: { ipa: '/ˈmɪnɪt/', meaning: 'a short period of time' },
  little: { ipa: '/ˈlɪtl/', meaning: 'small in size or amount' },
  question: { ipa: '/ˈkwestʃən/', meaning: 'something you ask to get information' },
  worth: { ipa: '/wɜːθ/', meaning: 'deserving of the time or effort' },
  step: { ipa: '/step/', meaning: 'one stage in a process' },
  myself: { ipa: '/maɪˈself/', meaning: 'used to refer back to the speaker' },
  actually: { ipa: '/ˈæktʃuəli/', meaning: 'in fact; really' },
  almost: { ipa: '/ˈɔːlməʊst/', meaning: 'very nearly but not completely' },
  really: { ipa: '/ˈrɪəli/', meaning: 'in actual fact; very' },
}
