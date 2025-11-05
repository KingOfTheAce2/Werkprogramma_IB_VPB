# Werkprogramma Fiscale Aangiftes - Nederlandse Belastingadviseurs

Een modern, veilig en gebruiksvriendelijk werkprogramma systeem voor Nederlandse belastingadviseurs, volledig geïntegreerd met AuditCase voor professioneel dossier beheer.

## 🚀 Kernfunctionaliteiten

### 📋 Werkprogramma Management
- **Structured Questionnaire Flow**: Verplichte klantvalidatie voorafgaand aan fiscale vragenlijsten
- **Conditional Logic**: Slimme vraaglogica (bijv. VPB fiscale eenheid vragen)
- **Visual Progress Tree**: Duidelijke voortgangsnavigatie met status indicators
- **Role-Based Access**: Belastingadviseur, Senior Adviseur, Kantoormanager rollen

### 🔐 Enterprise Security
- **Microsoft SSO Integration**: Azure AD authenticatie met demo-bypass
- **Session Management**: Veilige sessies met 8-uur timeout
- **Rate Limiting**: Bescherming tegen brute force aanvallen  
- **Input Validation**: XSS en injection preventie
- **Audit Logging**: Uitgebreide security event logging

### 📁 Smart Document Management
- **Gestructureerde AuditCase Opslag**: Automatische mappenstructuur per cliënt/jaar
- **Document Categorization**: 
  - 📂 **Permanente Documenten** (automatisch rollover)
  - 📋 **Jaarlijkse Documenten** (vervangen per jaar)
  - 📊 **Conditionele Documenten** (gebruiker beslist)
  - 📁 **Historische Documenten** (alleen archiveren)
- **Year-over-Year Rollover**: Intelligente documenttransitie tussen fiscale jaren
- **Version Control**: Document vervangingslogica met audit trail

### 🔄 AuditCase Integration
- **Client Import**: Automatische cliëntenlijst vanuit AuditCase
- **Structured Storage**: Georganiseerde folder structuur in AuditCase
- **Secure Upload/Download**: Backend-only API key management
- **Document Lifecycle**: Volledig beheer van document levenscyclus

## 📂 Project Structuur

```
📦 Werkprogramma_IB_VPB/
├── 📁 src/
│   ├── 📁 models/          # Document en data modellen
│   └── 📁 utils/           # Utility functies en helpers
├── 📁 js/                  # Frontend JavaScript
├── 📁 css/                 # Styling
├── 📁 docs/                # Documentatie
│   ├── 📁 werkprogramma/   # Werkprogramma templates
│   ├── SECURITY.md         # Security documentatie
│   └── AuditCase_API_Documentatie.md
├── index.html              # Hoofdapplicatie
├── login.html              # Login interface
├── server.js               # Express server
└── package.json            # Dependencies
```

### 🗂️ AuditCase Folder Structuur

Voor elke cliënt wordt automatisch deze structuur aangemaakt:

```
📁 Werkprogramma_{ClientNumber}_{FiscalYear}/
├── 📂 01_Permanente_Documenten/     # Statuten, vergunningen
├── 📋 02_Jaarlijkse_Documenten/     # Jaarrekeningen, aangiftes
├── 📝 03_Werkprogramma_Vragen/      # Ingevulde vragenlijsten
├── 📊 04_Analyses_Rapportages/      # Analyses en adviezen
├── 📧 05_Correspondentie/           # Email en brieven
├── 📁 06_Archief/                   # Historische documenten
└── 🔄 99_Temp_Upload/               # Tijdelijke uploads
```

## ⚡ Quick Start

### 1. Environment Setup
```bash
# Kopieer environment template
cp .env.example .env

# Configureer de volgende variabelen:
AZURE_CLIENT_ID=your-azure-app-id
AZURE_TENANT_ID=your-tenant-id  
AUDITCASE_API_KEY=your-auditcase-api-key
SESSION_SECRET=your-secure-session-secret
```

### 2. Dependencies Installeren
```bash
npm install
```

### 3. Server Starten
```bash
# Development
npm start

# Production
NODE_ENV=production npm start
```

### 4. Toegang
- **Development**: http://localhost:3000
- **Login**: Gebruik Microsoft SSO of demo accounts (jan/piet/klaas, password: 'password')

## 🔧 Configuratie

### Microsoft Azure AD Setup
1. Registreer applicatie in Azure Portal
2. Configureer redirect URI: `https://yourdomain.com/auth/microsoft/callback`
3. Voeg client ID en tenant ID toe aan `.env`

