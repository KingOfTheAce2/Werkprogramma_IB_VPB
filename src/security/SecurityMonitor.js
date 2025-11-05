// Real-time Security Monitoring and Alerting System
import EventEmitter from 'events';
import crypto from 'crypto';
import { SecurityLogger } from './SecurityLogger.js';

export class SecurityMonitor extends EventEmitter {
  constructor() {
    super();
    this.logger = new SecurityLogger();
    
    // Real-time metrics
    this.metrics = {
      loginAttempts: { success: 0, failed: 0, blocked: 0 },
      apiCalls: { total: 0, errors: 0, unauthorized: 0 },
      dataAccess: { read: 0, write: 0, sensitive: 0 },
      securityIncidents: { low: 0, medium: 0, high: 0, critical: 0 },
      activeUsers: new Set(),
      suspiciousIPs: new Set(),
      blockedIPs: new Set()
    };

    // Alert configuration
    this.alertConfig = {
      failedLoginThreshold: 5, // per 5 minutes
      errorRateThreshold: 0.1, // 10% error rate
      suspiciousIPThreshold: 3, // incidents per hour
      dataAccessRateThreshold: 100, // operations per minute
      
      alertCooldown: 5 * 60 * 1000, // 5 minutes between same type alerts
      criticalAlertCooldown: 1 * 60 * 1000 // 1 minute for critical
    };

    // Alert history
    this.alertHistory = new Map();
    this.lastAlerts = new Map();

    // Anomaly detection
    this.baselines = new Map();
    this.anomalies = [];

    // Start monitoring
    this.startMonitoring();
  }

  // Start real-time monitoring
  startMonitoring() {
    // Update baselines every hour
    setInterval(() => {
      this.updateBaselines();
    }, 60 * 60 * 1000);

    // Check for anomalies every minute
    setInterval(() => {
      this.detectAnomalies();
    }, 60 * 1000);

    // Clean up old data every 10 minutes
    setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);

    // Generate hourly security reports
    setInterval(() => {
      this.generateHourlyReport();
    }, 60 * 60 * 1000);

