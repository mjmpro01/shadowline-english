

/**
 * Reference content, not records.
 *
 * Clips, takes, vocabulary and profiles all live on the server now. What is left
 * here is the illustrative copy the Progress screen shows and the sentences
 * memory practice says words in — content the app ships with rather than data
 * belonging to anyone.
 *
 * The fifteen-word lookup table that used to live here is gone: tapped words
 * are glossed by the server now, which has an answer for all of them.
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
