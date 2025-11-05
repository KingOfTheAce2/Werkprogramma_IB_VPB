# Authenticatie Aanpassing

Starting with version 19.4, **AuditCase** will use a new authentication method for its API due to an upcoming application server update. This update includes a more robust encryption algorithm.

This change impacts users of the **mobile app**, **Office365 add-in**, **Microsoft Power Automate**, and partners who integrate with the **AuditCase API**. A new token must be registered for these applications.

-----

## Planning

The old and new authentication methods will both work during the period from the moment customers install AuditCase 19.4 until the application server is updated. Our goal is to have all customers on a new AuditCase version before April 11. The plan is as follows:

  * Once a new version of AuditCase is installed, users can upgrade their tokens.
  * When all clients have been updated, partners can upgrade their tokens and adjust their calls.
  * After all tokens have been updated and partners have made the necessary call adjustments, the application server will be updated to the latest version.

-----

## Required Actions for Users and Partners

An action is required from users and partners between April 11 and the application server update.

  * **Users** are asked to register a new token (see support article).
  * **Partners** are asked to adjust their API calls and tokens (see "Technical Adjustment for Partners" below).

-----

## Token Adjustment for Users

A new token will automatically be in the new format when requested. The old token can then be revoked using the "intrekken" (revoke) button.

-----

## Technical Adjustment for Partners

Previously, API calls used the **"Authorization"** header with a **"bearer \<token\>"**. This will be changed to an **"X-API-KEY"** header that carries the token.

For **Postman** users, an API call will look like this:

-----

## Technical Adjustment for AuditCase Clients

The **c2cuploader** must be updated to the latest version during the overlap period.

-----