### AuditCase API Setup
1. Verkrijg X-API-KEY van AuditCase
2. Voeg toe aan `.env` als `AUDITCASE_API_KEY`
3. Test connectie via Document Manager

### Role Configuratie
- **Belastingadviseur**: Kan dossiers opstellen en indienen
- **Senior Adviseur**: Kan reviewen, afsluiten, heropenen + document rollover
- **Kantoormanager**: Alle rechten + gebruikersbeheer

## 📋 Workflow

### 1. Client Onboarding
1. **Login** via Microsoft SSO of demo
2. **Selecteer** IB/VPB programma
3. **Kies cliënt** uit AuditCase lijst
4. **Start werkprogramma** met automatische mappenstructuur

### 2. Document Lifecycle
1. **Upload documenten** in juiste categorieën
2. **Vul werkprogramma** in met conditionele logica
3. **Indienen voor review** (role-based)
4. **Year-end rollover** met slimme documentkeuzes

### 3. Year Transition Process
1. **Analyse documenten** van afgesloten jaar
2. **Categoriseer automatisch** op basis van type
3. **Gebruiker beslist** voor conditionele documenten
4. **Execute rollover** naar nieuw fiscaal jaar
5. **Vervang jaarlijkse** documenten met nieuwe versies

## 🔐 Security Features

### Authentication & Authorization
- Azure AD SSO met MFA ondersteuning
- Demo-modus voor ontwikkeling/testing
- Role-based access control (RBAC)
- Session timeout en rotation

### Data Protection  
- Input sanitisatie en validatie
- Content Security Policy (CSP)
- HTTPS enforcement in productie
- Secure cookie configuratie

### API Security
- Server-side API key management
- Rate limiting op login en API calls
- Request/response logging
- Error handling zonder data leakage

## 📊 Document Categories Explained

### 📂 Permanente Documenten
**Automatisch rollover naar volgend jaar**
- Statuten en oprichtingsakten
- Vergunningen en licenties
- Doorlopende contracten
- Organisatiestructuren

### 📋 Jaarlijkse Documenten  
**Vervangen met nieuwe versie elk jaar**
- Jaarrekeningen en financial statements
- Belastingaangiftes
- Accountantsverklaringen
- Management letters

### 📊 Conditionele Documenten
**Gebruiker beslist per document**
- Analyses en rapportages
- Correspondentie met belastingdienst
- Tijdelijke contracten
- Ad-hoc adviezen

### 📁 Historische Documenten
**Alleen archiveren, niet rollover**
- Oude versies van vervangen documenten
- Afgehandelde correspondentie
- Beëindigde entiteiten
- Historische analyses

## 🔄 Year Rollover Logic

### Automatische Acties
- **Permanente documenten**: Kopiëren naar nieuw jaar
- **Historische documenten**: Verplaatsen naar archief

### Gebruiker Acties Vereist
- **Jaarlijkse documenten**: Upload nieuwe versie of sla over
- **Conditionele documenten**: Kies per document: kopiëren/archiveren/overslaan

### Rollover Proces
1. **Analyse**: Scan alle documenten van afgesloten jaar
2. **Categoriseer**: Bepaal automatisch documenttype
3. **Review**: Toon gebruiker overzicht met acties
4. **Execute**: Voer rollover uit met audit trail
5. **Verify**: Controleer nieuwe jaar structuur

## 🚨 Troubleshooting

### Veelvoorkomende Issues
- **AuditCase connectie fout**: Controleer API key in `.env`
- **Microsoft SSO fout**: Verifieer Azure AD configuratie
- **Upload fout**: Check file permissions en grootte limits
- **Session timeout**: Herlogin na 8 uur inactiviteit

### Debug Mode
```bash
# Start met debug logging
DEBUG=werkprogramma:* npm start
```

### Support
- **Issues**: https://github.com/your-repo/issues
- **Documentation**: Zie `/docs` folder
- **Security**: Zie `docs/SECURITY.md`

## 📈 Roadmap

### Toekomstige Features
- [ ] Bulk client import/export
- [ ] Advanced reporting dashboard  
- [ ] Email notificaties voor deadlines
- [ ] Mobile responsive interface
- [ ] API voor externe integraties
- [ ] Machine learning voor document classificatie

## 🤝 Contributing

1. Fork het project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

Dit project is gelicenseerd onder de MIT License - zie het [LICENSE](LICENSE) bestand voor details.

---

**Made with ❤️ for Dutch Tax Professionals**