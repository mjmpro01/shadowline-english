// A stand-in for 9router during the browser tests: an OpenAI-compatible
// /v1/chat/completions that streams a canned answer.
//
// The answer is built from what it was sent, so a test can tell from the screen
// whether the server gave the tutor the clip on screen: with a clip block in the
// system prompt it quotes the line back, without one it says it has none.
// Real models are not called from tests — they cost money and answer differently
// every time.
import { createServer } from 'node:http'

const port = Number(process.env.FAKE_ROUTER_PORT ?? 8199)
let last = null

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok')
    return
  }
  if (req.method === 'GET' && req.url === '/last') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(last))
    return
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end()
    return
  }

  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    last = { headers: { authorization: req.headers.authorization }, body: JSON.parse(raw) }
    const system = last.body.messages[0]?.content ?? ''
    const question = last.body.messages.at(-1)?.content ?? ''
    const line = /Line: "([^"]+)"/.exec(system)?.[1]

    const answer = line
      ? `You asked: ${question}\n\nThe line is **${line}**. Stress the *second* word.`
      : `You asked: ${question}\n\nNo clip is open, so here is a general tip:\n- keep the **final** sounds`

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    // A few pieces, a little apart, so the stream is a stream.
    const pieces = answer.match(/.{1,12}/gs) ?? [answer]
    let i = 0
    const next = () => {
      if (i === pieces.length) {
        res.end('data: [DONE]\n\n')
        return
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i++] } }] })}\n\n`)
      setTimeout(next, 15)
    }
    next()
  })
}).listen(port)
