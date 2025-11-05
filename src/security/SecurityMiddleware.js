// Advanced Security Middleware Collection
import crypto from 'crypto';
import { SecurityLogger } from './SecurityLogger.js';

export class SecurityMiddleware {
  constructor() {
    this.logger = new SecurityLogger();
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    this.requestCounts = new Map();
  }

  // Enhanced HTTPS enforcement
  enforceHTTPS(req, res, next) {
    if (process.env.NODE_ENV === 'production') {
      if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
        this.logger.logSecurityIncident('HTTP_REDIRECT_ATTEMPT', {
          severity: 'low',
          description: 'HTTP request redirected to HTTPS',
          evidence: { 
            originalUrl: req.url,
            protocol: req.protocol,
            headers: req.headers
          }
        }, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        });

        return res.redirect(301, `https://${req.get('host')}${req.url}`);
      }
    }
    next();
  }

  // Advanced security headers
  setAdvancedSecurityHeaders(req, res, next) {
    // Content Security Policy with nonce
    const nonce = crypto.randomBytes(16).toString('base64');
    req.cspNonce = nonce;

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'nonce-${nonce}' https://cdn.tailwindcss.com https://alcdn.msauth.net`,
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://login.microsoftonline.com https://*.microsoftonline.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);

    // Additional security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // HSTS with preload
    if (req.secure || req.get('x-forwarded-proto') === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Feature Policy / Permissions Policy
    const permissions = [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()',
      'fullscreen=(self)',
      'picture-in-picture=()'
    ].join(', ');
    
    res.setHeader('Permissions-Policy', permissions);

    // Cross-Origin policies
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    next();
  }

  // IP blocking and reputation check
  checkIPReputation(req, res, next) {
    const clientIP = req.ip;

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      this.logger.logSecurityIncident('BLOCKED_IP_ACCESS_ATTEMPT', {
        severity: 'high',
        description: 'Blocked IP attempted access',
        evidence: { ip: clientIP }
      }, {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });

      return res.status(403).json({
        error: 'Access forbidden',
        code: 'IP_BLOCKED'
      });
    }

    // Track suspicious activity
    const suspicious = this.suspiciousIPs.get(clientIP) || { count: 0, firstSeen: Date.now() };
    
    // Reset counter if it's been more than 1 hour
    if (Date.now() - suspicious.firstSeen > 60 * 60 * 1000) {
      suspicious.count = 0;
      suspicious.firstSeen = Date.now();
    }

    this.suspiciousIPs.set(clientIP, suspicious);

    next();
  }

  // Request size limiting
  limitRequestSize(maxSize = 10 * 1024 * 1024) { // 10MB default
    return (req, res, next) => {
      const contentLength = parseInt(req.get('Content-Length') || '0');
      
      if (contentLength > maxSize) {
        this.logger.logSuspiciousActivity('OVERSIZED_REQUEST', 
          { id: req.user?.id },
          { ip: req.ip, userAgent: req.get('User-Agent') },
          { 
            contentLength: contentLength,
            maxSize: maxSize,
            riskLevel: 'medium'
          }
        );

        return res.status(413).json({
          error: 'Request too large',
          maxSize: maxSize
        });
      }

      next();
    };
  }

  // Method filtering
  allowedMethods(methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    return (req, res, next) => {
      if (!methods.includes(req.method)) {
        this.logger.logSuspiciousActivity('DISALLOWED_METHOD', 
          { id: req.user?.id },
          { ip: req.ip, userAgent: req.get('User-Agent') },
          { 
            method: req.method,
            allowedMethods: methods,
            riskLevel: 'low'
          }
        );

        return res.status(405).json({
          error: 'Method not allowed',
          allowed: methods
        });
      }

      next();
    };
  }

  // Request frequency monitoring
  monitorRequestFrequency(req, res, next) {
    const clientIP = req.ip;
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minute window
    
    const requests = this.requestCounts.get(clientIP) || [];
    
    // Remove old requests outside the window
    const recentRequests = requests.filter(time => now - time < windowSize);
    
    // Add current request
    recentRequests.push(now);
    this.requestCounts.set(clientIP, recentRequests);

    // Check for suspicious frequency (more than 100 requests per minute)
    if (recentRequests.length > 100) {
      const suspicious = this.suspiciousIPs.get(clientIP) || { count: 0, firstSeen: Date.now() };
      suspicious.count++;
      this.suspiciousIPs.set(clientIP, suspicious);

      this.logger.logSuspiciousActivity('HIGH_REQUEST_FREQUENCY', 
        { id: req.user?.id },
        { ip: req.ip, userAgent: req.get('User-Agent') },
        { 
          requestCount: recentRequests.length,
          windowSize: windowSize,
          riskLevel: 'high'
        }
      );

      // Temporarily block if too many high-frequency incidents
      if (suspicious.count > 3) {
        this.blockIP(clientIP, 'high_request_frequency');
        return res.status(429).json({
          error: 'Request frequency too high - IP temporarily blocked',
          retryAfter: 300 // 5 minutes
        });
      }
    }

    next();
  }

  // User Agent validation
  validateUserAgent(req, res, next) {
    const userAgent = req.get('User-Agent');
    
    if (!userAgent || userAgent.length < 5) {
      this.logger.logSuspiciousActivity('MISSING_OR_SHORT_USER_AGENT', 
        { id: req.user?.id },
        { ip: req.ip, userAgent: userAgent },
        { riskLevel: 'medium' }
      );
    }

    // Check for suspicious user agent patterns
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python-requests/i,
      /libwww/i,
      /lwp-trivial/i,
      /^$/,
      /bot/i,
      /crawler/i,
      /spider/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(userAgent || '')
    );

    if (isSuspicious) {
      this.logger.logSuspiciousActivity('SUSPICIOUS_USER_AGENT', 
        { id: req.user?.id },
        { ip: req.ip, userAgent: userAgent },
        { 
          patterns: suspiciousPatterns.filter(p => p.test(userAgent || '')),
          riskLevel: 'medium'
        }
      );

      // Don't block immediately, but track for patterns
      const suspicious = this.suspiciousIPs.get(req.ip) || { count: 0, firstSeen: Date.now() };
      suspicious.count++;
      this.suspiciousIPs.set(req.ip, suspicious);
    }

    next();
  }

  // Request timing attack protection
  addTimingProtection(req, res, next) {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      
      // Log unusually fast responses (potential timing attacks)
      if (duration < 10) {
        this.logger.logSuspiciousActivity('SUSPICIOUSLY_FAST_RESPONSE', 
          { id: req.user?.id },
          { ip: req.ip, userAgent: req.get('User-Agent') },
          { 
            duration: duration,
            endpoint: req.path,
            riskLevel: 'low'
          }
        );
      }
    });

    next();
  }

  // Honeypot middleware
  honeypotTrap(req, res, next) {
    // Check for access to common honeypot paths
    const honeypotPaths = [
      '/admin',
      '/wp-admin',
      '/phpmyadmin',
      '/.env',
      '/config.php',
      '/database.sql',
      '/backup.zip'
    ];

    if (honeypotPaths.some(path => req.path.startsWith(path))) {
      this.logger.logSecurityIncident('HONEYPOT_TRIGGERED', {
        severity: 'high',
        description: 'Honeypot path accessed',
        evidence: { 
          path: req.path,
          method: req.method
        },
        requiresManualReview: true
      }, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });

      // Block IP and return fake 404
      this.blockIP(req.ip, 'honeypot_access');
      return res.status(404).json({ error: 'Not found' });
    }

    next();
  }

  // Block IP address
  blockIP(ip, reason) {
    this.blockedIPs.add(ip);
    
    this.logger.logSecurityIncident('IP_BLOCKED', {
      severity: 'medium',
      description: 'IP address blocked',
      evidence: { ip: ip, reason: reason }
    }, {
      ip: ip,
      userAgent: 'system',
      sessionId: 'system'
    });

    // Auto-unblock after 1 hour
    setTimeout(() => {
      this.blockedIPs.delete(ip);
      this.logger.logSystemEvent('IP_UNBLOCKED', {
        ip: ip,
        reason: 'automatic_timeout'
      });
    }, 60 * 60 * 1000);
  }

  // Unblock IP address
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    
    this.logger.logSystemEvent('IP_UNBLOCKED', {
      ip: ip,
      reason: 'manual_unblock'
    });
  }

  // Get security status
  getSecurityStatus() {
    return {
      blockedIPs: Array.from(this.blockedIPs),
      suspiciousIPs: Object.fromEntries(this.suspiciousIPs),
      totalRequests: Array.from(this.requestCounts.values())
        .reduce((total, requests) => total + requests.length, 0)
    };
  }

  // Clean up old data
  cleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Clean up old request counts
    for (const [ip, requests] of this.requestCounts.entries()) {
      const recent = requests.filter(time => now - time < oneHour);
      if (recent.length === 0) {
        this.requestCounts.delete(ip);
      } else {
        this.requestCounts.set(ip, recent);
      }
    }

    // Clean up old suspicious IP data
    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now - data.firstSeen > oneHour) {
        this.suspiciousIPs.delete(ip);
      }
    }
  }
}

// Global security middleware instance
export const securityMiddleware = new SecurityMiddleware();

// Auto-cleanup every 10 minutes
setInterval(() => {
  securityMiddleware.cleanup();
}, 10 * 60 * 1000);