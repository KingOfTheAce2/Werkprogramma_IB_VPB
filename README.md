# Aangifte Werkprogramma IB&VPB

Vastleggingsprogramma voor fiscale aangiftes inkomstenbelasting en vennootschapsbelasting met drie delen:
1. **Klant** klantdossier, UBO, paspoort, KYC, opdrachtbevestiging
2. **Vastleggingsprogramma** workflow en audit trail voor IB en VPB
3. **Reviewer-only** afsluiten en vergrendelen van dossiers voor iedereen behalve reviewers

Het bestand `werkprogramma_inkomstenbelasting.md` bevat een sjabloon voor het werkprogramma inkomstenbelasting.

## Kernfeatures

- KYC en onboarding met bewijsstukken, UBO vastlegging, PEP en sanctiechecks als extensie
- Dossier per belastingsoort IB en VPB, met statussen Draft, Ingediend, Gereviewd, Afgesloten
- Audit trail op alle mutaties, inclusief wie, wat, wanneer en waarom
- Reviewer-lock bij afsluiting, alleen reviewer of admin kan heropenen met reden
- RBAC rollen Medewerker, Reviewer, Admin met fijnmazige permissies
- Documentbeheer met versiehistorie en checksum
- Configurabele checklists per aangiftetype en per klant

## Architectuur op hoofdlijnen

- **apps/api** REST API met authenticatie en RBAC
  - Endpoints voorbeeld
    - `POST /clients` aanmaken klant
    - `POST /clients/:id/kyc` vastleggen KYC
    - `POST /filings` nieuw IB of VPB dossier
    - `POST /filings/:id/submit` indienen
    - `POST /filings/:id/review` markeer als gereviewd
    - `POST /filings/:id/close` afsluiten, vereist rol Reviewer
    - `GET /audit?entity=filing&id=...` audit trail
- **apps/web** UI met drie secties
  - Klant, Vastlegging, Reviewer
- **packages/schemas** gedeelde datamodellen
  - `Client`, `UBO`, `KYCDocument`, `EngagementLetter`, `Filing`, `ChecklistItem`, `AuditLog`, `User`, `Role`
- **packages/auth** policies en middleware
  - RBAC matrix en reviewer-lock regels
- **infra** Postgres, object storage voor documenten, migrations

## Rollen en permissies

| Actie                         | Medewerker | Reviewer | Admin |
|------------------------------|-----------:|---------:|------:|
| Klant aanmaken               | Ja         | Ja       | Ja    |
| KYC vastleggen               | Ja         | Ja       | Ja    |
| Dossier aanmaken             | Ja         | Ja       | Ja    |
| Dossier indienen             | Ja         | Ja       | Ja    |
| Reviewen                     | Nee        | Ja       | Ja    |
| Afsluiten dossier            | Nee        | Ja       | Ja    |
| Heropenen na afsluiting      | Nee        | Ja       | Ja    |
| Rollen beheren               | Nee        | Nee      | Ja    |

Reviewer-lock: zodra een dossier is afgesloten is het read-only voor iedereen, behalve Reviewer en Admin. Heropenen vereist reden en wordt gelogd.

## Datamodellen in het kort

```ts
// packages/schemas/src/types.ts
export type FilingType = "IB" | "VPB";
export type FilingStatus = "DRAFT" | "SUBMITTED" | "REVIEWED" | "CLOSED";

export interface Client {
  id: string;
  naam: string;
  kvk?: string;
  bsnOfBtw?: string;
  adres?: string;
  contactEmail?: string;
  ubo: UBO[];
  kyc: KYCRecord[];
  documenten: DocumentRef[];
}

export interface UBO {
  id: string;
  naam: string;
  geboortedatum?: string;
  nationaliteit?: string;
  belangPercentage?: number;
  idBewijsDocumentId?: string;
}

export interface KYCRecord {
  id: string;
  datum: string;
  uitkomst: "GOEDGEKEURD" | "AFGEKEURD" | "NADER_ONDERZOEK";
  toelichting?: string;
  bewijsDocumenten: string[];
}

export interface Filing {
  id: string;
  clientId: string;
  type: FilingType;
  status: FilingStatus;
  boekjaar: string;
  checklist: ChecklistItem[];
  documenten: DocumentRef[];
  reviewerLock: boolean;
}

export interface ChecklistItem {
  id: string;
  titel: string;
  voltooid: boolean;
  opmerking?: string;
}

export interface AuditLog {
  id: string;
  entity: "CLIENT" | "FILING" | "DOCUMENT" | "AUTH";
  entityId: string;
  actorUserId: string;
  timestamp: string;
  actie: string;
  reden?: string;
  diff?: unknown;
}
```

## Beveiliging en privacy

AVG by design, minimaliseer persoonsgegevens en definieer bewaartermijnen
Documenten worden versleuteld opgeslagen, transport via TLS
Alle acties worden in AuditLog vastgelegd
Gebruik secrets via environment variables en rotation

## GitHub Pages demo

Open `login.html` to sign in and then continue to `index.html` for the main application.
Use one of the demo accounts:

- `jan` / `password`
- `piet` / `password`
- `klaas` / `password`

Wanneer er geen backend beschikbaar is, valt de loginpagina terug op deze lokale demo-accounts zodat je de UI kunt verkennen. Als de server draait (`npm start`), worden dezelfde gegevens gevalideerd via de API.
