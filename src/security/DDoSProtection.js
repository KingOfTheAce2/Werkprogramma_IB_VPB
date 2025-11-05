// Advanced DDoS Protection and Traffic Analysis
import crypto from 'crypto';
import { SecurityLogger } from './SecurityLogger.js';

export class DDoSProtection {
  constructor() {
    this.logger = new SecurityLogger();
    
    // Traffic tracking
    this.requestCounts = new Map(); // IP -> request timestamps
    this.connectionCounts = new Map(); // IP -> connection count
    this.bandwidthUsage = new Map(); // IP -> bytes transferred
    
    // Attack detection
    this.attackPatterns = new Map(); // IP -> attack signatures
    this.blockedIPs = new Map(); // IP -> block info
    this.suspiciousPatterns = new Map(); // Pattern -> count
    
    // Configuration
    this.config = {
      // Rate limits per minute
      maxRequestsPerMinute: 120,
      maxRequestsPerSecond: 5,
      maxConnectionsPerIP: 10,
      maxBandwidthPerIP: 100 * 1024 * 1024, // 100MB per hour
      
      // Attack thresholds
      bruteForceThreshold: 20, // requests per minute
      slowLorisThreshold: 50, // slow connections
      rateLimitThreshold: 200, // requests per minute
      
      // Block durations (milliseconds)
      temporaryBlockDuration: 15 * 60 * 1000, // 15 minutes
      persistentBlockDuration: 24 * 60 * 60 * 1000, // 24 hours
      
      // Cleanup intervals
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      statsRetention: 60 * 60 * 1000 // 1 hour
    };
    
    // Start cleanup process
    this.startCleanupProcess();
  }

  // Main DDoS protection middleware
  protect(req, res, next) {
    const clientIP = this.getClientIP(req);
    const now = Date.now();
    
    try {
      // Check if IP is blocked
      if (this.isBlocked(clientIP)) {
        return this.handleBlockedRequest(req, res, clientIP);
      }

      // Analyze request patterns
      const analysis = this.analyzeRequest(req, clientIP, now);
      
      // Check for attack patterns
      if (analysis.isAttack) {
        return this.handleAttack(req, res, clientIP, analysis);
      }

      // Apply rate limiting
      if (analysis.rateLimited) {
        return this.handleRateLimit(req, res, clientIP, analysis);
      }

      // Track legitimate request
      this.trackLegitimateRequest(clientIP, req, now);
      
      next();
      
    } catch (error) {
      this.logger.logSecurityIncident('DDOS_PROTECTION_ERROR', {
        severity: 'high',
        description: 'DDoS protection system error',
        evidence: { error: error.message }
      }, {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });
      
      next(); // Allow request to continue on error
    }
  }

  // Analyze incoming request for attack patterns
  analyzeRequest(req, clientIP, timestamp) {
    const analysis = {
      isAttack: false,
      rateLimited: false,
      attackType: null,
      severity: 'low',
      confidence: 0,
      recommendations: []
    };

    // Get request history for this IP
    const requests = this.requestCounts.get(clientIP) || [];
    const connections = this.connectionCounts.get(clientIP) || 0;
    const bandwidth = this.bandwidthUsage.get(clientIP) || 0;

    // 1. Rate limiting analysis
    const recentRequests = requests.filter(time => timestamp - time < 60000); // Last minute
    const veryRecentRequests = requests.filter(time => timestamp - time < 1000); // Last second

    if (recentRequests.length > this.config.maxRequestsPerMinute) {
      analysis.rateLimited = true;
      analysis.severity = 'high';
      analysis.confidence = 0.9;
    }

    if (veryRecentRequests.length > this.config.maxRequestsPerSecond) {
      analysis.rateLimited = true;
      analysis.severity = 'high';
      analysis.confidence = 0.95;
    }

    // 2. Brute force detection
    if (recentRequests.length > this.config.bruteForceThreshold) {
      analysis.isAttack = true;
      analysis.attackType = 'brute_force';
      analysis.severity = 'high';
      analysis.confidence = 0.8;
    }

    // 3. Slow Loris attack detection
    if (connections > this.config.slowLorisThreshold) {
      analysis.isAttack = true;
      analysis.attackType = 'slow_loris';
      analysis.severity = 'high';
      analysis.confidence = 0.7;
    }

    // 4. Bandwidth abuse detection
    if (bandwidth > this.config.maxBandwidthPerIP) {
      analysis.isAttack = true;
      analysis.attackType = 'bandwidth_abuse';
      analysis.severity = 'medium';
      analysis.confidence = 0.6;
    }

    // 5. Pattern analysis
    const patterns = this.detectAttackPatterns(req, clientIP, requests);
    if (patterns.length > 0) {
      analysis.isAttack = true;
      analysis.attackType = 'pattern_based';
      analysis.patterns = patterns;
      analysis.confidence = Math.max(analysis.confidence, 0.7);
    }

    // 6. Request signature analysis
    const signature = this.generateRequestSignature(req);
    const signatureCount = this.suspiciousPatterns.get(signature) || 0;
    
    if (signatureCount > 10) { // Same signature repeated many times
      analysis.isAttack = true;
      analysis.attackType = 'signature_replay';
      analysis.confidence = 0.8;
    }

    return analysis;
  }

