// Module options TypeScript interface definition
export type ModuleOptions = {
  litestream?: boolean
  publicStorage?: boolean
  privateStorage?: boolean
}

export type FlyProxyHeaders = {
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

export type FlyProxyInfo = {
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
