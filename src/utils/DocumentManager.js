// Document Management Utilities

import { Document, DocumentCategory } from '../models/Document.js';

export class DocumentManager {
  constructor(auditCaseApiUrl, apiKey) {
    this.auditCaseApiUrl = auditCaseApiUrl;
    this.apiKey = apiKey;
  }

  // Create organized folder structure in AuditCase
  async createYearStructure(clientNumber, fiscalYear) {
    const baseFolder = `Werkprogramma_${clientNumber}_${fiscalYear}`;
    
    const folders = [
      `${baseFolder}/01_Permanente_Documenten`,
      `${baseFolder}/02_Jaarlijkse_Documenten`,
      `${baseFolder}/03_Werkprogramma_Vragen`,
      `${baseFolder}/04_Analyses_Rapportages`,
      `${baseFolder}/05_Correspondentie`,
      `${baseFolder}/06_Archief`,
      `${baseFolder}/99_Temp_Upload`
    ];

    const results = [];
    for (const folder of folders) {
      try {
        const result = await this.createFolder(clientNumber, folder);
        results.push({ folder, success: true, result });
      } catch (error) {
        results.push({ folder, success: false, error: error.message });
      }
    }

    return results;
  }

  async createFolder(clientNumber, folderPath) {
    // AuditCase folder creation via API
    const response = await fetch(`${this.auditCaseApiUrl}/document/folder/create/${clientNumber}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        folderPath: folderPath,
        description: `Automatisch aangemaakt door Werkprogramma systeem`
      })
    });

    if (!response.ok) {
      throw new Error(`Folder creation failed: ${response.status}`);
    }

    return await response.json();
  }

  // Upload document to specific category folder
  async uploadDocument(clientNumber, file, documentType, fiscalYear, questionId = null) {
    const document = new Document({
      filename: file.name,
      type: documentType,
      category: this.getDocumentCategory(documentType),
      fiscalYear: fiscalYear,
      clientId: clientNumber,
      uploadDate: new Date().toISOString()
    });

    const folderPath = this.getCategoryFolderPath(clientNumber, fiscalYear, document.category);
    const fullPath = `${folderPath}/${file.name}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderPath', folderPath);
    formData.append('documentType', documentType);
    formData.append('fiscalYear', fiscalYear);
    if (questionId) formData.append('questionId', questionId);

    const response = await fetch(`${this.auditCaseApiUrl}/document/upload/${clientNumber}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const result = await response.json();
    document.auditCaseId = result.documentId;
    document.path = fullPath;

    return { document, auditCaseResult: result };
  }

  // Get documents for rollover decision
  async getDocumentsForRollover(clientNumber, fromYear, toYear) {
    const documents = await this.getYearDocuments(clientNumber, fromYear);
    
    return documents.map(doc => ({
      ...doc,
      rolloverAction: this.determineRolloverAction(doc),
      targetPath: this.getTargetPath(clientNumber, toYear, doc)
    }));
  }

  determineRolloverAction(document) {
    if (document.shouldAutoRollover()) {
      return 'auto_rollover';
    } else if (document.shouldReplace()) {
      return 'replace_required';
    } else if (document.requiresUserDecision()) {
      return 'user_decision';
    } else {
      return 'archive_only';
    }
  }

  // Execute rollover based on user selections
  async executeRollover(clientNumber, fromYear, toYear, rolloverSelections) {
    const results = {
      copied: [],
      replaced: [],
      archived: [],
      errors: []
    };

    // Create new year structure first
    await this.createYearStructure(clientNumber, toYear);

    for (const selection of rolloverSelections) {
      try {
        switch (selection.action) {
          case 'copy':
            await this.copyDocument(clientNumber, selection.document, fromYear, toYear);
            results.copied.push(selection.document.filename);
            break;
            
          case 'replace':
            await this.replaceDocument(clientNumber, selection.document, selection.newFile, toYear);
            results.replaced.push(selection.document.filename);
            break;
            
          case 'archive':
            await this.archiveDocument(clientNumber, selection.document, fromYear);
            results.archived.push(selection.document.filename);
            break;
        }
      } catch (error) {
        results.errors.push({
          document: selection.document.filename,
          error: error.message
        });
      }
    }

    return results;
  }

  async copyDocument(clientNumber, document, fromYear, toYear) {
    const sourcePath = document.path;
    const targetPath = this.getTargetPath(clientNumber, toYear, document);

    const response = await fetch(`${this.auditCaseApiUrl}/document/copy/${clientNumber}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sourcePath: sourcePath,
        targetPath: targetPath,
        newFiscalYear: toYear
      })
    });

    if (!response.ok) {
      throw new Error(`Copy failed: ${response.status}`);
    }

    return await response.json();
  }

  async replaceDocument(clientNumber, oldDocument, newFile, toYear) {
    // Upload new document
    const uploadResult = await this.uploadDocument(
      clientNumber, 
      newFile, 
      oldDocument.type, 
      toYear
    );

    // Mark old document as replaced
    await this.markDocumentReplaced(clientNumber, oldDocument, uploadResult.document);

    return uploadResult;
  }

  async archiveDocument(clientNumber, document, fiscalYear) {
    const archivePath = `Werkprogramma_${clientNumber}_${fiscalYear}/06_Archief/${document.filename}`;
    
    const response = await fetch(`${this.auditCaseApiUrl}/document/move/${clientNumber}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId: document.auditCaseId,
        targetPath: archivePath
      })
    });

    if (!response.ok) {
      throw new Error(`Archive failed: ${response.status}`);
    }

    return await response.json();
  }

  getDocumentCategory(documentType) {
    return DocumentCategory.DOCUMENT_TYPES[documentType]?.category || DocumentCategory.CATEGORIES.CONDITIONAL;
  }

  getCategoryFolderPath(clientNumber, fiscalYear, category) {
    const baseFolder = `Werkprogramma_${clientNumber}_${fiscalYear}`;
    
    switch (category) {
      case DocumentCategory.CATEGORIES.PERMANENT:
        return `${baseFolder}/01_Permanente_Documenten`;
      case DocumentCategory.CATEGORIES.ANNUAL:
        return `${baseFolder}/02_Jaarlijkse_Documenten`;
      case DocumentCategory.CATEGORIES.CONDITIONAL:
        return `${baseFolder}/04_Analyses_Rapportages`;
      case DocumentCategory.CATEGORIES.HISTORICAL:
        return `${baseFolder}/06_Archief`;
      default:
        return `${baseFolder}/99_Temp_Upload`;
    }
  }

  getTargetPath(clientNumber, toYear, document) {
    const targetFolder = this.getCategoryFolderPath(clientNumber, toYear, document.category);
    return `${targetFolder}/${document.filename}`;
  }

  async getYearDocuments(clientNumber, fiscalYear) {
    const response = await fetch(`${this.auditCaseApiUrl}/documents/${clientNumber}/${fiscalYear}`, {
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get documents: ${response.status}`);
    }

    const documents = await response.json();
    return documents.map(doc => new Document(doc));
  }

  async markDocumentReplaced(clientNumber, oldDocument, newDocument) {
    const response = await fetch(`${this.auditCaseApiUrl}/document/replace/${clientNumber}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        oldDocumentId: oldDocument.auditCaseId,
        newDocumentId: newDocument.auditCaseId,
        replacementDate: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Mark replacement failed: ${response.status}`);
    }

    return await response.json();
  }
}