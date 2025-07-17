export interface FlyProxyHeaders {
  /** Client IP Address from Fly Proxy perspective */
  clientIP?: string
  /** Original connection port that client connected to */
  forwardedPort?: string
  /** Three letter region code where connection was accepted */
  region?: string
  /** Comma separated list of IP addresses (client + proxies) */
  forwardedFor?: string
  /** Original client protocol: 'http' or 'https' */
  forwardedProto?: 'http' | 'https'
  /** Original connection port set by client */
  forwardedPortClient?: string
  /** SSL status: 'on' or 'off' */
  forwardedSSL?: 'on' | 'off'
  /** Proxy route path and protocols used */
  via?: string
}

export interface FlyProxyInfo {
  /** All Fly Proxy headers */
  headers: FlyProxyHeaders
  /** Client IP address (prioritizes Fly-Client-IP over X-Forwarded-For) */
  clientIP: string | null
  /** Region where the request was processed */
  region: string | null
  /** Whether the connection used SSL */
  isSSL: boolean
  /** Original protocol used by client */
  protocol: 'http' | 'https' | null
  /** Port the client connected to */
  port: string | null
  /** Parse X-Forwarded-For header to get client and proxy IPs */
  getForwardedIPs(): string[]
  /** Check if request is from a specific region */
  isFromRegion(regionCode: string): boolean
  /** Get the original client IP from X-Forwarded-For (first IP) */
  getOriginalClientIP(): string | null
}

/**
 * Parse Fly Proxy headers from a headers object
 * @param headers - Headers object (e.g., from request.headers)
 */
export function parseFlyProxyHeaders(headers: Record<string, string | string[] | undefined>): FlyProxyInfo {
  // Normalize headers to lowercase and handle arrays
  const normalizedHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] || '' : value
    }
  }

  const flyHeaders: FlyProxyHeaders = {
    clientIP: normalizedHeaders['fly-client-ip'],
    forwardedPort: normalizedHeaders['fly-forwarded-port'],
    region: normalizedHeaders['fly-region'],
    forwardedFor: normalizedHeaders['x-forwarded-for'],
    forwardedProto: normalizedHeaders['x-forwarded-proto'] as 'http' | 'https' | undefined,
    forwardedPortClient: normalizedHeaders['x-forwarded-port'],
    forwardedSSL: normalizedHeaders['x-forwarded-ssl'] as 'on' | 'off' | undefined,
    via: normalizedHeaders['via'],
  }

  // Helper to get client IP (prioritize Fly-Client-IP)
  const getClientIP = (): string | null => {
    if (flyHeaders.clientIP) {
      return flyHeaders.clientIP
    }
    
    // Fallback to first IP in X-Forwarded-For
    if (flyHeaders.forwardedFor) {
      const ips = flyHeaders.forwardedFor.split(',').map(ip => ip.trim())
      return ips[0] || null
    }
    
    return null
  }

  // Helper to parse X-Forwarded-For header
  const getForwardedIPs = (): string[] => {
    if (!flyHeaders.forwardedFor) return []
    return flyHeaders.forwardedFor.split(',').map(ip => ip.trim()).filter(Boolean)
  }

  // Helper to check if request is from specific region
  const isFromRegion = (regionCode: string): boolean => {
    return flyHeaders.region?.toLowerCase() === regionCode.toLowerCase()
  }

  // Helper to get original client IP from X-Forwarded-For
  const getOriginalClientIP = (): string | null => {
    const ips = getForwardedIPs()
    return ips.length > 0 ? (ips[0] || null) : null
  }

  return {
    headers: flyHeaders,
    clientIP: getClientIP(),
    region: flyHeaders.region || null,
    isSSL: flyHeaders.forwardedSSL === 'on' || flyHeaders.forwardedProto === 'https',
    protocol: flyHeaders.forwardedProto || null,
    port: flyHeaders.forwardedPort || flyHeaders.forwardedPortClient || null,
    getForwardedIPs,
    isFromRegion,
    getOriginalClientIP,
  }
}

/**
 * Composable for accessing Fly Proxy headers and utilities
 * Provides easy access to client IP, region, SSL status, and other proxy information
 * 
 * Note: This composable works best when used in server-side contexts where headers are available.
 * On the client-side, it will return empty values.
 */
export function useFlyProxy(): FlyProxyInfo {
  // Default empty headers for client-side or when headers are not available
  let headers: Record<string, string> = {}
  
  // Try to get headers if we're on the server
  if (typeof window === 'undefined') {
    try {
      // This will work in Nuxt 3 contexts where useRequestHeaders is auto-imported
      const requestHeaders = (globalThis as any).useRequestHeaders?.() || {}
      headers = requestHeaders
    } catch {
      // Fallback: headers will remain empty
    }
  }

  return parseFlyProxyHeaders(headers)
}

/**
 * Server-only composable for accessing Fly Proxy headers
 * Throws an error if used on client-side
 */
export function useFlyProxyServer(): FlyProxyInfo {
  if (typeof window !== 'undefined') {
    throw new Error('useFlyProxyServer() can only be used on the server-side')
  }
  
  return useFlyProxy()
}

/**
 * Use Fly Proxy headers from a Nuxt event handler
 * @param event - H3 event object from defineEventHandler
 */
export function useFlyProxyFromEvent(event: any): FlyProxyInfo {
  const headers = event?.node?.req?.headers || {}
  return parseFlyProxyHeaders(headers)
}

export default useFlyProxy