import { describe, expect, it } from 'vitest'
import { translator } from '../src/i18n'
import { en } from '../src/i18n/en'
import { vi } from '../src/i18n/vi'
import { ApiError } from '../src/lib/api'
import { explain, takeProblem } from '../src/lib/errors'

const tEn = translator(en)
const tVi = translator(vi)

describe('explain', () => {
  it('says a coded error in the learner’s language', () => {
    const err = new ApiError(401, 'wrong email or password', 'login.wrong')
    expect(explain(err, tEn, 'x')).toBe('Wrong email or password.')
    expect(explain(err, tVi, 'x')).toBe('Sai email hoặc mật khẩu.')
  })

  it('puts the wait the server asked for into the tutor’s refusals', () => {
    expect(explain(new ApiError(429, 'busy', 'tutor.window', 42), tVi, 'x')).toContain('42 giây')
    expect(explain(new ApiError(429, 'today', 'tutor.day', 3 * 3600), tEn, 'x')).toContain('about 3 hours')
    expect(explain(new ApiError(429, 'today', 'tutor.day', 3000), tEn, 'x')).toContain('about 1 hour.')
  })

  it('keeps the server’s words for a code it does not know', () => {
    expect(explain(new ApiError(400, 'something new', 'brand.new'), tVi, 'x')).toBe('something new')
    expect(explain(new ApiError(400, 'no code at all'), tVi, 'x')).toBe('no code at all')
  })

  it('names a missing network, and falls back for anything that is not an API error', () => {
    expect(explain(new ApiError(0, 'Could not reach the server.'), tVi, 'x')).toBe(vi['error.network'])
    expect(explain(new TypeError('boom'), tVi, 'dự phòng')).toBe('dự phòng')
  })
})

describe('takeProblem', () => {
  it('translates the scorer’s reasons, and passes through ones it does not know', () => {
    expect(takeProblem('no speech found in the recording', tVi)).toBe('Không tìm thấy giọng nói trong bản ghi')
    expect(takeProblem('could not read the recording: decoding timed out', tEn)).toBe('The recording could not be read')
    expect(takeProblem('scoring failed', tVi)).toBe('Chưa chấm xong')
    expect(takeProblem('a reason from tomorrow', tVi)).toBe('a reason from tomorrow')
    expect(takeProblem(null, tVi)).toBeNull()
  })
})
