// Advanced Security Logging and Monitoring System

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import crypto from 'crypto';

export class SecurityLogger {
  constructor() {
    this.setupLoggers();
    this.alertThresholds = {
      failedLogins: 5,
      suspiciousActivities: 3,
      dataAccessAttempts: 10
    };
    this.alertNotifications = new Map();
  }

  setupLoggers() {
    // Security Events Logger
    this.securityLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            eventId: this.generateEventId(),
            ...meta
          });
        })
      ),
      defaultMeta: { service: 'werkprogramma-security' },
      transports: [
        new DailyRotateFile({
          filename: 'logs/security-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '90d',
          auditFile: 'logs/security-audit.json'
        }),
        new DailyRotateFile({
          filename: 'logs/security-error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '100m',
          maxFiles: '90d'
        })
      ]
    });

    // Access Logger for Audit Trail
    this.accessLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new DailyRotateFile({
          filename: 'logs/access-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '365d', // Keep access logs for 1 year
          auditFile: 'logs/access-audit.json'
        })
      ]
    });

    // System Logger for Performance and Errors
    this.systemLogger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.simple()
      ),
      transports: [
        new winston.transports.Console({
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        }),
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: '30d'
        })
      ]
    });
  }

  generateEventId() {
    return crypto.randomBytes(8).toString('hex');
  }

  // Authentication Events
  logLoginAttempt(result, userInfo, requestInfo) {
    const event = {
      type: 'AUTH_LOGIN_ATTEMPT',
      success: result.success,
      userId: result.success ? userInfo.id : null,
      username: userInfo.username,
      email: userInfo.email,
      authMethod: userInfo.authMethod || 'password',
      mfaUsed: userInfo.mfaUsed || false,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      location: requestInfo.location,
      sessionId: requestInfo.sessionId,
      failureReason: result.success ? null : result.error,
      riskAssessment: requestInfo.riskAssessment || null
    };

    this.securityLogger.info('Login attempt', event);

    if (!result.success) {
      this.trackFailedLogin(userInfo.username, requestInfo.ip);
    }

    return event;
  }

  logLogout(userInfo, requestInfo) {
    const event = {
      type: 'AUTH_LOGOUT',
      userId: userInfo.id,
      username: userInfo.username,
      sessionId: requestInfo.sessionId,
      sessionDuration: requestInfo.sessionDuration,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      logoutType: requestInfo.logoutType || 'user_initiated'
    };

    this.securityLogger.info('User logout', event);
    return event;
  }

  logPasswordChange(userInfo, requestInfo) {
    const event = {
      type: 'AUTH_PASSWORD_CHANGE',
      userId: userInfo.id,
      username: userInfo.username,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      triggeredBy: requestInfo.triggeredBy || 'user',
      passwordStrength: requestInfo.passwordStrength
    };

    this.securityLogger.warn('Password change', event);
    return event;
  }

  logMFAEvent(eventType, userInfo, requestInfo) {
    const event = {
      type: `AUTH_MFA_${eventType.toUpperCase()}`,
      userId: userInfo.id,
      username: userInfo.username,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      success: requestInfo.success,
      attempts: requestInfo.attempts || 1
    };

    this.securityLogger.info('MFA event', event);
    return event;
  }

  // Data Access Events
  logDataAccess(userInfo, dataInfo, requestInfo) {
    const event = {
      type: 'DATA_ACCESS',
      userId: userInfo.id,
      username: userInfo.username,
      role: userInfo.role,
      dataType: dataInfo.type,
      resourceId: dataInfo.resourceId,
      clientNumber: dataInfo.clientNumber,
      fiscalYear: dataInfo.fiscalYear,
      action: dataInfo.action, // read, write, delete, download
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      timestamp: new Date().toISOString()
    };

    this.accessLogger.info('Data access', event);
    
    // Track sensitive data access
    if (dataInfo.sensitive) {
      this.trackSensitiveAccess(userInfo.id, requestInfo.ip);
    }

    return event;
  }

  logDocumentOperation(userInfo, documentInfo, requestInfo) {
    const event = {
      type: 'DOCUMENT_OPERATION',
      userId: userInfo.id,
      username: userInfo.username,
      operation: documentInfo.operation, // upload, download, delete, rollover
      documentId: documentInfo.id,
      documentName: documentInfo.name,
      documentCategory: documentInfo.category,
      clientNumber: documentInfo.clientNumber,
      fiscalYear: documentInfo.fiscalYear,
      auditCasePath: documentInfo.auditCasePath,
      fileSize: documentInfo.size,
      mimeType: documentInfo.mimeType,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId
    };

    this.accessLogger.info('Document operation', event);
    return event;
  }

  // Security Incidents
  logSecurityIncident(incidentType, details, requestInfo) {
    const event = {
      type: 'SECURITY_INCIDENT',
      incidentType: incidentType,
      severity: details.severity || 'medium',
      description: details.description,
      affectedUser: details.userId,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      evidence: details.evidence || {},
      automaticResponse: details.automaticResponse || null,
      requiresManualReview: details.requiresManualReview || false
    };

    this.securityLogger.error('Security incident', event);
    
    // Trigger alerts for high severity incidents
    if (details.severity === 'high' || details.severity === 'critical') {
      this.triggerSecurityAlert(event);
    }

    return event;
  }

  logSuspiciousActivity(activityType, userInfo, requestInfo, details = {}) {
    const event = {
      type: 'SUSPICIOUS_ACTIVITY',
      activityType: activityType,
      userId: userInfo?.id,
      username: userInfo?.username,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      riskLevel: details.riskLevel || 'medium',
      indicators: details.indicators || [],
      automaticActions: details.automaticActions || [],
      ...details
    };

    this.securityLogger.warn('Suspicious activity detected', event);
    this.trackSuspiciousActivity(requestInfo.ip, userInfo?.id);
    
    return event;
  }

  // System Events
  logSystemEvent(eventType, details) {
    const event = {
      type: 'SYSTEM_EVENT',
      eventType: eventType,
      timestamp: new Date().toISOString(),
      ...details
    };

    this.systemLogger.info('System event', event);
    return event;
  }

  logAPICall(method, endpoint, userInfo, requestInfo, responseInfo) {
    const event = {
      type: 'API_CALL',
      method: method,
      endpoint: endpoint,
      userId: userInfo?.id,
      username: userInfo?.username,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      sessionId: requestInfo.sessionId,
      statusCode: responseInfo.statusCode,
      responseTime: responseInfo.responseTime,
      dataSize: responseInfo.dataSize,
      errorMessage: responseInfo.error || null
    };

    this.accessLogger.info('API call', event);
    return event;
  }

  // Tracking and Alert Systems
  trackFailedLogin(username, ip) {
    const key = `failed_login:${ip}:${username}`;
    const current = this.alertNotifications.get(key) || { count: 0, firstAttempt: Date.now() };
    current.count++;
    current.lastAttempt = Date.now();
    
    this.alertNotifications.set(key, current);

    if (current.count >= this.alertThresholds.failedLogins) {
      this.triggerBruteForceAlert(username, ip, current);
    }

    // Clean up old entries (after 1 hour)
    setTimeout(() => {
      this.alertNotifications.delete(key);
    }, 60 * 60 * 1000);
  }

  trackSuspiciousActivity(ip, userId) {
    const key = `suspicious:${ip}:${userId || 'anonymous'}`;
    const current = this.alertNotifications.get(key) || { count: 0, firstActivity: Date.now() };
    current.count++;
    current.lastActivity = Date.now();
    
    this.alertNotifications.set(key, current);

    if (current.count >= this.alertThresholds.suspiciousActivities) {
      this.triggerSuspiciousActivityAlert(ip, userId, current);
    }
  }

  trackSensitiveAccess(userId, ip) {
    const key = `sensitive_access:${userId}:${ip}`;
    const current = this.alertNotifications.get(key) || { count: 0, firstAccess: Date.now() };
    current.count++;
    current.lastAccess = Date.now();
    
    this.alertNotifications.set(key, current);

    if (current.count >= this.alertThresholds.dataAccessAttempts) {
      this.triggerDataAccessAlert(userId, ip, current);
    }
  }

  // Alert Triggers
  triggerSecurityAlert(event) {
    const alert = {
      alertId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: 'SECURITY_ALERT',
      severity: event.severity || 'high',
      event: event,
      requiresImmedateAttention: event.severity === 'critical'
    };

    this.securityLogger.error('SECURITY ALERT TRIGGERED', alert);
    
    // In production, this would trigger:
    // - Email/SMS notifications to security team
    // - Integration with SIEM systems
    // - Automatic incident creation
    // - Slack/Teams notifications
    
    console.error('🚨 SECURITY ALERT:', alert);
    return alert;
  }

  triggerBruteForceAlert(username, ip, attempts) {
    const alert = {
      alertId: this.generateEventId(),
      type: 'BRUTE_FORCE_DETECTED',
      severity: 'high',
      username: username,
      sourceIP: ip,
      attemptCount: attempts.count,
      timespan: Date.now() - attempts.firstAttempt,
      recommendedAction: 'IP_BLOCK_TEMPORARY'
    };

    this.triggerSecurityAlert(alert);
    return alert;
  }

  triggerSuspiciousActivityAlert(ip, userId, activity) {
    const alert = {
      alertId: this.generateEventId(),
      type: 'SUSPICIOUS_ACTIVITY_PATTERN',
      severity: 'medium',
      userId: userId,
      sourceIP: ip,
      activityCount: activity.count,
      timespan: Date.now() - activity.firstActivity,
      recommendedAction: 'ENHANCED_MONITORING'
    };

    this.triggerSecurityAlert(alert);
    return alert;
  }

  triggerDataAccessAlert(userId, ip, access) {
    const alert = {
      alertId: this.generateEventId(),
      type: 'EXCESSIVE_DATA_ACCESS',
      severity: 'medium',
      userId: userId,
      sourceIP: ip,
      accessCount: access.count,
      timespan: Date.now() - access.firstAccess,
      recommendedAction: 'REVIEW_USER_PERMISSIONS'
    };

    this.triggerSecurityAlert(alert);
    return alert;
  }

  // Query and Analysis Methods
  async getSecurityEvents(filters = {}) {
    // In production, this would query a proper database
    // For now, we'll provide the interface
    return {
      events: [],
      totalCount: 0,
      filters: filters
    };
  }

  async generateSecurityReport(timeframe = '24h') {
    const report = {
      reportId: this.generateEventId(),
      timeframe: timeframe,
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: 0,
        loginAttempts: { successful: 0, failed: 0 },
        dataAccess: { read: 0, write: 0, delete: 0 },
        securityIncidents: { low: 0, medium: 0, high: 0, critical: 0 },
        suspiciousActivities: 0
      },
      topRisks: [],
      recommendations: []
    };

    this.systemLogger.info('Security report generated', { reportId: report.reportId });
    return report;
  }

  // Compliance Logging
  logComplianceEvent(eventType, details) {
    const event = {
      type: 'COMPLIANCE_EVENT',
      eventType: eventType,
      timestamp: new Date().toISOString(),
      regulation: details.regulation, // GDPR, AVG, etc.
      dataSubject: details.dataSubject,
      legalBasis: details.legalBasis,
      retentionPeriod: details.retentionPeriod,
      ...details
    };

    this.securityLogger.info('Compliance event', event);
    return event;
  }

  // Performance Monitoring
  logPerformanceMetric(metric, value, context = {}) {
    const event = {
      type: 'PERFORMANCE_METRIC',
      metric: metric,
      value: value,
      timestamp: new Date().toISOString(),
      context: context
    };

    this.systemLogger.debug('Performance metric', event);
    return event;
  }
}