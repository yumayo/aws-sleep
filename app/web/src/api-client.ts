const getCookieValue = (name: string): string | undefined => {
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined
}

export const fetchWithCsrf = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers)
  const csrfToken = getCookieValue('csrf_token')

  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  return fetch(input, {
    ...init,
    headers
  })
}
