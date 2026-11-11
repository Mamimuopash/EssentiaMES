/* ============================================================================
   EssentiaMES - Schema database (SQL Server 2012 o successivo)
   ----------------------------------------------------------------------------
   Schema completo usato dall'applicazione Next.js. E' lo stesso database della
   vecchia applicazione ASP.NET (VB.NET / Entity Framework 6): nomi di tabelle e
   colonne sono IDENTICI, quindi il nuovo software lavora sul DB esistente senza
   migrazioni di dati.

   Lo script e' IDEMPOTENTE:
     - su un database VUOTO crea tutte le tabelle;
     - su un database ESISTENTE crea solo cio' che manca (tabelle/colonne
       introdotte dalle ultime versioni, es. Automazioni) senza toccare i dati.

   Eseguirlo da SSMS (connessi al database giusto) oppure con:
       npm run db:init
   ============================================================================ */

SET NOCOUNT ON;
GO

/* Livello di compatibilita': TRY_CONVERT e OFFSET/FETCH richiedono almeno 110
   (SQL Server 2012). I database migrati da SQL Server 2008 possono essere a 100. */
IF (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) < 110
BEGIN
    DECLARE @compat NVARCHAR(300) = N'ALTER DATABASE ' + QUOTENAME(DB_NAME()) + N' SET COMPATIBILITY_LEVEL = 110';
    EXEC (@compat);
    PRINT 'Livello di compatibilita'' del database portato a 110 (richiesto da EssentiaMES).';
END
GO

/* ---------------------------------------------------------------- IDENTITY */
IF OBJECT_ID('dbo.AspNetRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetRoles(
        [Id]   NVARCHAR(128) NOT NULL,
        [Name] NVARCHAR(256) NOT NULL,
        CONSTRAINT [PK_dbo.AspNetRoles] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
    CREATE UNIQUE NONCLUSTERED INDEX [RoleNameIndex] ON dbo.AspNetRoles([Name] ASC);
END
GO

IF OBJECT_ID('dbo.AspNetUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetUsers(
        [Id]                   NVARCHAR(128) NOT NULL,
        [Email]                NVARCHAR(256) NULL,
        [EmailConfirmed]       BIT NOT NULL,
        [PasswordHash]         NVARCHAR(MAX) NULL,
        [SecurityStamp]        NVARCHAR(MAX) NULL,
        [PhoneNumber]          NVARCHAR(MAX) NULL,
        [PhoneNumberConfirmed] BIT NOT NULL,
        [TwoFactorEnabled]     BIT NOT NULL,
        [LockoutEndDateUtc]    DATETIME NULL,
        [LockoutEnabled]       BIT NOT NULL,
        [AccessFailedCount]    INT NOT NULL,
        [UserName]             NVARCHAR(256) NOT NULL,
        CONSTRAINT [PK_dbo.AspNetUsers] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UserNameIndex] ON dbo.AspNetUsers([UserName] ASC);
END
GO

IF OBJECT_ID('dbo.AspNetUserRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetUserRoles(
        [UserId] NVARCHAR(128) NOT NULL,
        [RoleId] NVARCHAR(128) NOT NULL,
        CONSTRAINT [PK_dbo.AspNetUserRoles] PRIMARY KEY CLUSTERED ([UserId] ASC, [RoleId] ASC),
        CONSTRAINT [FK_dbo.AspNetUserRoles_dbo.AspNetRoles_RoleId] FOREIGN KEY([RoleId]) REFERENCES dbo.AspNetRoles([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_dbo.AspNetUserRoles_dbo.AspNetUsers_UserId] FOREIGN KEY([UserId]) REFERENCES dbo.AspNetUsers([Id]) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.AspNetUserClaims', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetUserClaims(
        [Id]         INT IDENTITY(1,1) NOT NULL,
        [UserId]     NVARCHAR(128) NOT NULL,
        [ClaimType]  NVARCHAR(MAX) NULL,
        [ClaimValue] NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.AspNetUserClaims] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_dbo.AspNetUserClaims_dbo.AspNetUsers_UserId] FOREIGN KEY([UserId]) REFERENCES dbo.AspNetUsers([Id]) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.AspNetUserLogins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetUserLogins(
        [LoginProvider] NVARCHAR(128) NOT NULL,
        [ProviderKey]   NVARCHAR(128) NOT NULL,
        [UserId]        NVARCHAR(128) NOT NULL,
        CONSTRAINT [PK_dbo.AspNetUserLogins] PRIMARY KEY CLUSTERED ([LoginProvider] ASC, [ProviderKey] ASC, [UserId] ASC),
        CONSTRAINT [FK_dbo.AspNetUserLogins_dbo.AspNetUsers_UserId] FOREIGN KEY([UserId]) REFERENCES dbo.AspNetUsers([Id]) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.AspNetMacchineUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AspNetMacchineUsers(
        [Id]         INT IDENTITY(1,1) NOT NULL,
        [IdUtente]   NVARCHAR(MAX) NULL,
        [IdMacchina] INT NOT NULL,
        [IdReparto]  INT NOT NULL CONSTRAINT [DF_AspNetMacchineUsers_IdReparto] DEFAULT(0),
        CONSTRAINT [PK_dbo.AspNetMacchineUsers] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* Ruoli applicativi (stessi Id della vecchia installazione). */
IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE [Name] = N'Admin')
    INSERT dbo.AspNetRoles([Id], [Name]) VALUES (N'00a65075-c382-4bfb-97bc-cf710009dc67', N'Admin');
IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE [Name] = N'Operatore')
    INSERT dbo.AspNetRoles([Id], [Name]) VALUES (N'bc1ff1b7-5736-4715-8fa9-e0c9d7e2ccfa', N'Operatore');
IF NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE [Name] = N'Reparto')
    INSERT dbo.AspNetRoles([Id], [Name]) VALUES (N'b20aea50-b3ad-4447-b28e-f60a560e6aef', N'Reparto');