  // Detect various attack patterns
  detectAttackPatterns(req, clientIP, requestHistory) {
    const patterns = [];
    
    // 1. Rapid fire pattern (many requests in very short time)
    const rapidFire = requestHistory.filter(time => 
      Date.now() - time < 5000 // Last 5 seconds
    );
    
    if (rapidFire.length > 20) {
      patterns.push({
        type: 'rapid_fire',
        count: rapidFire.length,
        timespan: 5000
      });
    }

    // 2. Regular interval pattern (botnet behavior)
    if (requestHistory.length > 10) {
      const intervals = [];
      for (let i = 1; i < requestHistory.length; i++) {
        intervals.push(requestHistory[i] - requestHistory[i-1]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((acc, interval) => 
        acc + Math.pow(interval - avgInterval, 2), 0
      ) / intervals.length;
      
      if (variance < 1000) { // Very regular intervals (low variance)
        patterns.push({
          type: 'regular_interval',
          avgInterval: avgInterval,
          variance: variance
        });
      }
    }

    // 3. Path traversal pattern
    if (req.path.includes('..') || req.path.includes('//')) {
      patterns.push({
        type: 'path_traversal',
        path: req.path
      });
    }

    // 4. SQL injection pattern
    const sqlPatterns = [
      /union[\s]+select/i,
      /drop[\s]+table/i,
      /insert[\s]+into/i,
      /'[\s]*or[\s]*'1'[\s]*=[\s]*'1/i
    ];
    
    const body = JSON.stringify(req.body || {});
    const query = JSON.stringify(req.query || {});
    
    sqlPatterns.forEach(pattern => {
      if (pattern.test(body) || pattern.test(query) || pattern.test(req.path)) {
        patterns.push({
          type: 'sql_injection',
          pattern: pattern.toString()
        });
      }
    });

    // 5. XSS pattern
    const xssPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+[\s]*=/i
    ];
    
    xssPatterns.forEach(pattern => {
      if (pattern.test(body) || pattern.test(query)) {
        patterns.push({
          type: 'xss_attempt',
          pattern: pattern.toString()
        });
      }
    });

    return patterns;
  }

  // Generate unique signature for request
  generateRequestSignature(req) {
    const components = [
      req.method,
      req.path,
      req.get('User-Agent') || '',
      JSON.stringify(req.query || {}),
      Object.keys(req.body || {}).sort().join(',')
    ].join('|');
    
    return crypto.createHash('sha256').update(components).digest('hex').substring(0, 16);
  }

  // Check if IP is currently blocked
  isBlocked(ip) {
    const blockInfo = this.blockedIPs.get(ip);
    
    if (!blockInfo) return false;
    
    if (Date.now() > blockInfo.expiresAt) {
      this.blockedIPs.delete(ip);
      return false;
    }
    
    return true;
  }

  // Handle blocked request
  handleBlockedRequest(req, res, ip) {
    const blockInfo = this.blockedIPs.get(ip);
    
    this.logger.logSecurityIncident('BLOCKED_IP_ACCESS_ATTEMPT', {
      severity: 'high',
      description: 'Blocked IP attempted access',
      evidence: { 
        ip: ip,
        blockReason: blockInfo.reason,
        blockTime: blockInfo.blockedAt,
        attemptsCount: blockInfo.attempts || 1
      }
    }, {
      ip: ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    });

    // Increment attempt counter
    if (blockInfo) {
      blockInfo.attempts = (blockInfo.attempts || 0) + 1;
      
      // Extend block time for persistent attempts
      if (blockInfo.attempts > 5) {
        blockInfo.expiresAt = Date.now() + this.config.persistentBlockDuration;
      }
    }

    res.status(429).json({
      error: 'Access temporarily restricted',
      retryAfter: Math.ceil((blockInfo.expiresAt - Date.now()) / 1000),
      code: 'IP_BLOCKED'
    });
  }

  // Handle detected attack
  handleAttack(req, res, ip, analysis) {
    // Block the IP
    this.blockIP(ip, analysis.attackType, analysis.severity);
    
    this.logger.logSecurityIncident('DDOS_ATTACK_DETECTED', {
      severity: analysis.severity,
      description: `DDoS attack detected: ${analysis.attackType}`,
      evidence: {
        ip: ip,
        attackType: analysis.attackType,
        confidence: analysis.confidence,
        patterns: analysis.patterns || [],
        requestPath: req.path,
        userAgent: req.get('User-Agent')
      },
      requiresManualReview: analysis.severity === 'high'
    }, {
      ip: ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    });

    res.status(429).json({
      error: 'Attack detected - access blocked',
      code: 'ATTACK_DETECTED',
      attackType: analysis.attackType
    });
  }

  // Handle rate limiting
  handleRateLimit(req, res, ip, analysis) {
    this.logger.logSuspiciousActivity('RATE_LIMIT_EXCEEDED', null, {
      ip: ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    }, {
      riskLevel: 'medium',
      requestCount: analysis.requestCount || 0,
      timeWindow: '1 minute'
    });

    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 60,
      code: 'RATE_LIMITED'
    });
  }

  // Block IP address
  blockIP(ip, reason, severity) {
    const duration = severity === 'high' 
      ? this.config.persistentBlockDuration 
      : this.config.temporaryBlockDuration;

    this.blockedIPs.set(ip, {
      reason: reason,
      severity: severity,
      blockedAt: Date.now(),
      expiresAt: Date.now() + duration,
      attempts: 0
    });

    this.logger.logSystemEvent('IP_BLOCKED_DDOS', {
      ip: ip,
      reason: reason,
      severity: severity,
      duration: duration
    });
  }

  // Track legitimate request
  trackLegitimateRequest(ip, req, timestamp) {
    // Update request count
    const requests = this.requestCounts.get(ip) || [];
    requests.push(timestamp);
    this.requestCounts.set(ip, requests);

    // Update connection count
    this.connectionCounts.set(ip, (this.connectionCounts.get(ip) || 0) + 1);

    // Update bandwidth usage (approximate)
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const currentBandwidth = this.bandwidthUsage.get(ip) || 0;
    this.bandwidthUsage.set(ip, currentBandwidth + contentLength);

    // Track request signature
    const signature = this.generateRequestSignature(req);
    const count = this.suspiciousPatterns.get(signature) || 0;
    this.suspiciousPatterns.set(signature, count + 1);
  }

  // Get client IP address
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '0.0.0.0';
  }

  // Cleanup old data
  cleanup() {
    const now = Date.now();
    const retention = this.config.statsRetention;

    // Clean up request counts
    for (const [ip, requests] of this.requestCounts.entries()) {
      const recent = requests.filter(time => now - time < retention);
      if (recent.length === 0) {
        this.requestCounts.delete(ip);
      } else {
        this.requestCounts.set(ip, recent);
      }
    }

    // Reset connection counts periodically
    this.connectionCounts.clear();

    // Clean up bandwidth usage (hourly reset)
    if (now % (60 * 60 * 1000) < this.config.cleanupInterval) {
      this.bandwidthUsage.clear();
    }

    // Clean up expired blocks
    for (const [ip, blockInfo] of this.blockedIPs.entries()) {
      if (now > blockInfo.expiresAt) {
        this.blockedIPs.delete(ip);
        this.logger.logSystemEvent('IP_UNBLOCKED_AUTOMATIC', {
          ip: ip,
          reason: blockInfo.reason,
          blockedDuration: now - blockInfo.blockedAt
        });
      }
    }

    // Clean up old suspicious patterns
    if (this.suspiciousPatterns.size > 1000) {
      this.suspiciousPatterns.clear();
    }
  }

  // Start cleanup process
  startCleanupProcess() {
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  // Get protection status
  getStatus() {
    return {
      blockedIPs: this.blockedIPs.size,
      trackedIPs: this.requestCounts.size,
      totalRequests: Array.from(this.requestCounts.values())
        .reduce((total, requests) => total + requests.length, 0),
      suspiciousPatterns: this.suspiciousPatterns.size,
      config: this.config
    };
  }

  // Whitelist IP (remove from tracking)
  whitelistIP(ip) {
    this.requestCounts.delete(ip);
    this.connectionCounts.delete(ip);
    this.bandwidthUsage.delete(ip);
    this.blockedIPs.delete(ip);
    
    this.logger.logSystemEvent('IP_WHITELISTED', {
      ip: ip,
      reason: 'manual_whitelist'
    });
  }

  // Manually block IP
  manualBlock(ip, reason, duration = this.config.temporaryBlockDuration) {
    this.blockedIPs.set(ip, {
      reason: `manual: ${reason}`,
      severity: 'high',
      blockedAt: Date.now(),
      expiresAt: Date.now() + duration,
      attempts: 0,
      manual: true
    });

    this.logger.logSystemEvent('IP_BLOCKED_MANUAL', {
      ip: ip,
      reason: reason,
      duration: duration
    });
  }
}

// Export global instance
export const ddosProtection = new DDoSProtection();