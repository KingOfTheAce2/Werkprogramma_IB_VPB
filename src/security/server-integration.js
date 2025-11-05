// Server Integration for Maximum Security System
import express from 'express';
import { securitySystem } from './index.js';

export class SecurityServerIntegration {
  constructor(app) {
    this.app = app;
    this.securitySystem = securitySystem;
  }

  // Apply all security middleware to Express app
  async applySecurityMiddleware() {
    console.log('🔧 Applying security middleware to server...');

    // 1. Initialize security system first
    await this.securitySystem.initialize();

    // 2. Apply security headers and HTTPS enforcement
    this.app.use(this.securitySystem.middleware.enforceHTTPS);
    this.app.use(this.securitySystem.middleware.setAdvancedSecurityHeaders);

    // 3. Apply DDoS protection (highest priority)
    this.app.use((req, res, next) => {
      this.securitySystem.ddosProtection.protect(req, res, next);
    });

    // 4. Apply IP reputation and request monitoring
    this.app.use(this.securitySystem.middleware.checkIPReputation);
    this.app.use(this.securitySystem.middleware.monitorRequestFrequency);
    this.app.use(this.securitySystem.middleware.validateUserAgent);

    // 5. Apply honeypot traps
    this.app.use(this.securitySystem.middleware.honeypotTrap);

    // 6. Apply request size limiting
    this.app.use(this.securitySystem.middleware.limitRequestSize());

    // 7. Apply input validation
    this.app.use((req, res, next) => {
      this.securitySystem.validator.validateRequest(req, res, next);
    });

    // 8. Apply timing protection
    this.app.use(this.securitySystem.middleware.addTimingProtection);

    console.log('✅ Security middleware applied to server');

    // Set up security monitoring hooks
    this.setupSecurityHooks();
  }