GO

/* ---------------------------------------------------------- LOG / AUDIT */
IF OBJECT_ID('dbo.Log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.[Log](
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [Livello]                    TINYINT NULL,
        [Indirizzo]                  NVARCHAR(MAX) NULL,
        [Messaggio]                  NVARCHAR(MAX) NULL,
        [Dati]                       NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Log] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Audit', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Audit(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [Livello]                    TINYINT NULL,
        [Indirizzo]                  NVARCHAR(MAX) NULL,
        [Messaggio]                  NVARCHAR(MAX) NULL,
        [Dati]                       NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Audit] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------ TABELLE LEGACY (richieste materiali) */
IF OBJECT_ID('dbo.Articoli', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Articoli(
        [Id]                   INT IDENTITY(1,1) NOT NULL,
        [Nome_Articolo]        NVARCHAR(MAX) NULL,
        [Descrizione_Articolo] NVARCHAR(MAX) NULL,
        [MagazzinoId]          INT NOT NULL,
        [ArticoloCancellato]   BIT NOT NULL,
        [FamigliaId]           INT NOT NULL CONSTRAINT [DF_Articoli_FamigliaId] DEFAULT(0),
        CONSTRAINT [PK_dbo.Articoli] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Magazzino', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Magazzino(
        [Id]                   INT IDENTITY(1,1) NOT NULL,
        [NomeMagazzino]        NVARCHAR(MAX) NULL,
        [DescrizioneMagazzino] NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Magazzino] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Ordini', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ordini(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [IdOrdine]                   INT NOT NULL,
        [IdArticolo]                 INT NOT NULL,
        [QtaArticolo]                INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Ordini] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.OrdiniInCorso', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrdiniInCorso(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [IdArticolo]                 INT NOT NULL,
        [QtaArticolo]                INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.OrdiniInCorso] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Macchine', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Macchine(
        [Id]                  INT IDENTITY(1,1) NOT NULL,
        [NomeMacchina]        NVARCHAR(MAX) NULL,
        [DescrizioneMacchina] NVARCHAR(MAX) NULL,
        [IndirizzoMacchina]   NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Macchine] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.DatiMacchina', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DatiMacchina(
        [Id]               INT IDENTITY(1,1) NOT NULL,
        [IdMacchina]       INT NOT NULL,
        [StatoAttività]    NVARCHAR(MAX) NULL,
        [NomeProgramma]    NVARCHAR(MAX) NULL,
        [ContaPezzi]       NVARCHAR(MAX) NULL,
        [Data_OperatoreID] NVARCHAR(MAX) NULL,
        [Data_Operatore]   NVARCHAR(MAX) NULL,
        [Data_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.DatiMacchina] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------------------------ ANAGRAFICHE */