    console.log('🛡️ Security monitoring started');
  }

  // Track login attempt
  trackLogin(success, userInfo, requestInfo, riskLevel = 'low') {
    if (success) {
      this.metrics.loginAttempts.success++;
      this.metrics.activeUsers.add(userInfo.id);
    } else {
      this.metrics.loginAttempts.failed++;
      
      // Check for brute force
      this.checkBruteForcePattern(requestInfo.ip, userInfo.username);
    }

    // High risk login attempt
    if (riskLevel === 'high') {
      this.metrics.loginAttempts.blocked++;
      this.triggerAlert('HIGH_RISK_LOGIN', {
        severity: 'high',
        userInfo: userInfo,
        requestInfo: requestInfo,
        riskLevel: riskLevel
      });
    }

    this.emit('login_attempt', { success, userInfo, requestInfo, riskLevel });
  }

  // Track API call
  trackAPICall(method, endpoint, statusCode, responseTime, userInfo) {
    this.metrics.apiCalls.total++;
    
    if (statusCode >= 400) {
      this.metrics.apiCalls.errors++;
    }
    
    if (statusCode === 401 || statusCode === 403) {
      this.metrics.apiCalls.unauthorized++;
    }

    // Check for unusual response patterns
    if (responseTime > 5000) { // Slow response
      this.triggerAlert('SLOW_RESPONSE', {
        severity: 'medium',
        endpoint: endpoint,
        responseTime: responseTime,
        userInfo: userInfo
      });
    }

    this.emit('api_call', { method, endpoint, statusCode, responseTime, userInfo });
  }

  // Track data access
  trackDataAccess(operation, resourceType, sensitive, userInfo, requestInfo) {
    this.metrics.dataAccess[operation] = (this.metrics.dataAccess[operation] || 0) + 1;
    
    if (sensitive) {
      this.metrics.dataAccess.sensitive++;
      
      // Alert on sensitive data access
      this.triggerAlert('SENSITIVE_DATA_ACCESS', {
        severity: 'medium',
        operation: operation,
        resourceType: resourceType,
        userInfo: userInfo,
        requestInfo: requestInfo
      });
    }

    // Check for data exfiltration patterns
    this.checkDataExfiltrationPattern(userInfo.id, operation, requestInfo);

    this.emit('data_access', { operation, resourceType, sensitive, userInfo, requestInfo });
  }

  // Track security incident
  trackSecurityIncident(incidentType, severity, details, requestInfo) {
    this.metrics.securityIncidents[severity] = (this.metrics.securityIncidents[severity] || 0) + 1;
    
    if (requestInfo.ip) {
      this.metrics.suspiciousIPs.add(requestInfo.ip);
    }

    // Immediate alert for high/critical incidents
    if (severity === 'high' || severity === 'critical') {
      this.triggerAlert('SECURITY_INCIDENT', {
        severity: severity,
        incidentType: incidentType,
        details: details,
        requestInfo: requestInfo
      });
    }

    this.emit('security_incident', { incidentType, severity, details, requestInfo });
  }

  // Check for brute force patterns
  checkBruteForcePattern(ip, username) {
    const key = `brute_force:${ip}:${username}`;
    const attempts = this.getTimestampedCounter(key, 5 * 60 * 1000); // 5 minutes window
    
    if (attempts >= this.alertConfig.failedLoginThreshold) {
      this.metrics.blockedIPs.add(ip);
      
      this.triggerAlert('BRUTE_FORCE_DETECTED', {
        severity: 'high',
        ip: ip,
        username: username,
        attempts: attempts,
        timeWindow: '5 minutes'
      });
    }
  }

  // Check for data exfiltration patterns
  checkDataExfiltrationPattern(userId, operation, requestInfo) {
    if (operation !== 'read') return;
    
    const key = `data_access:${userId}`;
    const recentAccess = this.getTimestampedCounter(key, 60 * 1000); // 1 minute window
    
    if (recentAccess > this.alertConfig.dataAccessRateThreshold) {
      this.triggerAlert('POSSIBLE_DATA_EXFILTRATION', {
        severity: 'critical',
        userId: userId,
        accessCount: recentAccess,
        timeWindow: '1 minute',
        requestInfo: requestInfo
      });
    }
  }

  // Trigger security alert
  triggerAlert(alertType, details) {
    const now = Date.now();
    const alertKey = `${alertType}:${JSON.stringify(details.ip || details.userId || 'system')}`;
    
    // Check cooldown
    const lastAlert = this.lastAlerts.get(alertKey);
    const cooldown = details.severity === 'critical' 
      ? this.alertConfig.criticalAlertCooldown 
      : this.alertConfig.alertCooldown;
    
    if (lastAlert && (now - lastAlert) < cooldown) {
      return; // Still in cooldown
    }

    const alert = {
      alertId: crypto.randomBytes(8).toString('hex'),
      type: alertType,
      timestamp: new Date().toISOString(),
      severity: details.severity || 'medium',
      details: details,
      acknowledged: false,
      resolvedAt: null
    };

    // Store alert
    this.alertHistory.set(alert.alertId, alert);
    this.lastAlerts.set(alertKey, now);

    // Log alert
    this.logger.logSecurityIncident('SECURITY_ALERT_TRIGGERED', {
      severity: details.severity || 'medium',
      description: `Security alert: ${alertType}`,
      evidence: details
    }, details.requestInfo || { ip: 'system', userAgent: 'monitor' });

    // Emit alert event
    this.emit('security_alert', alert);

    // Send notifications
    this.sendNotification(alert);

    console.log(`🚨 SECURITY ALERT [${details.severity?.toUpperCase()}]: ${alertType}`, alert);
  }

  // Send alert notifications
  async sendNotification(alert) {
    try {
      // In production, integrate with:
      // - Email services (SendGrid, AWS SES)
      // - SMS services (Twilio)
      // - Slack/Teams webhooks
      // - PagerDuty for critical alerts
      // - SIEM systems
      
      if (alert.severity === 'critical') {
        await this.sendCriticalNotification(alert);
      } else if (alert.severity === 'high') {
        await this.sendHighPriorityNotification(alert);
      } else {
        await this.sendStandardNotification(alert);
      }
    } catch (error) {
      console.error('Failed to send security notification:', error);
    }
  }

  // Critical alert notification (immediate)
  async sendCriticalNotification(alert) {
    // Would send SMS, call webhook, trigger pager
    console.log('📞 CRITICAL ALERT - Immediate notification sent');
  }

  // High priority notification
  async sendHighPriorityNotification(alert) {
    // Would send email and Slack notification
    console.log('📧 HIGH PRIORITY ALERT - Email and Slack notification sent');
  }

  // Standard notification
  async sendStandardNotification(alert) {
    // Would log to monitoring dashboard
    console.log('📊 STANDARD ALERT - Logged to monitoring dashboard');
  }

  // Detect anomalies using statistical analysis
  detectAnomalies() {
    const now = Date.now();
    const currentMetrics = this.getCurrentMetrics();
    
    for (const [metric, value] of Object.entries(currentMetrics)) {
      const baseline = this.baselines.get(metric);
      
      if (baseline && baseline.mean !== undefined) {
        const deviation = Math.abs(value - baseline.mean) / (baseline.stdDev || 1);
        
        // Alert if value is more than 3 standard deviations from baseline
        if (deviation > 3) {
          this.anomalies.push({
            metric: metric,
            currentValue: value,
            baselineMean: baseline.mean,
            deviation: deviation,
            timestamp: now
          });

          this.triggerAlert('ANOMALY_DETECTED', {
            severity: 'medium',
            metric: metric,
            currentValue: value,
            expectedValue: baseline.mean,
            deviation: deviation
          });
        }
      }
    }
  }

  // Update statistical baselines
  updateBaselines() {
    const metrics = this.getCurrentMetrics();
    
    for (const [metric, value] of Object.entries(metrics)) {
      let baseline = this.baselines.get(metric) || { values: [], mean: 0, stdDev: 0 };
      
      baseline.values.push(value);
      
      // Keep only last 24 hours of data
      if (baseline.values.length > 24) {
        baseline.values = baseline.values.slice(-24);
      }
      
      // Calculate mean and standard deviation
      baseline.mean = baseline.values.reduce((a, b) => a + b, 0) / baseline.values.length;
      baseline.stdDev = Math.sqrt(
        baseline.values.reduce((acc, val) => acc + Math.pow(val - baseline.mean, 2), 0) / baseline.values.length
      );
      
      this.baselines.set(metric, baseline);
    }
  }

  // Get current metrics snapshot
  getCurrentMetrics() {
    return {
      totalLoginAttempts: this.metrics.loginAttempts.success + this.metrics.loginAttempts.failed,
      failedLoginRate: this.metrics.loginAttempts.failed / (this.metrics.loginAttempts.success + this.metrics.loginAttempts.failed + 1),
      errorRate: this.metrics.apiCalls.errors / (this.metrics.apiCalls.total + 1),
      activeUsers: this.metrics.activeUsers.size,
      suspiciousIPs: this.metrics.suspiciousIPs.size,
      sensitiveDataAccess: this.metrics.dataAccess.sensitive,
      totalSecurityIncidents: Object.values(this.metrics.securityIncidents).reduce((a, b) => a + b, 0)
    };
  }

  // Get timestamped counter for rate limiting
  getTimestampedCounter(key, windowMs) {
    const counters = this.timestampedCounters = this.timestampedCounters || new Map();
    const now = Date.now();
    
    let timestamps = counters.get(key) || [];
    timestamps = timestamps.filter(timestamp => now - timestamp < windowMs);
    timestamps.push(now);
    
    counters.set(key, timestamps);
    return timestamps.length;
  }

  // Generate hourly security report
  async generateHourlyReport() {
    const report = {
      reportId: crypto.randomBytes(8).toString('hex'),
      timestamp: new Date().toISOString(),
      period: '1 hour',
      metrics: this.getCurrentMetrics(),
      alerts: Array.from(this.alertHistory.values()).filter(alert => 
        Date.now() - new Date(alert.timestamp).getTime() < 60 * 60 * 1000
      ),
      anomalies: this.anomalies.filter(anomaly => 
        Date.now() - anomaly.timestamp < 60 * 60 * 1000
      ),
      topRisks: this.identifyTopRisks(),
      recommendations: this.generateRecommendations()
    };

    this.logger.logSystemEvent('HOURLY_SECURITY_REPORT', report);
    this.emit('security_report', report);

    return report;
  }

  // Identify top security risks
  identifyTopRisks() {
    const risks = [];
    const metrics = this.getCurrentMetrics();

    if (metrics.failedLoginRate > 0.3) {
      risks.push({
        type: 'high_failed_login_rate',
        severity: 'high',
        description: 'Unusually high failed login rate detected',
        value: metrics.failedLoginRate
      });
    }

    if (metrics.errorRate > 0.1) {
      risks.push({
        type: 'high_error_rate',
        severity: 'medium',
        description: 'High API error rate may indicate attacks',
        value: metrics.errorRate
      });
    }

    if (this.metrics.suspiciousIPs.size > 10) {
      risks.push({
        type: 'multiple_suspicious_ips',
        severity: 'high',
        description: 'Multiple suspicious IP addresses detected',
        value: this.metrics.suspiciousIPs.size
      });
    }

    return risks.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  // Generate security recommendations
  generateRecommendations() {
    const recommendations = [];
    const metrics = this.getCurrentMetrics();

    if (metrics.failedLoginRate > 0.2) {
      recommendations.push('Consider implementing stronger brute force protection');
    }

    if (this.metrics.suspiciousIPs.size > 5) {
      recommendations.push('Review and potentially block suspicious IP addresses');
    }

    if (metrics.sensitiveDataAccess > 50) {
      recommendations.push('Review sensitive data access patterns for potential data exfiltration');
    }

    if (this.anomalies.length > 5) {
      recommendations.push('Investigate detected anomalies for potential security threats');
    }

    return recommendations;
  }

  // Acknowledge alert
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.alertHistory.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date().toISOString();
      
      this.logger.logSystemEvent('ALERT_ACKNOWLEDGED', {
        alertId: alertId,
        acknowledgedBy: acknowledgedBy
      });
    }
  }

  // Resolve alert
  resolveAlert(alertId, resolvedBy, resolution) {
    const alert = this.alertHistory.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date().toISOString();
      alert.resolution = resolution;
      
      this.logger.logSystemEvent('ALERT_RESOLVED', {
        alertId: alertId,
        resolvedBy: resolvedBy,
        resolution: resolution
      });
    }
  }

  // Get security dashboard data
  getDashboardData() {
    return {
      metrics: this.getCurrentMetrics(),
      recentAlerts: Array.from(this.alertHistory.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10),
      activeThreats: this.metrics.blockedIPs.size,
      systemHealth: this.calculateSystemHealth(),
      recommendations: this.generateRecommendations().slice(0, 5)
    };
  }

  // Calculate overall system health score
  calculateSystemHealth() {
    const metrics = this.getCurrentMetrics();
    let score = 100;

    // Deduct points for security issues
    score -= metrics.failedLoginRate * 30;
    score -= metrics.errorRate * 20;
    score -= Math.min(this.metrics.suspiciousIPs.size, 10) * 5;
    score -= Math.min(this.anomalies.length, 10) * 3;

    return Math.max(0, Math.round(score));
  }

  // Cleanup old data
  cleanup() {
    const now = Date.now();
    const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean up old alerts
    for (const [alertId, alert] of this.alertHistory.entries()) {
      if (now - new Date(alert.timestamp).getTime() > retentionPeriod) {
        this.alertHistory.delete(alertId);
      }
    }

    // Clean up old anomalies
    this.anomalies = this.anomalies.filter(anomaly => 
      now - anomaly.timestamp < retentionPeriod
    );

    // Reset hourly counters
    this.resetHourlyCounters();
  }

  // Reset counters that should reset hourly
  resetHourlyCounters() {
    this.metrics.loginAttempts = { success: 0, failed: 0, blocked: 0 };
    this.metrics.apiCalls = { total: 0, errors: 0, unauthorized: 0 };
    this.metrics.dataAccess = { read: 0, write: 0, sensitive: 0 };
    this.metrics.securityIncidents = { low: 0, medium: 0, high: 0, critical: 0 };
    
    // Keep active users and suspicious IPs for longer
  }

  // Get system status
  getStatus() {
    return {
      monitoring: 'active',
      uptime: process.uptime(),
      alerts: this.alertHistory.size,
      activeUsers: this.metrics.activeUsers.size,
      blockedIPs: this.metrics.blockedIPs.size,
      systemHealth: this.calculateSystemHealth(),
      lastReport: 'Available'
    };
  }
}

// Export global monitor instance
export const securityMonitor = new SecurityMonitor();