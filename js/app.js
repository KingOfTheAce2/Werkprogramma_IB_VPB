import {
  parseMarkdownToList,
  parseMarkdownFromTable,
} from './markdown-parser.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- App State ---
  let currentProgram = null;
  let currentUser = null;
  let dossierStatus = 'open'; // 'open', 'ingediend', 'gereviewd', 'afgesloten'
  let availableYears = [];
  let questionProgress = {
    clientQuestions: 'pending', // 'pending', 'in_progress', 'completed'
    aangifteQuestions: 'pending'
  };

  // --- DOM Element References ---
  const dom = {
    dashboardScreen: document.getElementById('dashboard-screen'),
    werkprogrammaScreen: document.getElementById('werkprogramma-screen'),
    btnLogout: document.getElementById('btn-logout'),
    userDisplayDashboard: document.getElementById('user-display-dashboard'),
    userDisplayWerkprogramma: document.getElementById(
      'user-display-werkprogramma',
    ),
    apiKeyInput: document.getElementById('api-key-input'),
    fiscalYearSelect: document.getElementById('fiscal-year-select'),
    btnAddYear: document.getElementById('btn-add-year'),
    btnIb: document.getElementById('btn-ib'),
    btnVpb: document.getElementById('btn-vpb'),
    clientSelectionContainer: document.getElementById(
      'client-selection-container',
    ),
    clientSelect: document.getElementById('client-select'),
    btnOpenWerkprogramma: document.getElementById('btn-open-werkprogramma'),
    btnBackToDashboard: document.getElementById('btn-back-to-dashboard'),
    headerSubtitle: document.getElementById('header-subtitle'),
    werkprogrammaContainer: document.getElementById('werkprogramma-container'),
    dossierStatusContainer: document.getElementById('dossier-status-container'),
    dossierStatusBadge: document.getElementById('dossier-status-badge'),
    btnSubmit: document.getElementById('btn-submit'),
    btnReview: document.getElementById('btn-review'),
    btnClose: document.getElementById('btn-close'),
    btnReopen: document.getElementById('btn-reopen'),
    btnDocumentManager: document.getElementById('btn-document-manager'),
    btnYearRollover: document.getElementById('btn-year-rollover'),
    questionTree: document.getElementById('question-tree'),
  };

  // --- Data ---
  let auditCaseClients = [];
  const permissions = {
    opsteller: {
      canSubmit: true,
      canReview: false,
      canClose: false,
      canReopen: false,
      canAddYear: false,
      displayName: 'Belastingadviseur'
    },
    reviewer: {
      canSubmit: true,
      canReview: true,
      canClose: true,
      canReopen: true,
      canAddYear: true,
      displayName: 'Senior Adviseur'
    },
    admin: {
      canSubmit: true,
      canReview: true,
      canClose: true,
      canReopen: true,
      canAddYear: true,
      displayName: 'Kantoormanager'
    },
  };

  // --- Initialization ---
  async function init() {
    const token = sessionStorage.getItem('token');
    if (!token) {
      window.location.href = 'login.html';
      return;
    }
    const storedUser = sessionStorage.getItem('currentUser');
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
      currentUser = data.user;
      sessionStorage.setItem('currentUser', JSON.stringify(data.user));
    } catch (err) {
      if (storedUser) {
        currentUser = JSON.parse(storedUser);
      } else {
        window.location.href = 'login.html';
        return;
      }
    }

    const currentYear = new Date().getFullYear();
    availableYears = [currentYear, currentYear - 1, currentYear - 2];
    populateFiscalYears();
    
    // Load clients from AuditCase
    await loadAuditCaseClients();

    // Event Listeners
    dom.btnLogout.addEventListener('click', handleLogout);
    dom.btnAddYear.addEventListener('click', handleAddYear);
    dom.btnIb.addEventListener('click', () => setupClientSelection('ib'));
    dom.btnVpb.addEventListener('click', () => setupClientSelection('vpb'));
    dom.clientSelect.addEventListener('change', () => {
      dom.btnOpenWerkprogramma.disabled = !dom.clientSelect.value;
    });
    dom.btnOpenWerkprogramma.addEventListener('click', openWerkprogramma);
    dom.btnBackToDashboard.addEventListener('click', () => {
      sessionStorage.removeItem('selectedClient');
      sessionStorage.removeItem('selectedProgram');
      showDashboard();
    });

    dom.btnDocumentManager.addEventListener('click', showDocumentManager);
    dom.btnYearRollover.addEventListener('click', showYearRollover);

    dom.btnSubmit.addEventListener('click', () =>
      updateDossierStatus('ingediend', 'Dossier ingediend.'),
    );
    dom.btnReview.addEventListener('click', () =>
      updateDossierStatus('gereviewd', 'Dossier gereviewd.'),
    );
    dom.btnClose.addEventListener('click', () =>
      updateDossierStatus('afgesloten', 'Dossier afgesloten.'),
    );
    dom.btnReopen.addEventListener('click', () => {
      const reason = prompt('Reden voor heropenen:');
      if (reason && reason.trim() !== '') {
        console.log(
          `MOCK AUDIT TRAIL: Dossier heropend door ${currentUser.name}. Reden: ${reason}`,
        );
        updateDossierStatus('open', 'Dossier heropend.');
      } else if (reason !== null) {
        showToast('Een reden is verplicht om het dossier te heropenen.');
      }
    });

    dom.userDisplayDashboard.textContent = `Ingelogd als: ${currentUser.name}`;
    dom.userDisplayWerkprogramma.textContent = `Ingelogd als: ${currentUser.name}`;
    dom.btnAddYear.classList.toggle(
      'hidden',
      !permissions[currentUser.role].canAddYear,
    );

    const storedClient = sessionStorage.getItem('selectedClient');
    const storedProgram = sessionStorage.getItem('selectedProgram');
    if (storedClient && storedProgram) {
      currentProgram = storedProgram;
      dom.clientSelect.innerHTML = `<option value="${storedClient}" selected>${storedClient}</option>`;
      dom.fiscalYearSelect.value = currentYear;
      openWerkprogramma();
    } else {
      showDashboard();
    }
  }

  // --- Core Functions ---
  function populateFiscalYears() {
    dom.fiscalYearSelect.innerHTML = '';
    availableYears
      .sort((a, b) => b - a)
      .forEach((year) => {
        dom.fiscalYearSelect.appendChild(new Option(year, year));
      });
  }

  async function handleLogout() {
    const token = sessionStorage.getItem('token');
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {}
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }

  function handleAddYear() {
    const latestYear = Math.max(...availableYears);
    const newYear = prompt('Voer het nieuwe fiscale jaar in:', latestYear + 1);
    if (newYear && !isNaN(newYear) && newYear > 1900) {
      const year = parseInt(newYear, 10);
      if (availableYears.includes(year)) {
        showToast(`Fiscaal jaar ${year} bestaat al.`);
        return;
      }
      availableYears.push(year);
      populateFiscalYears();
      dom.fiscalYearSelect.value = year;
      showToast(
        `Fiscaal jaar ${year} aangemaakt. Commentaren met 'doorrol' optie zijn (gesimuleerd) overgenomen.`,
      );
    } else if (newYear !== null) {
      showToast('Ongeldig jaartal ingevoerd.');
    }
  }

  function showDashboard() {
    dom.dashboardScreen.classList.remove('hidden');
    dom.werkprogrammaScreen.classList.add('hidden');
  }

  function openWerkprogramma() {
    const clientName =
      dom.clientSelect.value || sessionStorage.getItem('selectedClient');
    if (!currentProgram || !clientName) return;
    
    dom.dashboardScreen.classList.add('hidden');
    dom.werkprogrammaScreen.classList.remove('hidden');
    dossierStatus = 'open';
    
    // Reset progress and start with client questions
    questionProgress = {
      clientQuestions: 'pending',
      aangifteQuestions: 'pending'
    };
    
    updateQuestionTree();
    showClientQuestions();
  }

  async function loadAuditCaseClients() {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/auditcase/clients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        auditCaseClients = await response.json();
        showToast('Cliënten geladen vanuit AuditCase');
      } else {
        throw new Error('Kon geen cliënten laden');
      }
    } catch (error) {
      console.error('Error loading AuditCase clients:', error);
      showToast('Fout bij laden cliënten. Gebruik demo-modus.');
      // Fallback to demo clients
      auditCaseClients = [
        { $col1: 'DEMO001', $col3: 'J. van der Berg', $col4: 'Particulier' },
        { $col1: 'DEMO002', $col3: 'M.A. Jansen', $col4: 'Particulier' },
        { $col1: 'DEMO003', $col3: 'Bakkerij Jansen B.V.', $col4: 'Bedrijf' },
        { $col1: 'DEMO004', $col3: 'IT Solutions Nederland B.V.', $col4: 'Bedrijf' },
      ];
    }
  }

  function setupClientSelection(programType) {
    currentProgram = programType;
    setActiveButton(
      programType === 'ib' ? dom.btnIb : dom.btnVpb,
      '.program-btn',
    );

    dom.clientSelect.innerHTML = '<option value="">-- Selecteer cliënt --</option>';
    
    // Filter clients based on program type
    const filteredClients = auditCaseClients.filter(client => {
      if (programType === 'ib') {
        return client.$col4 === 'Particulier' || client.$col4 === 'Klant';
      } else {
        return client.$col4 === 'Bedrijf' || client.$col4 === 'Klant';
      }
    });

    filteredClients.forEach((client) => {
      const option = new Option(
        `${client.$col3} (${client.$col1})`, 
        client.$col1
      );
      option.dataset.clientName = client.$col3;
      dom.clientSelect.appendChild(option);
    });

    dom.clientSelectionContainer.classList.remove('hidden');
    dom.btnOpenWerkprogramma.disabled = true;
  }

  function updateDossierStatus(newStatus, toastMessage) {
    dossierStatus = newStatus;
    updateUIForRoleAndStatus();
    showToast(toastMessage);
  }

  function updateUIForRoleAndStatus() {
    if (!currentUser) return;
    const rolePerms = permissions[currentUser.role];
    const isLocked = dossierStatus === 'afgesloten';

    dom.dossierStatusBadge.textContent =
      dossierStatus.charAt(0).toUpperCase() + dossierStatus.slice(1);
    dom.dossierStatusBadge.className =
      'font-bold px-2 py-1 rounded-full ' +
      (isLocked ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800');
    if (dom.clientSelect.value) {
      dom.dossierStatusContainer.classList.remove('hidden');
    }

    const fieldset = document.getElementById('form-fieldset');
    if (fieldset) {
      fieldset.disabled = isLocked && currentUser.role === 'opsteller';
    }

    dom.btnSubmit.classList.toggle(
      'hidden',
      !rolePerms.canSubmit || dossierStatus !== 'open',
    );
    dom.btnReview.classList.toggle(
      'hidden',
      !rolePerms.canReview || dossierStatus !== 'ingediend',
    );
    dom.btnClose.classList.toggle(
      'hidden',
      !rolePerms.canClose || dossierStatus !== 'gereviewd',
    );
    dom.btnReopen.classList.toggle('hidden', !rolePerms.canReopen || !isLocked);
  }

  async function loadAndRenderWorkProgram(type, clientName, fiscalYear) {
    dom.werkprogrammaContainer.innerHTML = `<div class="text-center p-8"><p class="text-gray-500">Werkprogramma wordt geladen...</p></div>`;
    dom.headerSubtitle.textContent = `Werkprogramma ${type.toUpperCase()} voor ${clientName} - Fiscaal Jaar ${fiscalYear}`;

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const [clientMd, taxMd] = await Promise.all([
        fetch('werkprogramma_client.md').then((r) => r.text()),
        fetch(
          type === 'ib'
            ? 'werkprogramma_inkomstenbelasting.md'
            : 'werkprogramma_vennootschapsbelasting.md',
        ).then((r) => r.text()),
      ]);
      const clientQuestions = parseMarkdownToList(clientMd);
      const taxQuestions =
        type === 'ib'
          ? parseMarkdownToList(taxMd)
          : parseMarkdownFromTable(taxMd);

      dom.werkprogrammaContainer.innerHTML = `
        <fieldset id="form-fieldset">
          <div class="border-b border-gray-200">
            <nav class="-mb-px flex space-x-8" aria-label="Tabs">
              <button id="tab-client" class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Klant</button>
              <button id="tab-tax" class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Aangifte</button>
            </nav>
          </div>
          <div id="client-pane" class="content-pane py-4"></div>
          <div id="tax-pane" class="content-pane py-4 hidden"></div>
        </fieldset>`;

      const clientPane = document.getElementById('client-pane');
      const taxPane = document.getElementById('tax-pane');
      renderQuestions(clientQuestions, clientPane, 'client');
      renderQuestions(taxQuestions, taxPane, type);

      const tabClient = document.getElementById('tab-client');
      const tabTax = document.getElementById('tab-tax');

      setActiveButton(tabClient, '.tab-btn');
      tabClient.addEventListener('click', () => {
        setActiveButton(tabClient, '.tab-btn');
        clientPane.classList.remove('hidden');
        taxPane.classList.add('hidden');
      });
      tabTax.addEventListener('click', () => {
        setActiveButton(tabTax, '.tab-btn');
        clientPane.classList.add('hidden');
        taxPane.classList.remove('hidden');
      });

      updateUIForRoleAndStatus();
    } catch (error) {
      console.error(`Failed to load work program for ${type}:`, error);
      dom.werkprogrammaContainer.innerHTML =
        '<p class="text-red-500 text-center">Fout bij het laden van het werkprogramma.</p>';
    }
  }

  // --- AuditCase Integration Functions ---
  async function saveToAuditCase(questionData) {
    try {
      const token = sessionStorage.getItem('token');
      const clientNumber = dom.clientSelect.value;
      
      const response = await fetch(`/api/auditcase/dossier/${clientNumber}/werkprogramma`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: currentProgram,
          fiscalYear: dom.fiscalYearSelect.value,
          questionData: questionData,
          status: dossierStatus
        })
      });

      if (response.ok) {
        showToast('Werkprogramma opgeslagen in AuditCase');
      } else {
        throw new Error('Opslaan mislukt');
      }
    } catch (error) {
      console.error('Error saving to AuditCase:', error);
      showToast('Fout bij opslaan naar AuditCase');
    }
  }

  // --- Utility Functions ---
  function setActiveButton(activeButton, selector) {
    document
      .querySelectorAll(selector)
      .forEach((btn) => btn.classList.remove('active'));
    if (activeButton) activeButton.classList.add('active');
  }

  function renderQuestions(questions, container, type) {
    questions.forEach((q) =>
      container.appendChild(createQuestionElement(q, type)),
    );
  }

  function createQuestionElement(q, type) {
    if (q.isHeading) {
      const heading = document.createElement('h2');
      heading.className = 'werkprogramma-heading';
      heading.textContent = q.text;
      return heading;
    }

    const hasChildren = q.children && q.children.length > 0;
    const questionWrapper = document.createElement(
      hasChildren ? 'details' : 'div',
    );
    questionWrapper.className =
      'question-container py-4 border-b border-gray-200';
    questionWrapper.id = `question-${q.id}`;
    questionWrapper.dataset.questionId = q.id;

    const contentWrapper = document.createElement(
      hasChildren ? 'summary' : 'div',
    );

    const questionText = document.createElement('p');
    questionText.className = 'font-semibold text-gray-700 inline';
    questionText.textContent = q.isDetail ? q.text : `${q.id}. ${q.text}`;
    contentWrapper.appendChild(questionText);

    if (!q.isDetail) {
      const radioContainer = document.createElement('div');
      radioContainer.className = 'mt-2 flex items-center gap-x-6';
      radioContainer.innerHTML = `
        <label class="flex items-center space-x-2 cursor-pointer"><input type="radio" name="answer-${q.id}" value="yes" class="form-radio h-4 w-4 text-blue-600"><span>Ja</span></label>
        <label class="flex items-center space-x-2 cursor-pointer"><input type="radio" name="answer-${q.id}" value="no" class="form-radio h-4 w-4 text-blue-600"><span>Nee</span></label>
        <label class="flex items-center space-x-2 cursor-pointer"><input type="radio" name="answer-${q.id}" value="na" class="form-radio h-4 w-4 text-blue-600" checked><span>N.v.t.</span></label>`;
      if (type === 'ib' || type === 'client') {
        radioContainer.addEventListener('change', (e) =>
          handleAnswerChange(questionWrapper, q, e.target.value),
        );
      }
      contentWrapper.appendChild(radioContainer);
    }

    const commentContainer = document.createElement('div');
    commentContainer.className = 'mt-3 space-y-2';
    commentContainer.innerHTML = `
      <textarea id="comment-${q.id}" class="w-full p-2 border border-gray-300 rounded-md text-sm" placeholder="Voeg commentaar toe..." aria-label="Commentaar"></textarea>
      <label class="flex items-center space-x-2 cursor-pointer text-sm text-gray-600">
        <input type="checkbox" id="comment-rollover-${q.id}" class="form-checkbox h-4 w-4 text-blue-600 rounded">
        <span>Commentaar overnemen naar volgend jaar</span>
      </label>`;
    contentWrapper.appendChild(commentContainer);

    const uploadContainer = document.createElement('div');
    uploadContainer.className = 'mt-3 flex items-center gap-x-2';
    uploadContainer.innerHTML = `
      <input type="file" id="file-${q.id}" class="text-sm text-gray-500 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" aria-label="Upload bestand"/>
      <button class="upload-btn text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 px-2 rounded-md">Upload</button>
      <button id="preview-${q.id}" class="preview-btn hidden text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 px-2 rounded-md">Preview</button>
      <span id="upload-status-${q.id}" class="text-xs text-green-600"></span>`;
    uploadContainer
      .querySelector('.upload-btn')
      .addEventListener('click', () => handleFileUpload(q.id));
    uploadContainer
      .querySelector(`#preview-${q.id}`)
      .addEventListener('click', () => handleFilePreview(q.id));
    contentWrapper.appendChild(uploadContainer);
    questionWrapper.appendChild(contentWrapper);

    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'sub-question';
      renderQuestions(q.children, childrenContainer, type);
      questionWrapper.appendChild(childrenContainer);
    }
    return questionWrapper;
  }

  function handleAnswerChange(element, question, answer) {
    const condition = question.condition;
    if (!condition) {
      // Special logic for VPB fiscal eenheid questions
      if (currentProgram === 'vpb' && question.id === '1' && question.text && 
          question.text.toLowerCase().includes('fiscale eenheid')) {
        handleVPBFiscalEenheidLogic(answer);
      }
      return;
    }
    
    const shouldTrigger = condition.on === answer;
    if (condition.action === 'hide_children') {
      shouldTrigger
        ? element.removeAttribute('open')
        : element.setAttribute('open', '');
    } else if (condition.action === 'skip') {
      const allQuestions = document.querySelectorAll('.question-container');
      const startSkipId = parseInt(question.id, 10) + 1;
      const endSkipId = parseInt(condition.target, 10);
      allQuestions.forEach((el) => {
        const currentId = parseInt(el.dataset.questionId, 10);
        if (currentId >= startSkipId && currentId < endSkipId)
          el.classList.toggle('hidden', shouldTrigger);
      });
    }
  }

  function handleVPBFiscalEenheidLogic(answer) {
    // If first VPB question about fiscal eenheid is answered "no"
    if (answer === 'no') {
      // Hide all subsequent fiscal eenheid related questions
      const allQuestions = document.querySelectorAll('.question-container');
      let foundFirstQuestion = false;
      
      allQuestions.forEach((questionEl) => {
        const questionId = parseInt(questionEl.dataset.questionId, 10);
        
        if (questionId === 1) {
          foundFirstQuestion = true;
          return;
        }
        
        if (foundFirstQuestion && questionId <= 10) {
          // Hide questions 2-10 which are typically fiscal eenheid related
          questionEl.classList.add('hidden');
          questionEl.classList.add('vpb-fiscal-eenheid-conditional');
          
          // Clear any answers in these questions
          const radioInputs = questionEl.querySelectorAll('input[type="radio"]');
          radioInputs.forEach(radio => radio.checked = false);
          
          // Clear comments
          const commentInput = questionEl.querySelector('textarea');
          if (commentInput) commentInput.value = '';
        }
      });
      
      showToast('Fiscale eenheid vragen verborgen omdat deze niet van toepassing zijn.');
    } else if (answer === 'yes') {
      // Show all fiscal eenheid related questions
      const hiddenQuestions = document.querySelectorAll('.vpb-fiscal-eenheid-conditional');
      hiddenQuestions.forEach(questionEl => {
        questionEl.classList.remove('hidden');
        questionEl.classList.remove('vpb-fiscal-eenheid-conditional');
      });
      
      showToast('Fiscale eenheid vragen getoond.');
    }
  }

  async function handleFileUpload(questionId) {
    const fileInput = document.getElementById(`file-${questionId}`);
    const statusEl = document.getElementById(`upload-status-${questionId}`);
    const previewBtn = document.getElementById(`preview-${questionId}`);
    
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      statusEl.textContent = 'Uploading...';
      try {
        const token = sessionStorage.getItem('token');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('questionId', questionId);
        
        const res = await fetch('/api/auditcase/upload', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });
        
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        statusEl.textContent = `✔ ${file.name} uploaded.`;
        showToast(`Bestand ${file.name} verzonden naar AuditCase.`);
        
        if (file.type === 'application/pdf') {
          previewBtn.classList.remove('hidden');
          if (data && data.id) {
            previewBtn.dataset.docId = data.id;
          } else {
            previewBtn.dataset.localUrl = URL.createObjectURL(file);
          }
        }
      } catch (err) {
        statusEl.textContent = '';
        showToast('Upload mislukt.');
      }
    } else {
      showToast('Selecteer eerst een bestand.');
    }
  }

  async function handleFilePreview(questionId) {
    const btn = document.getElementById(`preview-${questionId}`);
    const docId = btn.dataset.docId;
    
    try {
      if (docId) {
        const token = sessionStorage.getItem('token');
        const clientNumber = dom.clientSelect.value;
        const res = await fetch(`/api/auditcase/files/${clientNumber}/${docId}/preview`, {
          headers: { 
            'Authorization': `Bearer ${token}`
          },
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else if (btn.dataset.localUrl) {
        window.open(btn.dataset.localUrl, '_blank');
      } else {
        showToast('Geen document beschikbaar.');
      }
    } catch (e) {
      showToast('Voorbeeld laden mislukt.');
    }
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // --- Question Tree and Progress Management ---
  function updateQuestionTree() {
    const treeContainer = dom.questionTree;
    if (!treeContainer) return;

    const treeItems = [
      {
        id: 'client-questions',
        label: 'Klantgegevens',
        status: questionProgress.clientQuestions,
        required: true
      },
      {
        id: 'aangifte-questions',
        label: currentProgram ? `${currentProgram.toUpperCase()} Aangifte` : 'Aangifte',
        status: questionProgress.aangifteQuestions,
        required: true,
        disabled: questionProgress.clientQuestions !== 'completed'
      }
    ];

    treeContainer.innerHTML = treeItems.map(item => `
      <div class="flex items-center p-2 rounded-md ${item.disabled ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}"
           data-section="${item.id}">
        <div class="flex-shrink-0 w-4 h-4 mr-3">
          ${getStatusIcon(item.status)}
        </div>
        <span class="text-sm ${item.disabled ? 'text-gray-400' : 'text-gray-700'}">${item.label}</span>
        ${item.required ? '<span class="text-red-500 ml-1">*</span>' : ''}
      </div>
    `).join('');

    // Add click handlers
    treeContainer.querySelectorAll('[data-section]').forEach(item => {
      if (!item.classList.contains('opacity-50')) {
        item.addEventListener('click', () => navigateToSection(item.dataset.section));
      }
    });
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'completed':
        return '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>';
      case 'in_progress':
        return '<svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
      default:
        return '<svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clip-rule="evenodd"></path></svg>';
    }
  }

  function navigateToSection(sectionId) {
    if (sectionId === 'client-questions') {
      questionProgress.clientQuestions = 'in_progress';
      showClientQuestions();
    } else if (sectionId === 'aangifte-questions') {
      if (questionProgress.clientQuestions === 'completed') {
        questionProgress.aangifteQuestions = 'in_progress';
        showAangifteQuestions();
      } else {
        showToast('Vul eerst alle klantgegevens in voordat u verder kunt met de aangifte.');
      }
    }
    updateQuestionTree();
  }

  function showClientQuestions() {
    dom.werkprogrammaContainer.innerHTML = `
      <div class="max-w-4xl">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Klantgegevens Verificatie</h2>
        <p class="text-gray-600 mb-6">Controleer en completeer de onderstaande klantgegevens voordat u verder gaat met de aangifte.</p>
        
        <div class="space-y-6" id="client-questions-form">
          <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <h3 class="text-lg font-semibold text-yellow-800 mb-4">Verplichte Controles</h3>
            
            <div class="space-y-4">
              <div class="question-item">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  1. Is de opdrachtbevestiging getekend en opgeslagen in het dossier? <span class="text-red-500">*</span>
                </label>
                <div class="flex space-x-4">
                  <label class="flex items-center">
                    <input type="radio" name="q1" value="yes" class="mr-2" required> Ja
                  </label>
                  <label class="flex items-center">
                    <input type="radio" name="q1" value="no" class="mr-2"> Nee
                  </label>
                </div>
              </div>

              <div class="question-item">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  2. Is er een kopie van het paspoort of identiteitsbewijs van de cliënt aanwezig? <span class="text-red-500">*</span>
                </label>
                <div class="flex space-x-4">
                  <label class="flex items-center">
                    <input type="radio" name="q2" value="yes" class="mr-2" required> Ja
                  </label>
                  <label class="flex items-center">
                    <input type="radio" name="q2" value="no" class="mr-2"> Nee
                  </label>
                </div>
              </div>

              <div class="question-item">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  3. Is de UBO (Ultimate Beneficial Owner) vastgesteld en gedocumenteerd? <span class="text-red-500">*</span>
                </label>
                <div class="flex space-x-4">
                  <label class="flex items-center">
                    <input type="radio" name="q3" value="yes" class="mr-2" required> Ja
                  </label>
                  <label class="flex items-center">
                    <input type="radio" name="q3" value="no" class="mr-2"> Nee
                  </label>
                  <label class="flex items-center">
                    <input type="radio" name="q3" value="na" class="mr-2"> N.v.t.
                  </label>
                </div>
              </div>

              <div class="question-item">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  4. Is het KYC (Know Your Customer) proces volledig doorlopen? <span class="text-red-500">*</span>
                </label>
                <div class="flex space-x-4">
                  <label class="flex items-center">
                    <input type="radio" name="q4" value="yes" class="mr-2" required> Ja
                  </label>
                  <label class="flex items-center">
                    <input type="radio" name="q4" value="no" class="mr-2"> Nee
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-4">
            <button id="validate-client-questions" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition" disabled>
              Klantgegevens Bevestigen
            </button>
          </div>
        </div>
      </div>
    `;

    // Add validation logic
    const validateBtn = document.getElementById('validate-client-questions');
    const form = document.getElementById('client-questions-form');
    
    form.addEventListener('change', () => {
      const requiredQuestions = ['q1', 'q2', 'q3', 'q4'];
      const allAnswered = requiredQuestions.every(q => 
        form.querySelector(`input[name="${q}"]:checked`)
      );
      validateBtn.disabled = !allAnswered;
    });

    validateBtn.addEventListener('click', () => {
      // Check if all required questions are answered with "yes"
      const criticalQuestions = ['q1', 'q2', 'q4'];
      const allCriticalYes = criticalQuestions.every(q => {
        const checked = form.querySelector(`input[name="${q}"]:checked`);
        return checked && checked.value === 'yes';
      });

      if (allCriticalYes) {
        questionProgress.clientQuestions = 'completed';
        showToast('Klantgegevens gevalideerd. U kunt nu verder met de aangifte.');
        updateQuestionTree();
      } else {
        showToast('Niet alle vereiste klantgegevens zijn compleet. Controleer de ontbrekende items.');
      }
    });
  }

  function showAangifteQuestions() {
    // This will load the existing aangifte questions
    loadAndRenderWorkProgram(currentProgram, getSelectedClientName(), dom.fiscalYearSelect.value);
  }

  function getSelectedClientName() {
    const selected = dom.clientSelect.selectedOptions[0];
    return selected ? selected.dataset.clientName || selected.textContent : '';
  }

  function checkClientQuestionsCompletion() {
    return questionProgress.clientQuestions === 'completed';
  }

  // --- Document Management Functions ---
  async function showDocumentManager() {
    const clientNumber = dom.clientSelect.value;
    const fiscalYear = dom.fiscalYearSelect.value;
    
    if (!clientNumber || !fiscalYear) {
      showToast('Selecteer eerst een cliënt en fiscaal jaar.');
      return;
    }

    try {
      // First create the year structure if it doesn't exist
      await createYearStructure(clientNumber, fiscalYear);
      
      dom.werkprogrammaContainer.innerHTML = `
        <div class="max-w-6xl">
          <h2 class="text-2xl font-bold text-gray-800 mb-6">Document Beheer - ${fiscalYear}</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Document Categories -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-blue-800 mb-3">📂 Permanente Documenten</h3>
              <p class="text-sm text-blue-600 mb-3">Documenten die elk jaar overgaan naar het volgende jaar</p>
              <div class="space-y-2">
                <div class="document-upload-area" data-category="permanent">
                  <input type="file" id="upload-permanent" class="hidden" multiple>
                  <label for="upload-permanent" class="cursor-pointer block w-full p-2 border-2 border-dashed border-blue-300 rounded text-center text-sm hover:bg-blue-100">
                    Klik om documenten te uploaden
                  </label>
                </div>
                <div id="permanent-docs" class="document-list"></div>
              </div>
            </div>

            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-green-800 mb-3">📋 Jaarlijkse Documenten</h3>
              <p class="text-sm text-green-600 mb-3">Documenten die elk jaar vervangen worden</p>
              <div class="space-y-2">
                <div class="document-upload-area" data-category="annual">
                  <input type="file" id="upload-annual" class="hidden" multiple>
                  <label for="upload-annual" class="cursor-pointer block w-full p-2 border-2 border-dashed border-green-300 rounded text-center text-sm hover:bg-green-100">
                    Klik om documenten te uploaden
                  </label>
                </div>
                <div id="annual-docs" class="document-list"></div>
              </div>
            </div>

            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-yellow-800 mb-3">📊 Analyses & Rapportages</h3>
              <p class="text-sm text-yellow-600 mb-3">Documenten waarvoor u per stuk kunt kiezen</p>
              <div class="space-y-2">
                <div class="document-upload-area" data-category="conditional">
                  <input type="file" id="upload-conditional" class="hidden" multiple>
                  <label for="upload-conditional" class="cursor-pointer block w-full p-2 border-2 border-dashed border-yellow-300 rounded text-center text-sm hover:bg-yellow-100">
                    Klik om documenten te uploaden
                  </label>
                </div>
                <div id="conditional-docs" class="document-list"></div>
              </div>
            </div>
          </div>

          <div class="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">📁 AuditCase Mappenstructuur</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="font-medium">Werkprogramma_${clientNumber}_${fiscalYear}/</p>
                <ul class="ml-4 mt-2 space-y-1 text-gray-600">
                  <li>├── 01_Permanente_Documenten/</li>
                  <li>├── 02_Jaarlijkse_Documenten/</li>
                  <li>├── 03_Werkprogramma_Vragen/</li>
                  <li>├── 04_Analyses_Rapportages/</li>
                </ul>
              </div>
              <div>
                <ul class="mt-7 space-y-1 text-gray-600">
                  <li>├── 05_Correspondentie/</li>
                  <li>├── 06_Archief/</li>
                  <li>└── 99_Temp_Upload/</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;

      // Add upload handlers
      setupDocumentUploads();
      
      // Show year rollover button for admin/reviewer
      if (currentUser.role === 'admin' || currentUser.role === 'reviewer') {
        dom.btnYearRollover.classList.remove('hidden');
      }

    } catch (error) {
      console.error('Error in document manager:', error);
      showToast('Fout bij laden document beheer.');
    }
  }

  async function createYearStructure(clientNumber, fiscalYear) {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/documents/${clientNumber}/years/${fiscalYear}/structure`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Year structure created:', result);
      } else {
        console.warn('Structure creation failed or already exists');
      }
    } catch (error) {
      console.error('Error creating year structure:', error);
    }
  }

  function setupDocumentUploads() {
    ['permanent', 'annual', 'conditional'].forEach(category => {
      const input = document.getElementById(`upload-${category}`);
      if (input) {
        input.addEventListener('change', (e) => handleCategoryUpload(e, category));
      }
    });
  }

  async function handleCategoryUpload(event, category) {
    const files = event.target.files;
    if (files.length === 0) return;

    const clientNumber = dom.clientSelect.value;
    const fiscalYear = dom.fiscalYearSelect.value;
    const token = sessionStorage.getItem('token');

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('fiscalYear', fiscalYear);
        formData.append('documentType', determineDocumentType(file.name, category));

        const response = await fetch(`/api/documents/${clientNumber}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          showToast(`${file.name} geüpload naar ${getCategoryDisplayName(category)}`);
          addDocumentToList(category, file.name, result);
        } else {
          throw new Error(`Upload failed: ${response.status}`);
        }
      } catch (error) {
        console.error(`Upload error for ${file.name}:`, error);
        showToast(`Fout bij uploaden ${file.name}`);
      }
    }

    // Clear the input
    event.target.value = '';
  }

  function determineDocumentType(filename, category) {
    const name = filename.toLowerCase();
    
    if (category === 'permanent') {
      if (name.includes('statuten')) return 'ARTICLES_ASSOCIATION';
      if (name.includes('vergunning') || name.includes('license')) return 'LICENSES';
      if (name.includes('contract')) return 'CONTRACTS_ONGOING';
      return 'COMPANY_STRUCTURE';
    }
    
    if (category === 'annual') {
      if (name.includes('jaarrekening')) return 'ANNUAL_REPORT';
      if (name.includes('aangifte')) return 'TAX_RETURN';
      if (name.includes('controle')) return 'AUDIT_REPORT';
      return 'MANAGEMENT_LETTER';
    }
    
    return 'ANALYSIS_REPORTS';
  }

  function getCategoryDisplayName(category) {
    switch (category) {
      case 'permanent': return 'Permanente Documenten';
      case 'annual': return 'Jaarlijkse Documenten';
      case 'conditional': return 'Analyses & Rapportages';
      default: return 'Overige Documenten';
    }
  }

  function addDocumentToList(category, filename, uploadResult) {
    const listContainer = document.getElementById(`${category}-docs`);
    if (!listContainer) return;

    const docElement = document.createElement('div');
    docElement.className = 'flex items-center justify-between p-2 bg-white rounded border text-sm';
    docElement.innerHTML = `
      <span class="truncate">${filename}</span>
      <span class="text-green-600 text-xs">✓</span>
    `;
    
    listContainer.appendChild(docElement);
  }

  async function showYearRollover() {
    const clientNumber = dom.clientSelect.value;
    const currentYear = parseInt(dom.fiscalYearSelect.value);
    const nextYear = currentYear + 1;
    
    if (!clientNumber) {
      showToast('Selecteer eerst een cliënt.');
      return;
    }

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/documents/${clientNumber}/years/${currentYear}/rollover?targetYear=${nextYear}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get rollover data: ${response.status}`);
      }

      const rolloverData = await response.json();
      
      dom.werkprogrammaContainer.innerHTML = `
        <div class="max-w-6xl">
          <h2 class="text-2xl font-bold text-gray-800 mb-6">Jaar Rollover: ${currentYear} → ${nextYear}</h2>
          
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 class="text-lg font-semibold text-blue-800 mb-2">Overzicht Documenten</h3>
            <div class="grid grid-cols-4 gap-4 text-center">
              <div class="bg-white p-3 rounded">
                <div class="text-2xl font-bold text-green-600">${rolloverData.summary.permanent}</div>
                <div class="text-sm text-gray-600">Automatisch Overzetten</div>
              </div>
              <div class="bg-white p-3 rounded">
                <div class="text-2xl font-bold text-orange-600">${rolloverData.summary.annual}</div>
                <div class="text-sm text-gray-600">Vervangen Vereist</div>
              </div>
              <div class="bg-white p-3 rounded">
                <div class="text-2xl font-bold text-blue-600">${rolloverData.summary.conditional}</div>
                <div class="text-sm text-gray-600">Gebruiker Beslist</div>
              </div>
              <div class="bg-white p-3 rounded">
                <div class="text-2xl font-bold text-gray-600">${rolloverData.summary.historical}</div>
                <div class="text-sm text-gray-600">Alleen Archiveren</div>
              </div>
            </div>
          </div>

          <div class="space-y-6" id="rollover-document-list">
            ${renderRolloverDocuments(rolloverData.documents)}
          </div>

          <div class="mt-8 flex justify-end space-x-4">
            <button id="btn-execute-rollover" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold">
              🚀 Rollover Uitvoeren
            </button>
            <button id="btn-cancel-rollover" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition">
              Annuleren
            </button>
          </div>
        </div>
      `;

      // Add event listeners
      document.getElementById('btn-execute-rollover').addEventListener('click', () => 
        executeRollover(clientNumber, currentYear, nextYear, rolloverData.documents)
      );
      
      document.getElementById('btn-cancel-rollover').addEventListener('click', showDocumentManager);

    } catch (error) {
      console.error('Error loading rollover data:', error);
      showToast('Fout bij laden rollover gegevens.');
    }
  }

  function renderRolloverDocuments(documents) {
    const grouped = {
      permanent: documents.filter(d => d.category === 'permanent'),
      annual: documents.filter(d => d.category === 'annual'),
      conditional: documents.filter(d => d.category === 'conditional'),
      historical: documents.filter(d => d.category === 'historical')
    };

    return Object.entries(grouped).map(([category, docs]) => {
      if (docs.length === 0) return '';
      
      const categoryInfo = {
        permanent: { title: 'Permanente Documenten', color: 'green', action: 'Automatisch overzetten' },
        annual: { title: 'Jaarlijkse Documenten', color: 'orange', action: 'Nieuwe versie vereist' },
        conditional: { title: 'Conditionele Documenten', color: 'blue', action: 'Selecteer actie' },
        historical: { title: 'Historische Documenten', color: 'gray', action: 'Alleen archiveren' }
      };

      const info = categoryInfo[category];

      return `
        <div class="bg-white border rounded-lg p-4">
          <h3 class="text-lg font-semibold text-${info.color}-800 mb-4">${info.title} (${docs.length})</h3>
          <p class="text-sm text-${info.color}-600 mb-4">${info.action}</p>
          
          <div class="space-y-2">
            ${docs.map(doc => `
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div class="flex-1">
                  <div class="font-medium">${doc.FileName}</div>
                  <div class="text-sm text-gray-600">${doc.Description || 'Geen beschrijving'}</div>
                  <div class="text-xs text-gray-500">${doc.currentPath}</div>
                </div>
                <div class="flex items-center space-x-2">
                  ${renderRolloverActions(doc, category)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderRolloverActions(document, category) {
    switch (category) {
      case 'permanent':
        return `<span class="text-green-600 text-sm">✓ Automatisch</span>`;
      
      case 'annual':
        return `
          <input type="file" id="replace-${document.$id}" class="hidden" accept=".pdf,.doc,.docx,.xlsx">
          <label for="replace-${document.$id}" class="cursor-pointer bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600">
            Nieuwe Upload
          </label>
        `;
      
      case 'conditional':
        return `
          <select class="rollover-action border rounded px-2 py-1 text-sm" data-doc-id="${document.$id}">
            <option value="copy">Overzetten</option>
            <option value="skip">Overslaan</option>
            <option value="archive">Archiveren</option>
          </select>
        `;
      
      case 'historical':
        return `<span class="text-gray-600 text-sm">📁 Archief</span>`;
      
      default:
        return '';
    }
  }

  async function executeRollover(clientNumber, fromYear, toYear, documents) {
    if (!confirm(`Weet u zeker dat u de rollover wilt uitvoeren van ${fromYear} naar ${toYear}?\n\nDit proces kan niet ongedaan worden gemaakt.`)) {
      return;
    }

    const selections = prepareRolloverSelections(documents);
    
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/documents/${clientNumber}/years/${fromYear}/rollover/${toYear}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ selections })
      });

      if (!response.ok) {
        throw new Error(`Rollover failed: ${response.status}`);
      }

      const results = await response.json();
      
      // Show results
      showToast(`Rollover voltooid! ${results.summary.successful} van ${results.summary.totalProcessed} documenten verwerkt.`);
      
      if (results.errors.length > 0) {
        console.warn('Rollover errors:', results.errors);
        showToast(`Let op: ${results.errors.length} documenten hadden fouten.`);
      }

      // Update fiscal year to new year
      dom.fiscalYearSelect.value = toYear;
      
      // Go back to document manager
      showDocumentManager();

    } catch (error) {
      console.error('Rollover execution error:', error);
      showToast('Fout bij uitvoeren rollover.');
    }
  }

  function prepareRolloverSelections(documents) {
    const selections = [];

    documents.forEach(doc => {
      let action = 'copy'; // default
      
      switch (doc.category) {
        case 'permanent':
          action = 'copy';
          break;
          
        case 'annual':
          const fileInput = document.getElementById(`replace-${doc.$id}`);
          action = fileInput && fileInput.files.length > 0 ? 'replace' : 'skip';
          break;
          
        case 'conditional':
          const select = document.querySelector(`[data-doc-id="${doc.$id}"]`);
          action = select ? select.value : 'skip';
          break;
          
        case 'historical':
          action = 'archive';
          break;
      }

      selections.push({
        document: doc,
        action: action,
        newFile: action === 'replace' ? document.getElementById(`replace-${doc.$id}`)?.files[0] : null
      });
    });

    return selections;
  }

  // --- Initialize the App ---
  init();
});
