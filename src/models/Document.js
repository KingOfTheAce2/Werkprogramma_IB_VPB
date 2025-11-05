// Document Management Models for AuditCase Integration

export class DocumentCategory {
  static CATEGORIES = {
    PERMANENT: 'permanent', // Always roll over to next year
    ANNUAL: 'annual', // Replace each year
    CONDITIONAL: 'conditional', // User decides per document
    HISTORICAL: 'historical' // Archive only, never roll over
  };

  static DOCUMENT_TYPES = {
    // Permanent documents (always roll over)
    COMPANY_STRUCTURE: { category: this.CATEGORIES.PERMANENT, name: 'Organisatiestructuur' },
    ARTICLES_ASSOCIATION: { category: this.CATEGORIES.PERMANENT, name: 'Statuten' },
    LICENSES: { category: this.CATEGORIES.PERMANENT, name: 'Vergunningen' },
    CONTRACTS_ONGOING: { category: this.CATEGORIES.PERMANENT, name: 'Doorlopende Contracten' },
    
    // Annual documents (replace each year)
    ANNUAL_REPORT: { category: this.CATEGORIES.ANNUAL, name: 'Jaarrekening' },
    TAX_RETURN: { category: this.CATEGORIES.ANNUAL, name: 'Belastingaangifte' },
    MANAGEMENT_LETTER: { category: this.CATEGORIES.ANNUAL, name: 'Management Letter' },
    AUDIT_REPORT: { category: this.CATEGORIES.ANNUAL, name: 'Controleverklaring' },
    
    // Conditional documents (user decides)
    ANALYSIS_REPORTS: { category: this.CATEGORIES.CONDITIONAL, name: 'Analyses en Rapportages' },
    CORRESPONDENCE: { category: this.CATEGORIES.CONDITIONAL, name: 'Correspondentie' },
    INVOICES_CONTRACTS: { category: this.CATEGORIES.CONDITIONAL, name: 'Facturen en Contracten' },
    
    // Historical documents (archive only)
    PREVIOUS_YEARS: { category: this.CATEGORIES.HISTORICAL, name: 'Voorgaande Jaren' },
    DISSOLVED_ENTITIES: { category: this.CATEGORIES.HISTORICAL, name: 'Opgeheven Entiteiten' }
  };
}

export class Document {
  constructor(data) {
    this.id = data.id;
    this.filename = data.filename;
    this.type = data.type;
    this.category = data.category;
    this.fiscalYear = data.fiscalYear;
    this.clientId = data.clientId;
    this.uploadDate = data.uploadDate;
    this.version = data.version || 1;
    this.auditCaseId = data.auditCaseId;
    this.rolloverSelected = data.rolloverSelected || false;
    this.replacedBy = data.replacedBy || null;
    this.replaces = data.replaces || null;
    this.path = data.path; // AuditCase folder path
    this.metadata = data.metadata || {};
  }

  shouldAutoRollover() {
    const docType = DocumentCategory.DOCUMENT_TYPES[this.type];
    return docType?.category === DocumentCategory.CATEGORIES.PERMANENT;
  }

  shouldReplace() {
    const docType = DocumentCategory.DOCUMENT_TYPES[this.type];
    return docType?.category === DocumentCategory.CATEGORIES.ANNUAL;
  }

  requiresUserDecision() {
    const docType = DocumentCategory.DOCUMENT_TYPES[this.type];
    return docType?.category === DocumentCategory.CATEGORIES.CONDITIONAL;
  }

  isHistorical() {
    const docType = DocumentCategory.DOCUMENT_TYPES[this.type];
    return docType?.category === DocumentCategory.CATEGORIES.HISTORICAL;
  }

  getAuditCasePath(clientNumber, fiscalYear) {
    return `Werkprogramma_${clientNumber}_${fiscalYear}/${this.getCategoryFolder()}/${this.filename}`;
  }

  getCategoryFolder() {
    const docType = DocumentCategory.DOCUMENT_TYPES[this.type];
    return docType?.name || 'Overig';
  }
}