  // Set up security monitoring hooks
  setupSecurityHooks() {
    // Monitor all incoming requests
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        // Track API call
        this.securitySystem.monitor.trackAPICall(
          req.method,
          req.path,
          res.statusCode,
          responseTime,
          req.user
        );
        
        // Track data access if applicable
        if (req.user && req.path.includes('/api/')) {
          const isSensitive = this.isSensitiveEndpoint(req.path);
          const operation = this.getDataOperation(req.method);
          
          this.securitySystem.monitor.trackDataAccess(
            operation,
            'api_endpoint',
            isSensitive,
            req.user,
            {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              sessionId: req.sessionID
            }
          );
        }
      });
      
      next();
    });
  }

  // Check if endpoint handles sensitive data
  isSensitiveEndpoint(path) {
    const sensitivePatterns = [
      '/api/auditcase/clients',
      '/api/documents',
      '/api/me',
      '/api/users'
    ];
    
    return sensitivePatterns.some(pattern => path.includes(pattern));
  }

  // Get data operation type from HTTP method
  getDataOperation(method) {
    switch (method.toUpperCase()) {
      case 'GET': return 'read';
      case 'POST': return 'write';
      case 'PUT': return 'write';
      case 'PATCH': return 'write';
      case 'DELETE': return 'delete';
      default: return 'unknown';
    }
  }

  // Apply authentication security enhancements
  enhanceAuthenticationSecurity(authMiddleware) {
    return (req, res, next) => {
      // Track login attempts
      if (req.path === '/api/login') {
        const originalSend = res.send;
        res.send = function(data) {
          const response = typeof data === 'string' ? JSON.parse(data) : data;
          const success = !response.error;
          
          securitySystem.monitor.trackLogin(
            success,
            {
              id: req.body?.username,
              username: req.body?.username,
              email: req.body?.email || null
            },
            {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              sessionId: req.sessionID
            },
            success ? 'low' : 'medium'
          );
          
          return originalSend.call(this, data);
        };
      }
      
      authMiddleware(req, res, next);
    };
  }

  // Set up security API endpoints
  setupSecurityEndpoints() {
    // Security dashboard
    this.app.get('/api/security/dashboard', (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const dashboard = this.securitySystem.getSecurityDashboard();
      res.json(dashboard);
    });

    // Security status
    this.app.get('/api/security/status', (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const status = this.securitySystem.getSecurityStatus();
      res.json(status);
    });

    // Trigger security audit
    this.app.post('/api/security/audit', async (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      try {
        const auditResults = await this.securitySystem.auditor.runFullAudit();
        res.json(auditResults);
      } catch (error) {
        res.status(500).json({ 
          error: 'Security audit failed',
          message: error.message 
        });
      }
    });

    // Block IP manually
    this.app.post('/api/security/block-ip', (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { ip, reason, duration } = req.body;
      
      if (!ip || !reason) {
        return res.status(400).json({ error: 'IP and reason required' });
      }
      
      this.securitySystem.ddosProtection.manualBlock(ip, reason, duration);
      res.json({ success: true, message: `IP ${ip} blocked` });
    });

    // Unblock IP manually  
    this.app.post('/api/security/unblock-ip', (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { ip } = req.body;
      
      if (!ip) {
        return res.status(400).json({ error: 'IP address required' });
      }
      
      this.securitySystem.middleware.unblockIP(ip);
      this.securitySystem.ddosProtection.whitelistIP(ip);
      res.json({ success: true, message: `IP ${ip} unblocked` });
    });

    // Acknowledge alert
    this.app.post('/api/security/alerts/:alertId/acknowledge', (req, res) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { alertId } = req.params;
      
      this.securitySystem.monitor.acknowledgeAlert(alertId, req.user.id);
      res.json({ success: true, message: 'Alert acknowledged' });
    });

    console.log('🔗 Security API endpoints configured');
  }

  // Handle security emergencies
  setupEmergencyHandlers() {
    // Graceful shutdown on critical security events
    this.securitySystem.monitor.on('security_alert', (alert) => {
      if (alert.severity === 'critical' && alert.type === 'SYSTEM_COMPROMISE') {
        console.log('🚨 CRITICAL SECURITY ALERT - INITIATING EMERGENCY SHUTDOWN');
        this.securitySystem.emergencyShutdown(alert.details);
      }
    });

    // Handle uncaught exceptions securely
    process.on('uncaughtException', (error) => {
      console.error('💥 UNCAUGHT EXCEPTION:', error);
      
      this.securitySystem.logger.logSecurityIncident('UNCAUGHT_EXCEPTION', {
        severity: 'critical',
        description: 'Uncaught exception in application',
        evidence: { error: error.message, stack: error.stack },
        requiresManualReview: true
      }, { ip: 'system', userAgent: 'process' });
      
      // Graceful shutdown
      setTimeout(() => process.exit(1), 1000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 UNHANDLED REJECTION:', reason);
      
      this.securitySystem.logger.logSecurityIncident('UNHANDLED_REJECTION', {
        severity: 'high',
        description: 'Unhandled promise rejection',
        evidence: { reason: reason, promise: promise.toString() },
        requiresManualReview: true
      }, { ip: 'system', userAgent: 'process' });
    });
  }

  // Create secure server configuration
  static createSecureServerConfig() {
    return {
      // Trust proxy for proper IP detection
      trustProxy: process.env.TRUST_PROXY === 'true',
      
      // Disable x-powered-by header
      xPoweredBy: false,
      
      // Set secure server limits
      limits: {
        fieldNameSize: 100,
        fieldSize: 1024 * 1024, // 1MB
        fields: 20,
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5,
        parts: 10
      }
    };
  }

  // Start security system
  async start() {
    try {
      console.log('🚀 Starting Maximum Security Server Integration...');
      
      // Apply all security middleware
      await this.applySecurityMiddleware();
      
      // Set up security endpoints
      this.setupSecurityEndpoints();
      
      // Set up emergency handlers
      this.setupEmergencyHandlers();
      
      console.log('🛡️ MAXIMUM SECURITY INTEGRATION COMPLETE');
      console.log('🎯 All security systems operational');
      console.log(`🚨 Threat Level: ${this.securitySystem.threatLevel}`);
      console.log(`🔒 Security Level: ${this.securitySystem.securityLevel}`);
      
      // Log successful security startup
      this.securitySystem.logger.logSystemEvent('SECURITY_INTEGRATION_COMPLETE', {
        timestamp: new Date().toISOString(),
        securityLevel: this.securitySystem.securityLevel,
        threatLevel: this.securitySystem.threatLevel,
        componentsActive: 8
      });
      
    } catch (error) {
      console.error('💥 SECURITY INTEGRATION FAILED:', error);
      throw error;
    }
  }
}

export default SecurityServerIntegration;