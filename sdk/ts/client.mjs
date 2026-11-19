export function chatPayload(model, messages, extra = {}) {
  const body = { model, messages }
  for (const key of ["provider", "models", "preset", "temperature"]) {
    if (extra[key] !== undefined) body[key] = extra[key]
  }
  return body
}

export function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}` }
}
