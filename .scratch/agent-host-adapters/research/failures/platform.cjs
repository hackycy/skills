// Branch observation only; this does not emulate an OS or execute foreign code.
Object.defineProperty(process, 'platform', { value: process.env.STUDY_OS })
Object.defineProperty(process, 'arch', { value: process.env.STUDY_ARCH })
globalThis.fetch = async function (url) {
  process.stderr.write(`STUDY_REQUEST ${url}\n`)
  return { ok: false, status: 404 }
}