IF OBJECT_ID('dbo.Brighetti_FamiglieProdotto', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_FamiglieProdotto(
        [Id]                  INT IDENTITY(1,1) NOT NULL,
        [NomeFamiglia]        NVARCHAR(MAX) NULL,
        [DescrizioneFamiglia] NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Brighetti_FamiglieProdotto] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Articoli', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Articoli(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [DescrizioneArticolo]        NVARCHAR(MAX) NULL,
        [NoteArticolo]               NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        [FamigliaId]                 INT NOT NULL CONSTRAINT [DF_Brighetti_Articoli_FamigliaId] DEFAULT(0),
        [Importanza]                 INT NOT NULL CONSTRAINT [DF_Brighetti_Articoli_Importanza] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Articoli] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Articoli', 'LottoMinimo') IS NULL
    ALTER TABLE dbo.Brighetti_Articoli ADD [LottoMinimo] INT NOT NULL CONSTRAINT [DF_Brighetti_Articoli_LottoMinimo] DEFAULT(0);
GO

IF OBJECT_ID('dbo.Brighetti_Magazzini', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Magazzini(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [CodiceMagazzino]            NVARCHAR(MAX) NULL,
        [DescrizioneMagazzino]       NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Magazzini] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Magazzini', 'TipologiaMagazzino') IS NULL
    ALTER TABLE dbo.Brighetti_Magazzini ADD [TipologiaMagazzino] TINYINT NOT NULL CONSTRAINT [DF_Brighetti_Magazzini_TipologiaMagazzino] DEFAULT(0);
GO

IF OBJECT_ID('dbo.Brighetti_Reparti', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Reparti(
        [IdReparto]                  INT IDENTITY(1,1) NOT NULL,
        [NomeReparto]                NVARCHAR(MAX) NULL,
        [DescrizioneReparto]         NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Reparti] PRIMARY KEY CLUSTERED ([IdReparto] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Macchine', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Macchine(
        [IdMacchina]                 INT IDENTITY(1,1) NOT NULL,
        [NomeMacchina]               NVARCHAR(MAX) NULL,
        [DescrizioneMacchina]        NVARCHAR(MAX) NULL,
        [IdReparto]                  INT NOT NULL,
        [IdUtente]                   NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Macchine] PRIMARY KEY CLUSTERED ([IdMacchina] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Macchine', 'TipologiaMacchina') IS NULL
    ALTER TABLE dbo.Brighetti_Macchine ADD [TipologiaMacchina] TINYINT NOT NULL CONSTRAINT [DF_Brighetti_Macchine_TipologiaMacchina] DEFAULT(0);
IF COL_LENGTH('dbo.Brighetti_Macchine', 'CollegamentoMacchina') IS NULL
    ALTER TABLE dbo.Brighetti_Macchine ADD [CollegamentoMacchina] NVARCHAR(MAX) NULL;
GO

/* ----------------------------------------------------- CICLI E PRODUZIONE */
IF OBJECT_ID('dbo.Brighetti_Procedure', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Procedure(
        [IdProcedura]                INT IDENTITY(1,1) NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [IncrementaleProcedura]      SMALLINT NOT NULL,
        [NomeAttività]               NVARCHAR(MAX) NULL,
        [idReparto]                  INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        [TipoAttivita]               INT NOT NULL CONSTRAINT [DF_Brighetti_Procedure_TipoAttivita] DEFAULT(0),
        [idMacchinaMagazzino]        INT NOT NULL CONSTRAINT [DF_Brighetti_Procedure_idMacchinaMagazzino] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Procedure] PRIMARY KEY CLUSTERED ([IdProcedura] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Attività', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.[Brighetti_Attività](
        [IdAttività]                 INT IDENTITY(1,1) NOT NULL,
        [IncrementaleProcedura]      SMALLINT NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [NomeAttività]               NVARCHAR(MAX) NULL,
        [idReparto]                  INT NOT NULL,
        [QuantitàProdotta]           DECIMAL(18, 2) NOT NULL,
        [QuantitàScartata]           DECIMAL(18, 2) NOT NULL,
        [StatoAttività]              INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        [OrdineDiProduzione]         NVARCHAR(MAX) NULL,
        [QuantitàdaProdurre]         DECIMAL(18, 2) NOT NULL CONSTRAINT [DF_Brighetti_Attivita_QuantitadaProdurre] DEFAULT(0),
        [TipoAttivitaProcedura]      INT NOT NULL CONSTRAINT [DF_Brighetti_Attivita_TipoAttivitaProcedura] DEFAULT(0),
        [idMacchinaMagazzino]        INT NOT NULL CONSTRAINT [DF_Brighetti_Attivita_idMacchinaMagazzino] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Attività] PRIMARY KEY CLUSTERED ([IdAttività] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Tempi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Tempi(
        [IdTempo]      INT IDENTITY(1,1) NOT NULL,
        [IdAttività]   INT NOT NULL,
        [TipoAttività] INT NOT NULL,
        [DataInizio]   DATETIME NOT NULL,
        [DataFine]     DATETIME NOT NULL,
        [Note]         NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Brighetti_Tempi] PRIMARY KEY CLUSTERED ([IdTempo] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Previsione', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Previsione(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [DescrizioneArticolo]        NVARCHAR(MAX) NULL,
        [QuantitaInEntrata]          INT NOT NULL,
        [IdAttività]                 INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Previsione] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------------------------- GIACENZE */
IF OBJECT_ID('dbo.Brighetti_Giacenze', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Giacenze(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [CodiceMagazzino]            NVARCHAR(MAX) NULL,
        [QuantitàGiacenza]           DECIMAL(18, 2) NOT NULL,
        [QuantitàSottoscorta]        DECIMAL(18, 2) NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        [InPrevisioneEntrata]        DECIMAL(18, 2) NOT NULL CONSTRAINT [DF_Brighetti_Giacenze_InPrevisioneEntrata] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Giacenze] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Giacenze', 'QuantitàScortaMassima') IS NULL
    ALTER TABLE dbo.Brighetti_Giacenze ADD [QuantitàScortaMassima] DECIMAL(18, 2) NOT NULL CONSTRAINT [DF_Brighetti_Giacenze_QuantitaScortaMassima] DEFAULT(0);
GO

IF OBJECT_ID('dbo.Brighetti_DettagliGiacenza', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_DettagliGiacenza(
        [id]                    INT IDENTITY(1,1) NOT NULL,
        [idGiacenza]            INT NOT NULL,
        [idProcedura]           INT NOT NULL,
        [QuantitàProdotta]      DECIMAL(18, 2) NOT NULL,
        [Brighetti_Giacenza_Id] INT NULL,
        CONSTRAINT [PK_dbo.Brighetti_DettagliGiacenza] PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT [FK_dbo.Brighetti_DettagliGiacenza_dbo.Brighetti_Giacenze_Brighetti_Giacenza_Id]
            FOREIGN KEY([Brighetti_Giacenza_Id]) REFERENCES dbo.Brighetti_Giacenze([Id])
    );
    CREATE NONCLUSTERED INDEX [IX_Brighetti_Giacenza_Id] ON dbo.Brighetti_DettagliGiacenza([Brighetti_Giacenza_Id] ASC);
END
GO

/* ----------------------------------------------------------------- LOTTI */
IF OBJECT_ID('dbo.Brighetti_Lotti', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Lotti(
        [IdLotto]                    INT IDENTITY(1,1) NOT NULL,
        [NomeLotto]                  NVARCHAR(MAX) NULL,
        [DescrizioneLotto]           NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        [StatoLotto]                 INT NOT NULL CONSTRAINT [DF_Brighetti_Lotti_StatoLotto] DEFAULT(0),
        [Fornitore]                  NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Brighetti_Lotti] PRIMARY KEY CLUSTERED ([IdLotto] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Lotti', 'TipologiaLotto') IS NULL
    ALTER TABLE dbo.Brighetti_Lotti ADD [TipologiaLotto] NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.Brighetti_Lotti', 'IdMagazzinoProvenienza') IS NULL
    ALTER TABLE dbo.Brighetti_Lotti ADD [IdMagazzinoProvenienza] INT NOT NULL CONSTRAINT [DF_Brighetti_Lotti_IdMagazzinoProvenienza] DEFAULT(0);
IF COL_LENGTH('dbo.Brighetti_Lotti', 'CodiceADLACL') IS NULL
    ALTER TABLE dbo.Brighetti_Lotti ADD [CodiceADLACL] NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID('dbo.Brighetti_Lotti_Articoli', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Lotti_Articoli(
        [IdLottoArticolo]            INT IDENTITY(1,1) NOT NULL,
        [IdLotto]                    INT NOT NULL,
        [IdArticolo]                 INT NOT NULL,
        [NomeArticolo]               NVARCHAR(MAX) NULL,
        [QuantitàArticolo]           NVARCHAR(MAX) NULL,
        [StatoArticoloLotto]         INT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Lotti_Articoli] PRIMARY KEY CLUSTERED ([IdLottoArticolo] ASC)
    );
END
GO
IF COL_LENGTH('dbo.Brighetti_Lotti_Articoli', 'NoteArticolo') IS NULL
    ALTER TABLE dbo.Brighetti_Lotti_Articoli ADD [NoteArticolo] NVARCHAR(MAX) NULL;
GO

/* ------------------------------------------------------ NOTE E DOCUMENTI */
IF OBJECT_ID('dbo.Brighetti_Note', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Note(
        [Id]             INT IDENTITY(1,1) NOT NULL,
        [TypeElem]       INT NOT NULL,
        [Contenuto_Nota] NVARCHAR(MAX) NULL,
        [Data_Nota]      DATETIME NOT NULL,
        [Operatore_Id]   NVARCHAR(MAX) NULL,
        [Operatore_Nome] NVARCHAR(MAX) NULL,
        [IdEsterno]      INT NOT NULL CONSTRAINT [DF_Brighetti_Note_IdEsterno] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Note] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Documenti', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Documenti(
        [Id]                INT IDENTITY(1,1) NOT NULL,
        [Nome_File]         NVARCHAR(MAX) NULL,
        [TypeElem]          INT NOT NULL,
        [Percorso_File]     NVARCHAR(MAX) NULL,
        [DataCreazioneFile] DATETIME NOT NULL,
        [Operatore_Id]      NVARCHAR(MAX) NULL,
        [Operatore_Nome]    NVARCHAR(MAX) NULL,
        [IdEsterno]         INT NOT NULL CONSTRAINT [DF_Brighetti_Documenti_IdEsterno] DEFAULT(0),
        CONSTRAINT [PK_dbo.Brighetti_Documenti] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------------ MACCHINE 4.0 / PLANIMETRIA */
IF OBJECT_ID('dbo.Brighetti_Dati_Macchina', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Dati_Macchina(
        [id]                     INT IDENTITY(1,1) NOT NULL,
        [idMacchina]             INT NOT NULL,
        [DatiValidi]             BIT NOT NULL,
        [DataRilevazione]        DATETIME NOT NULL,
        [Programma]              NVARCHAR(MAX) NULL,
        [ProgrammaDescrizione]   NVARCHAR(MAX) NULL,
        [PezziProdotti]          INT NOT NULL,
        [StatoOperativoMacchina] NVARCHAR(MAX) NULL,
        [EsecuzioneMacchina]     NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_dbo.Brighetti_Dati_Macchina] PRIMARY KEY CLUSTERED ([id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Dati_Macchina_Csv', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Dati_Macchina_Csv(
        [id]                    INT IDENTITY(1,1) NOT NULL,
        [idMacchina]            INT NOT NULL,
        [DatiValidi]            BIT NOT NULL,
        [DataRilevazione]       DATETIME NOT NULL,
        [DataLog]               DATETIME NOT NULL,
        [Programma]             NVARCHAR(MAX) NULL,
        [ProgrammaDescrizione]  NVARCHAR(MAX) NULL,
        [DataInizioLavorazione] DATETIME NOT NULL,
        [DataFineLavorazione]   DATETIME NOT NULL,
        [PezziProdotti]         INT NOT NULL,
        [TempoInManuale]        DECIMAL(18, 2) NOT NULL,
        [TempoInAttività]       DECIMAL(18, 2) NOT NULL,
        [TempoInAutomatico]     DECIMAL(18, 2) NOT NULL,
        [TempoInLavorazione]    DECIMAL(18, 2) NOT NULL,
        CONSTRAINT [PK_dbo.Brighetti_Dati_Macchina_Csv] PRIMARY KEY CLUSTERED ([id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_Planimetria', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Planimetria(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [IdEsternoMacchina]          INT NOT NULL,
        [posX]                       NVARCHAR(MAX) NULL,
        [posY]                       NVARCHAR(MAX) NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Planimetria] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

/* ------------------------------------------------------------ AUTOMAZIONI */
IF OBJECT_ID('dbo.Brighetti_Impostazioni', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_Impostazioni(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [Chiave]                     NVARCHAR(MAX) NULL,
        [Valore]                     NVARCHAR(MAX) NULL,
        [Descrizione]                NVARCHAR(MAX) NULL,
        [Categoria]                  NVARCHAR(MAX) NULL,
        [Tipo]                       TINYINT NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_Impostazioni] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Brighetti_OrdiniAutomatici', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Brighetti_OrdiniAutomatici(
        [Id]                         INT IDENTITY(1,1) NOT NULL,
        [CodiceArticolo]             NVARCHAR(MAX) NULL,
        [CodiceMagazzino]            NVARCHAR(MAX) NULL,
        [QuantitàGiacenza]           DECIMAL(18, 2) NOT NULL,
        [ScortaMinima]               DECIMAL(18, 2) NOT NULL,
        [ScortaMassima]              DECIMAL(18, 2) NOT NULL,
        [LottoMinimo]                INT NOT NULL,
        [QuantitàProposta]           DECIMAL(18, 2) NOT NULL,
        [Stato]                      TINYINT NOT NULL,
        [Origine]                    NVARCHAR(MAX) NULL,
        [Note]                       NVARCHAR(MAX) NULL,
        [DataGenerazione]            DATETIME NOT NULL,
        [UltimaModifica_OperatoreID] NVARCHAR(MAX) NULL,
        [UltimaModifica_Operatore]   NVARCHAR(MAX) NULL,
        [UltimaModifica_Data]        DATETIME NULL,
        CONSTRAINT [PK_dbo.Brighetti_OrdiniAutomatici] PRIMARY KEY CLUSTERED ([Id] ASC)
    );
END
GO

PRINT 'Schema EssentiaMES verificato/aggiornato.';
GO