## More Information

  * [Toegang tot de API](https://support.caseware.nl/hc/nl/articles/9657623948061-Toegang-tot-de-API)
  * [Upload](https://support.caseware.nl/hc/nl/articles/9657684594589-Upload)
  * [Release notes 19.4](https://support.caseware.nl/hc/nl/articles/15951921431709-Release-notes-19-4)

-----

## Client Information: Search for Last Modified Clients

*Updated 7 months ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/clients/updated?days={days}&hours={hours}`
      * **Example:** `ac/api/clients/updated?days=1`
  * **From version 21.0.0, the endpoint has a new call:** `GET {apiurl}/v1/clients/updated?days={days}&hours={hours}`
      * **Example:** `ac/api/v1/clients/updated?days=1`

This method retrieves client information from AuditCase. The example retrieves all clients updated within the last day. The returned information can be used to retrieve more details with this call: [https://support.caseware.nl/hc/nl/articles/9657637050269](https://support.caseware.nl/hc/nl/articles/9657637050269).

**URL Parts**

| URL Part | Example |
| :--- | :--- |
| `{apiurl}` | `https://ac.klant.nl/ac/api/v1` |
| `{days}` | Number of days (up to a maximum of 365). Days and hours are added together to determine the list. |
| `{hours}` | Number of hours (up to a maximum of 24). Days and hours are added together to determine the list. |

**Response (example)**

```json
[
  {
    "id": "831D3CD7D7573ED4C1258569003E02CC",
    "name": "naam van klant 1",
    "number": "112",
    "type": "COMPANY_CLIENT",
    "system": {
      "lastModified": "2023-12-19T16:21:17.000Z"
    }
  },
  {
    "id": "9734EBBC7E870F80C12589DB0035DDF9",
    "name": "naam van klant 2",
    "number": "00309271",
    "type": "PERSON_CLIENT",
    "system": {
      "lastModified": "2023-12-18T15:52:56.000Z"
    }
  }
]
```

-----

## Client Information: Signature

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/export/{klantnummer}/{klantprofiel}`
      * **Example:** `ac/api/export/1001004/handtekening`

This method retrieves client information from AuditCase. It retrieves less information than the "KLANTPROFIEL" call and is therefore processed faster.

**URL Parts**

| URL Part | Example |
| :--- | :--- |
| `{apiurl}` | `https://ac.klant.nl/ac/api` |
| `{klantprofiel}` | `handtekening` |
| `{klantnummer}` | `"1001004"` (client number or key) |

**Response (example)**

```json
[
  {
    "accountantemail": "1234567890@mail.nl",
    "accountantbusinessname": "T. 4",
    "klantnaam": "Bookstores Holding",
    "relatieeigenaarbusinessname": "F.K. F Kranenburg",
    "accountant": "Teamlid 4",
    "klantnummer": "1001004",
    "relatieeigenaar_email": "ferry.kranenburg@changetocomm.nl",
    "relatie_eigenaar": "Ferry Kranenburg",
    "bedrijfsnaam": "Bookstores Holding"
  }
]
```

-----

## Download Export Tasks Data

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/export/tasks/full/excel`
      * **Example:** `"/ac/api/export/tasks/full/excel"`

From version 15.8.0, it is possible to retrieve the latest export file, which is automatically generated every evening, with a single call. This export file is useful for use in **Power Automate**.

**Important:** You need additional access as an AuditCase API user for this call. Please request this from Change to Comm.

**GET data (type: application/octet-stream)**
The content of the Excel file is returned directly.

-----

## Client Information: Client Profile

*Updated 1 year ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/export/{klantnummer}/klantprofiel`
      * **Example:** `ac/api/export/1001004/klantprofiel`

This method retrieves client information from AuditCase. You must have a client number or technical key from AuditCase. This API call can be requested with a single URL.

**URL Parts**

| URL Part | Example |
| :--- | :--- |
| `{apiurl}` | `https://ac.klant.nl/ac/api` |
| `{klantnummer}` | `"1001004"` (client number or key) |

**Response (example)**

```json
[
  {
    "statutairevestigingsplaats": "",
    "adresland": "NL",
    "fiscaalnummer": "8100.75.179",
    "rechtsvorm": "Besloten Vennootschap met gewone structuur",
    "peradresregel": "",
    "oprichtingsdatum": "01-04-1999",
    "medewerkers": [
      {
        "addressering": "drs. J Bakker RA RE",
        "e-mailadres": "info@changetocomm.nl",
        "discipline": "Declarant",
        "personeelsnummer": "20008",
        "naam": "Jan Bakker",
        "_key": "DECLARANT"
      }
    ],
    "adreshuisnummer": "101",
    "anderewijzevanidentificatie": "",
    "adresstraat": "Anthonie Fokkerstraat",
    "corradreshuisnummertoevoeging": "B",
    "corrpostcode": "2222 BB",
    "locaties": [
      {
        "locatienaam": "Lunteren",
        "locatiepostcode": "6741 AA",
        "telefoonnummer": "+31342424570",
        "locatieperadresregel": "",
        "locatiestraat": "Dorpstraat",
        "locatiehuisnummertoevoeging": "",
        "locatieplaats": "Lunteren",
        "locatiehuisnummer": "5",
        "locatieregio": ""
      }
    ],
    "kvknummer": "69372179",
    "corradreshuisnummer": "101",
    "telefoonnummer": "+31342424570",
    "statutairezetelland": "Nederland",
    "contactpersonen": [
      {
        "functie_contactpersoon": "",
        "naam_samengesteld": "Kamphuis",
        "ubo": "ja",
        "aanschrijfwijze": "Eigen naam",
        "tussenvoegsel": "",
        "e-mailadres": "info@changetocomm.nl",
        "mobielnummer": "06-9999999",
        "titelna": "",
        "faxnummer": "",
        "naam": "Kamphuis",
        "geslacht": "v",
        "titelvoor": "",
        "partner_naam": "",
        "telefoonnummer": "34637463764736476",
        "partner_voorvoegsel": "",
        "voorletters": "K.",
        "voornaam": "Karin",
        "pep": "ja",
        "contactpersoon_bestuurder": "Nee",
        "id": "8A93A9FA1DA7769CC12577AB004AFE25",
        "portal": "N"
      },
      {
        "functie_contactpersoon": "Office manager",
        "naam_samengesteld": "Ferdinand",
        "ubo": "nee",
        "aanschrijfwijze": "Eigen naam",
        "tussenvoegsel": "",
        "e-mailadres": "franz.ferdinand@bookstoresholding.nl",
        "mobielnummer": "06-11001100",
        "titelna": "",
        "faxnummer": "",
        "naam": "Ferdinand",
        "geslacht": "m",
        "titelvoor": "",
        "partner_naam": "",
        "telefoonnummer": "",
        "partner_voorvoegsel": "",
        "voorletters": "F.",
        "voornaam": "Franz",
        "pep": "nog te bepalen",
        "contactpersoon_bestuurder": "Nee",
        "id": "91A888B2CC9EA961C12577EE005885A7",
        "portal": "J"
      },
      {
        "functie_contactpersoon": "",
        "naam_samengesteld": "Karelsen",
        "ubo": "nog te bepalen",
        "aanschrijfwijze": "Eigen naam",
        "tussenvoegsel": "",
        "e-mailadres": "info@changetocomm.nl",
        "mobielnummer": "06-55333256",
        "titelna": "",
        "faxnummer": "",
        "naam": "Karelsen",
        "geslacht": "m",
        "titelvoor": "",
        "partner_naam": "",
        "telefoonnummer": "0342-424570",
        "partner_voorvoegsel": "",
        "voorletters": "H.",
        "voornaam": "Harrie",
        "pep": "nog te bepalen",
        "contactpersoon_bestuurder": "Nog te bepalen",
        "id": "06BE3E4866C54315C1257E2D003320C7",
        "portal": "N"
      },
      {
        "functie_contactpersoon": "",
        "naam_samengesteld": "Bol",
        "ubo": "nog te bepalen",
        "aanschrijfwijze": "Eigen naam",
        "tussenvoegsel": "",
        "e-mailadres": "test@changetocomm.nl",
        "mobielnummer": "",
        "titelna": "",
        "faxnummer": "0222-222223",
        "naam": "Bol",
        "geslacht": "v",
        "titelvoor": "",
        "partner_naam": "Grootte",
        "telefoonnummer": "0222-222222",
        "partner_voorvoegsel": "",
        "voorletters": "H.",
        "voornaam": "Henny",
        "pep": "nog te bepalen",
        "contactpersoon_bestuurder": "Nog te bepalen",
        "id": "3753E4C83794030EC12577EE003C2B1E",
        "portal": "N"
      },
      {
        "functie_contactpersoon": "",
        "naam_samengesteld": "Werklust",
        "ubo": "nog te bepalen",
        "aanschrijfwijze": "Eigen naam",
        "tussenvoegsel": "",
        "e-mailadres": "info@changetocomm.nl",
        "mobielnummer": "",
        "titelna": "",
        "faxnummer": "",
        "naam": "Werklust",
        "geslacht": "m",
        "titelvoor": "",
        "partner_naam": "",
        "telefoonnummer": "",
        "partner_voorvoegsel": "",
        "voorletters": "K",
        "voornaam": "Karel",
        "pep": "nog te bepalen",
        "contactpersoon_bestuurder": "Nog te bepalen",
        "id": "DCD190104A341F8AC12582CD004AD5D2",
        "portal": "N"
      }
    ],
    "corradresstraat": "Amalialaan",
    "klantnummer": "1001004",
    "corrplaats": "Amersfoort",
    "portal": "J",
    "adresregio": "",
    "statutairenaam": "Bookstore Holding BV",
    "klantnaam": "Bookstores Holding",
    "plaats": "Amersfoort",
    "emailadresbedrijf": "infoo@bookstoresholding.nl",
    "postcode": "2222 BB",
    "faxnummer": "",
    "adreshuisnummertoevoeging": "B",
    "kantoor": "Wageningen",
    "sbiomschrijving": "Winkels in kranten, tijdschriften en kantoorbehoeften",
    "bedrijfsnaam": "Bookstores Holding",
    "declarant_personeelsnummer": "20008",
    "sbicode": "4762",
    "opdrachttype": [
      "Samenstellen jaarrekening",
      "Advies",
      "Loonheffing",
      "Controle jaarrekening",
      "Inkomstenbelasting",
      "Kredietrapportage",
      "Omzetbelasting",
      "Vennootschapsbelasting",
      "Loonheffing onder convenant",
      "Publicatiestukken Deponeren KvK onder convenant",
      "Inkomstenbelasting onder convenant"
    ],
    "vennoot_personeelsnummer": "20008",
    "homepage": "www.bookstoresholding.nl",
    "vennoot": "Jan Bakker"
  }
]
```

**Additional Personal Data (from version 19.0.0)**

```json
[
  "persoonsgegevens": {
    "voorletters": "P",
    "geslachtsnaam": "110",
    "titelvoordenaam": "",
    "fiscaalvolgnummer": "123",
    "voornaam": "",
    "titelachterdenaam": "",
    "voorvoegsel": "",
    "geslacht": "v",
    "geboortedatum": "24-10-2023",
    "predicaat": "",
    "geboorteplaats": "Wageningen",
    "overlijdensdatum": ""
  }
]
```

**Extra fields (from version 19.8.0)**

  * **IBAN-bank numbers (max 6):**
    ```json
    "iban_ekeningnummers": [
      {
        "bankrekening": "123456789"
      },
      {
        "bankrekening": "456789"
      }
    ]
    ```
  * **Links:**
    ```json
    "Koppelingen": [
      {
        "koppeling_cliëntonline": true,
        "koppeling_fiscaalGemak": false,
        "koppeling_casewareCloud": false,
        "koppeling_afas": false,
        "koppeling_nextens": false,
        "koppeling_hix": false
      }
    ],
    "koppelingen_administraties": [
      {
        "koppeling_qicsmilestones": true,
        "koppeling_exactonline": true,
        "koppeling_twinfield": false,
        "te_koppelen_administraties": [
          {
            "administratie": "Admin1"
          },
          {
            "administratie": "Admin2"
          }
        ]
      }
    ]
    ```
  * **Extra fields:** `facturatie_e-mailadres`, `buitenlands_omzetbelastingnummer`, `omzetbelastingnummer`, `btw-identificatienummer`, `onderdeel_van_fiscale_eenheid_omzetbelasting`, `klantnummer_hoofd_fiscale_eenheid`, `onderdeel_fiscale_eenheid_voor_vpb`, `klantnummer_hoofd_fiscaleeenheid_vpb`, `klantnummer_hoofd_fiscaleeenheid_vpb`, `wwft_is_hoofd`, `wwft_hoofd_entiteit_klantnummer`, and all employees listed under the Employee tab.

-----

## Document: Create Contact Person

*Updated 2 years ago*

  * **Possible HTTP methods:** POST
  * **URL:**
      * For a client-person: `{URL}/document/contact/create/{klantsleutel}/person_contact`
      * For a client-company: `{URL}/document/contact/create/{klantsleutel}/company_contact`

This call creates a new contact person for a client in AuditCase. It requires a client key or client number. The document is created in AuditCase and undergoes validation. If the document cannot be created successfully, the sender will be notified, and the HTTP status will be **400**.

**URL Parts**

| URL Part | Value |
| :--- | :--- |
| `{klantnummer}` | Client number or technical key of the client |

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| Name | `"Pietersen"` | No | Name (last name) |
| Initials | `"L.P."` | No | Initials |
| Gender | `"m"` | No | Only the values `"v"` (female) and `"m"` (male) are accepted. |
| Prefixname | `"van der"` | Yes | Prefix |
| Firstname | `"Karel"` | Yes | First name |
| Businessemail | | Yes | Business email address |
| Privateemail | | Yes | Private email address |
| Businessmobile | | Yes | Business mobile number |
| Privatemobile | | Yes | Private mobile number |

**Response (example)**

```json
{
  "ClientKey": "4323C35D03983218C1257F340051D361",
  "DocumentId": "4323C35D03983218C1257F340051D361",
  "PermanentLink": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=60CF6DB60A1F7EE7C1256D1E00305ED8&key=4323C35D03983218C1257F340051D361&modulename=DOSSIER",
  "Created": true
}
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| ClientKey | Key of this client. | String |
| Created | True/false if the action was successful. | Boolean |
| DocumentId | Direct key to the created document. | String |
| PermanentLink | Permanent link to the created document. | String |

-----

## Document: Create Dossier Item

*Updated 2 years ago*

  * **Possible HTTP methods:** POST
  * **URL:** `POST {apiurl}/document/dossier/create/{klantnummer}/{configuratietype}`
      * **Example:** `/ac/api/document/dossier/create/C1001005/dossierstuk`

This call automatically creates a dossier item in AuditCase. It requires at least the client number and configuration type (provided by Change to Comm). The dossier item is automatically populated with client data from AuditCase based on the configuration.

During the call, the dossier item will be created and validated. If it cannot be created, an HTTP status **400** will be returned with a message indicating the failure and reason.

**URL Parts**

| URL Part | Value |
| :--- | :--- |
| `{klantnummer}` | Client number or ID of the client |
| `{configuratietype}` | To be provided by Change to Comm, e.g., `"dossierstuk"`. |

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| file | | Yes | File to be included in the dossier item. Multiple files can be sent. |
| ShortDescriptionDO | `"Jaarrekening 2016"` | Yes | A short description of the dossier item. This can also be included in the AuditCase configuration. |
| AssignmentType | `"DO_1"` | Yes | Used to specify the dossier structure. The value is provided by Change to Comm. This can also be included in the AuditCase configuration. |
| AssignmentYear | `"2018"` | Yes | If a year is included in the dossier structure, this provides the year. If not provided, the current year is used. |

**Response (example)**

```json
{
  "DocumentId": "4323C35D03983218C1257F340051D361",
  "PermanentLink": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=60CF6DB60A1F7EE7C1256D1E00305ED8&key=4323C35D03983218C1257F340051D361&modulename=DOSSIER",
  "ClientKey": "ABC12345ABC",
  "Created": true
}
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| Created | True/false if the action was successful. | Boolean |
| DocumentId | Direct key to the created document. | String |
| PermanentLink | Permanent link to the created document. | String |
| ClientKey | Technical key of the linked client. | String |

-----

## Document: Create Dossier Item + Send to ValidSign

*Available from AuditCase version 14.8.*

  * **Possible HTTP methods:** POST

To submit a file to AuditCase, use the **Document: Create Dossier Item** article.

The following additional variables can be included in the request. Alternatively, an automatic link can be created based on various employee fields on the client card. There is also an option to always automatically sign with the professional certificate. Contact our support department to set this up.

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| ValidSignSender | `"Ferry Kranenburg/ChangeToComm"` | Yes | The sender must be a technical username (including /) and have an active user profile with 'Heeft Validsign account' set to 'Ja'. |
| ValidSignSigner1 | `"Bas Baas/ChangeToComm"` | Yes | The first signer. The signer must be a technical username (including /) and have an active user profile. |

**Important:** A PDF file containing the **ValidSign text tags** must be uploaded. The submission of the file to ValidSign runs through a separate process in AuditCase, so there will be no direct feedback on whether the file was successfully forwarded. If something goes wrong, it will be visible in AuditCase.

-----

## Document: Create Client Company (Prospect)

*Updated 2 years ago*

  * **Possible HTTP methods:** POST
  * **URL:** `POST {apiurl}/document/client/create/company_prospect`

This call creates a new client company (prospect) in AuditCase. If successful, the response will return a **'ClientKey'**. This key can be used to create contact persons for the newly created client, for example.

The document is created and validated in AuditCase. If it cannot be created, the sender will be notified. The HTTP status will be **400** if the document was not created successfully.

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| Companyname | `"Bigdata b.v."` | No | Name of the company. |
| ChamberOfCommerceNumber | | Yes | Chamber of Commerce number. |
| City | `"Barneveld"` | Yes | City of the correspondence address. |
| Street | `"Straathof"` | Yes | Street name of the correspondence address. |
| Streetnumber | `"1"` | Yes | House number of the correspondence address. |
| Postalcode | `"1234 AB"` | Yes | Postal code of the correspondence address. |

**Response (example)**

```json
{
  "ClientKey": "4323C35D03983218C1257F340051D361",
  "DocumentId": "4323C35D03983218C1257F340051D361",
  "PermanentLink": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=60CF6DB60A1F7EE7C1256D1E00305ED8&key=4323C35D03983218C1257F340051D361&modulename=DOSSIER",
  "Created": true
}
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| ClientKey | Final key of this client. Other calls on this client can be executed based on this key. | String |
| Created | True/false if the action was successful. | Boolean |
| DocumentId | Direct key to the created document. | String |
| PermanentLink | Permanent link to the created document. | String |

-----

## Document: Create Client Person (Prospect)

*Available from AuditCase version 6.9.*

  * **Possible HTTP methods:** POST
  * **URL:** `POST {apiurl}/document/client/create/person_prospect`

This call creates a new client person (prospect) in AuditCase. If successful, the response returns a **'ClientKey'**. This key can be used to create contact persons for the newly created client.

The document is created and validated in AuditCase. If it cannot be created, the sender will be notified. As of AuditCase version 10.8, the HTTP status will be **400** if the document was not created successfully.

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| Name | `"Pietersen"` | No | Name (last name) |
| Prefixname | `"van der"` | Yes | Prefixes |
| Firstname | `"Gerrit"` | Yes | First name |
| BSN | | Yes | BSN of the client |
| Initials | `"L.P."` | No | Initials |
| Gender | `"m"` | No | Only the values `"v"` (female) and `"m"` (male) are accepted. |
| City | `"Barneveld"` | Yes | City of the correspondence address. |
| Street | `"Straathof"` | Yes | Street name of the correspondence address. |
| Streetnumber | `"1"` | Yes | House number of the correspondence address. |
| Postalcode | `"1234 AB"` | Yes | Postal code of the correspondence address. |
| Privateemail | | Yes | Private email address |
| Privatemobile | | Yes | Private mobile number |

**Response (example)**

```json
{
  "ClientKey": "4323C35D03983218C1257F340051D361",
  "DocumentId": "4323C35D03983218C1257F340051D361",
  "PermanentLink": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=60CF6DB60A1F7EE7C1256D1E00305ED8&key=4323C35D03983218C1257F340051D361&modulename=DOSSIER",
  "Created": true
}
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| ClientKey | Final key of this client. Other calls on this client can be executed based on this key. | String |
| Created | True/false if the action was successful. | Boolean |
| DocumentId | Direct key to the created document. | String |
| PermanentLink | Permanent link to the created document. | String |

-----

## Document: Create/Update Task

*Updated 2 years ago*

  * **Possible HTTP methods:** POST, PUT
  * **URL:** `POST {apiurl}/document/task/create/{klantnummer}/{configuratietype}`
      * **Example:** `/ac/api/document/task/create/C1001005/dotoffice`

This call automatically creates a task in AuditCase. It requires at least the client number and configuration type (provided by Change to Comm). The task is automatically populated with client data from AuditCase based on the configuration.

During the call, the task will be created and validated. If it cannot be created, the sender will be notified, and the HTTP status will be **400**.

**URL Parts**

| URL Part | Value |
| :--- | :--- |
| `{klantnummer}` | Client number or technical key of the client |
| `{configuratietype}` | To be provided by Change to Comm, e.g., `"dotoffice"`. |

**POST data (type: multipart/form-data)**

| key | example value | Optional | Description |
| :--- | :--- | :--- | :--- |
| connectedDocText | `"Link naar document.pdf"` | Yes | Title of the link on the task |
| connectedDocPermLink | `"https://www.google.com/?q=changetocomm"` | Yes | URL of the link on the task. |
| connectedDocID | `"e-signeddocument"` | Yes | Not optional if the above parameters are sent. A "dummy" value is expected here. |

**Response (example)**

```json
{
  "DocumentId": "4323C35D03983218C1257F340051D361",
  "PermanentLink": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=60CF6DB60A1F7EE7C1256D1E00305ED8&key=4323C35D03983218C1257F340051D361&modulename=TAKEN",
  "Created": true
}
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| Created | True/false if the action was successful. | Boolean |
| DocumentId | Direct key to the created task. | String |
| PermanentLink | Permanent link to the created task. | String |

-----

### PUT (Update)

This call can be used to update a task. Currently, only the task status can be updated. The status can be set to `"nieuw"` (new) or `"gereed"` (ready).

**URL:** `PUT {apiurl}/document/task/{documentId}/updatestatus/{status}`

  * **Example:** `ac/api/document/task/FD8FE4F8B452D884/updatestatus/nieuw`

**URL Parts**

| URL Part | Value |
| :--- | :--- |
| `{documentId}` | Direct key of the created task. This key is returned in the POST call. |
| `{status}` | New status of the task. Possible values: `"nieuw"`, `"gereed"`, `"inbehandeling"`, `"inafwachting"`, `"geannuleerd"`. |

-----

## Download Export CRM Data

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/export/full/excel`
      * **Example:** `"/ac/api/export/full/excel"`

From version 14.5.0, it's possible to retrieve the latest export file, which is automatically generated every evening, with a single call. This is useful for **Power Automate**.

**Important:** You need additional access as an AuditCase API user. The user requesting the export (for whom the token was created) must be in the group **`'.. !C2C Api Users CRM Export'`**. This can be configured via group management. Contact us for assistance with this setup.

**GET data (type: application/octet-stream)**
The content of the Excel file is returned directly.

-----

## Download Shared File from Dossier

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/clientportaldoc/{klantnummer of klantsleutel}/{sleutel van document ($id)}/{bestandsnaam (FileName)}`
      * **Example:** `"/ac/api/clientportaldoc/1001004/559DF79142009A8CC125796C004AE559/Mijn%20PDF.pdf"`

This call downloads a single file that has been **'shared'** per dossier. These files have been approved and are available to be shared with the client. The technical information required for this call can be retrieved using this call.

**Important:** You need additional access as an AuditCase API user. Please request this from Change to Comm.

**Note:** Ensure the filename is properly URL-encoded. For example, a URL cannot contain spaces.

**GET data (type: application/octet-stream)**
The content of the file is returned directly.

-----

## Overview of Acquisitions

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/viewdata/acquisition`

Only the current user's ongoing acquisitions can be retrieved with this call.

**Response (example)**

```json
[
  {
    "Datum eerste contact": "15-02-2014",
    "Klantnaam": "Klaassen, J (m)",
    "Volgende actie": "Eerste keer benaderen",
    "Discipline": "Fusies en overnames",
    "$linktodocument": "",
    "Datum volgende actie": "",
    "$id": "6FE74E9286E8FB0DC1257C85006C968F"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$linktodocument` | Full URL to the relevant document in AuditCase. | String |
| `$id` | Unique key of the document. | String |
| `Klantnaam` | The full name of the client. | String |
| `Discipline` | Discipline of the acquisition. | String |
| `Volgende actie` | Description of the next action. | String |
| `Datum volgende actie` | Date of the next action. | String |
| `Datum eerste contact` | Date of the first contact. | String |

This call supports **Paging**.

-----

## Overview of Shared Files in Dossier

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/clientportaldocs/{klantnummer of klantsleutel}`
      * **Example:** `"/ac/api/clientportaldocs/1001004"`

This call retrieves all files that have been **'shared'** per dossier. These files have been approved and are available to be shared with the client.

**Important:** You need additional access as an AuditCase API user. Please request this from Change to Comm.

**GET data (type: json)**
An array of files is returned. Each file contains at least the following data:

**Response (example)**

```json
[
  {
    "DateComposed": "22-02-2017 11:36:09",
    "DateLastModified": "22-02-2017 11:36:10",
    "Level1": "Jaarrekening Dossier",
    "Level2": "2017",
    "Level3": "Algemeen",
    "Level4": "Diversen",
    "Description": "Jaarrekening 2017 inclusief bijlagen",
    "FileSize": "459",
    "FileName": "jaarrekening 2017.pdf",
    "$id": "6DB1570A2C10AF87C12580CF003A3DCE"
  }
]
```

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `DateComposed` | Creation date of the AuditCase dossier item. | String |
| `DateLastModified` | Last modification date of the AuditCase dossier item. | String |
| `Level1` | Folder structure map 1/4 | String |
| `Level2` | Folder structure map 2/4 | String |
| `Level3` | Folder structure map 3/4 | String |
| `Level4` | Folder structure map 4/4 | String |
| `Description` | Description of the AuditCase dossier item. | String |
| `FileSize` | Size of the file in bytes. | String |
| `FileName` | Name of the shared file. | String |
| `$id` | Unique key of the AuditCase document. | String |

-----

## Overview of Client Requests

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL (v1.0):** `{apiurl}` (requires headers)
  * **URL (v2.0 - preferred):** `GET {apiurl}/viewdata/clientrequests`

This call returns the open client requests for the currently logged-in user. With the HTTP parameter `X-filter` set to **'All'**, all client requests can be retrieved.

**Headers**

| Header | Value | Required |
| :--- | :--- | :--- |
| `X-action` | `api_getclientrequests` | YES (if v1.0 URL is used) / NO (if v2.0 URL is used) |
| `X-filter` | `All` | NO |

**Response (example)**

```json
[
  {
    "subject": "Nieuwe Klant B.V.",
    "$linktodocument": "",
    "$id": "6FE74E9286E8FB0DC1257C85006C968F"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$linktodocument` | Full URL to the relevant document in AuditCase. | String |
| `$id` | Unique key of the document. | String |
| `subject` | The full name of the client. | String |

-----

## Overview of Clients and Contacts by Phone Number

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/clients/search-by-phonenumber/{telefoonnummer}`
      * **Example:** `ac/api/clients/search-by-phonenumber/0031612345678`

This method searches for clients and contact persons who have the specified phone number. This call is intended for **VOIP telephony links**.

**URL Parts**

| URL Part | Example |
| :--- | :--- |
| `{apiurl}` | `https://ac.klant.nl/ac/api` |
| `{telefoonnummer}` | `"0031612345678"` or `"0612345678"` (phone number with country code) |

**Note:** The country code must be written as `0031`, with the `+` replaced by `00`.

**Response (example)**

```json
[
  {
    "contactname": "Natte, Nathan (m)",
    "clientkey": "19875DBC26DE3F52C12582B300331E1A",
    "clientname": "Brouwerij 't IJ",
    "link": "https://dev01.changetocomm.net/ac/redirect&target=client&clientkey=19875DBC26DE3F52C12582B300331E1A&key=DA3249B49AE399F6C12582C7002D6AB9&modulename=RELATIE#!/contact=31FEA97B4A553740C125838500454F3B",
    "contactkey": "DA3249B49AE399F6C12582C7002D6AB9",
    "clientshortname": "bierbrouwerij IJ",
    "type": "contact",
    "clientnumber": "00205241"
  },
  {
    "clientkey": "19875DBC26DE3F52C12582B300331E1A",
    "clientname": "Brouwerij 't IJ",
    "link": "https://dev01.changetocomm.net/ac/redirect&target=client&clientkey=19875DBC26DE3F52C12582B300331E1A&key=19875DBC26DE3F52C12582B300331E1A&modulename=RELATIE",
    "clientshortname": "bierbrouwerij IJ",
    "type": "client",
    "clientnumber": "00205241"
  },
  {
    "contactname": "Karel - Karelsen, Karline (v)",
    "clientkey": "E406966AA8332A5DC125806000588B2B",
    "clientname": "Kinderopvang Knuffelbeer",
    "link": "https://dev01.changetocomm.net/ac/redirect&target=client&clientkey=E406966AA8332A5DC125806000588B2B&key=1E2A649F5CBE5FCAC12580CE00595C96&modulename=RELATIE#!/contact=A482AD412776394AC1258385004543C2",
    "contactkey": "1E2A649F5CBE5FCAC12580CE00595C96",
    "clientshortname": "Kinderopvang Knuffelberen",
    "type": "contact",
    "clientnumber": "00202686"
  }
]
```

A JSON array will always be returned. If no clients or contact persons are found, the response will be `[]`.

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `clientkey` | Unique technical key of the client. | String |
| `clientname` | Name of the found client. | String |
| `clientshortname` | The search name of the client. | String |
| `type` | `"client"` or `"contact"` (indicates where the phone number was found). | String |
| `link` | A full link to open the found client or contact person in AuditCase. | String |
| `contactkey` | (Optional) Technical key of the contact person if `type` is `"contact"`. | String |
| `contactname` | (Optional) Name of the contact person if `type` is `"contact"`. | String |

-----

## Overview of Clients

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/viewdata/clients`

This call allows for a quick search of clients in AuditCase. You can search by client number, search name, and client name. The value for the `X-startKey` header is the starting text for the fields. For example, `"ABC"` will find `"ABCD B.v."` but not `"00ABCD B.v."`.

The maximum number of results returned is limited to 500.

**Header**

| Header | Value | Required |
| :--- | :--- | :--- |
| `X-startKey` | `"ABC"` | NO |

**Response (example)**

```json
[
  {
    "$col1": "1001004",
    "$col2": "HAPJES",
    "$col3": "Eetcafé Hapjes",
    "$col4": "Klant",
    "$col5": "Barneveld",
    "$col6": "Straatweg 30",
    "$id": "BF1CE0157D54C29CC1257CB7004EBD12"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$id` | Unique key of the document. | String |
| `$col1` | Client number | String |
| `$col2` | Search name | String |
| `$col3` | Client name | String |
| `$col4` | Client status | String |
| `$col5` | City | String |
| `$col6` | Street + house number (registered address) | String |

This call supports **Paging**.

-----

## Overview of Incoming Correspondence

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/viewdata/ic`

This call returns the incoming mail items for the currently logged-in user. This includes all incoming mail items from a maximum of 5 mailbooks that the logged-in user has configured in their preferred locations in AuditCase.

**Response (example)**

```json
[
  {
    "Klantnaam": "Big Data B.V.",
    "Datum": "26-05-2014",
    "Onderwerp": "RE: Order BDO (PROQ51876)",
    "$linktodocument": "",
    "$id": "6FE74E9286E8FB0DC1257C85006C968F"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$linktodocument` | Full URL to the relevant document in AuditCase. | String |
| `$id` | Unique key of the document. | String |
| `Klantnaam` | The full name of the client. | String |
| `Datum` | The creation date of the document. | String |
| `Onderwerp` | Subject of the document. | String |

This call supports **Paging**.

-----

## Overview of Outgoing Correspondence

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/viewdata/uc`

This call returns the outgoing mail items for the currently logged-in user. This includes all outgoing mail items from a maximum of 5 mailbooks that the logged-in user has configured in their preferred locations in AuditCase.

**Response (example)**

```json
[
  {
    "Klantnaam": "Big Data B.V.",
    "Datum": "26-05-2014",
    "Onderwerp": "RE: Order BDO (PROQ51876)",
    "$linktodocument": "",
    "$id": "6FE74E9286E8FB0DC1257C85006C968F"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$linktodocument` | Full URL to the relevant document in AuditCase. | String |
| `$id` | Unique key of the document. | String |
| `Klantnaam` | The full name of the client. | String |
| `Datum` | The creation date of the document. | String |
| `Onderwerp` | Subject of the document. | String |

This call supports **Paging**.

-----

## Overview of Tasks: The API

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}/viewdata/tasks`

This call returns the ongoing tasks for the currently logged-in user. With the HTTP parameter `X-filter` set to **'All'**, all tasks can be retrieved.

**Header**

| Header | Value | Required |
| :--- | :--- | :--- |
| `X-filter` | `All` | NO |

**Response (example)**

```json
[
  {
    "Klantnaam": "Big Data B.V.",
    "ActieTeDoen": "Even bellen",
    "Onderwerp": "Ter herinnering",
    "Startdatum": "22-02-2014",
    "Einddatum": "26-02-2015",
    "$linktodocument": "",
    "$id": "6FE74E9286E8FB0DC1257C85006C968F"
  }
]
```

More information for internal AuditCase use is returned. You can count on at least the following information:

**Property Details**

| Property name | Value | Type |
| :--- | :--- | :--- |
| `$linktodocument` | Full URL to the relevant document in AuditCase. | String |
| `$id` | Unique key of the document. | String |
| `Klantnaam` | The full name of the client. **Note:** This value is optional. Tasks without a client link will return an empty value. | String |
| `Startdatum` | Start date of the task. | String |
| `Einddatum` | Due date of the task. | String |
| `ActieTeDoen` | Action to be performed. | String |
| `Onderwerp` | Short description. | String |

This call supports **Paging**.

-----

## Upload

*Updated 1 year ago*

  * **Possible HTTP methods:** POST
  * **URL:** `POST {apiurl}/api_upload`
      * **From version 19.4:** This endpoint will be renamed to `{apiurl}/apiupload`. The authentication will also be adjusted in this version (see **Toegang tot de API**).

This call uploads a file to AuditCase. The API requestor must first contact **Change to Comm** so that the files are processed correctly after upload.

**POST data (type: multipart/form-data)**

| key | value | Optional | Description |
| :--- | :--- | :--- | :--- |
| file | `[bestand]` | No | One or more files to be included here. |
| form | `API-Portal-Dossier` | No | This 'key' is provided by Change to Comm. It's a key that must be configured in AuditCase for the client. |
| Klantnummer | `1001004` | Yes\* | Client number of the client (if known). |
| Klantnaam | `JANSENBV` | Yes\* | Short search name of the client (if known). |
| AssignmentType | `3` | No | Type of assignment. |
| AssignmentSubType | `101` | Yes | Period belonging to the assignment type. |
| AssignmentYear | `2014` | Yes | |

\*A client number or client name is required.

Additional data can be sent along with the above POST data. This information will be saved and can be used in the upload configuration within AuditCase.

**Response (HTTP status 200)**

```json
{
  "status": 200,
  "message": "File succesfully received.",
  "responsedata": {
    "linktodocument": "https://dev01.changetocomm.net/ac/redirect&target=document&clientkey=FBECBFB0A0FD96D3C12577EE0035A2F9&key=77B6DE8E03E373FDC1257F02004F744E&modulename=INKOMENDECORR",
    "id": "77B6DE8E03E373FDC1257F02004F744E",
    "database": "Dev\\AuditCase\\corr_ame.nsf"
  }
}
```

-----

## Version Number

*Updated 2 years ago*

  * **Possible HTTP methods:** GET
  * **URL:** `GET {apiurl}`
      * **Example:** `/ac/api`

This call retrieves the current version number of AuditCase.

**URL Parts**

| URL Part | Example |
| :--- | :--- |
| `{apiurl}` | `https://ac.klant.nl/ac/api` |

**Response (example for version number)**

```json
{
  "version": "13.3.0"
}
```
