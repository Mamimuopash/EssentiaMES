/* ============================================================================
   EssentiaMES - Backup e cancellazione delle attivita' (ODP)
   ----------------------------------------------------------------------------
   Da eseguire in SSMS, CONNESSI AL DATABASE DI ESSENTIAMES (es. Brighetti), con
   un account amministratore (serve il permesso di BACKUP).

   COSI' COM'E' (@Tutte = 1, @Esegui = 1) premendo F5 lo script:
     a) fa il backup COMPLETO del database e lo verifica (RESTORE VERIFYONLY).
        Il backup e' COPY_ONLY, quindi non disturba quelli gia' pianificati;
     b) copia TUTTE le attivita' e TUTTI i tempi nelle tabelle di archivio
        dbo.Archivio_Brighetti_Attivita e dbo.Archivio_Brighetti_Tempi;
     c) cancella tutte le attivita' (Brighetti_Attività) e i tempi (Brighetti_Tempi).
   Se il backup non riesce, lo script si ferma senza cancellare nulla.
   Lanciarlo a produzione ferma: anche le attivita' in corso vengono tolte e
   gli operatori ripartono da una lista vuota.

   Restano invariati: articoli, cicli (procedure), giacenze, lotti, macchine,
   magazzini, utenti, impostazioni, note e documenti.

   ALTRI USI
     @Esegui = 0          solo PROVA: mostra cosa verrebbe tolto, non modifica nulla.
     @Tutte  = 0          toglie solo gli ODP interi con ultima modifica prima di
                          @DataLimite (con @SoloConclusi = 1 solo quelli con tutte le
                          fasi completate/annullate). In questo caso gli ODP con
                          una fase in attrezzaggio o in lavorazione non vengono mai tolti.

   RIPRISTINO
     Tutto: ripristinare il file .bak indicato nel messaggio finale.
     Solo le attivita': reinserirle da dbo.Archivio_Brighetti_Attivita con
     SET IDENTITY_INSERT dbo.[Brighetti_Attività] ON (stessi IdAttività).
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Tutte        BIT           = 1;           -- 1 = TUTTE le attivita'; 0 = solo quelle scelte con i due parametri seguenti
DECLARE @DataLimite   DATETIME      = '20261101';  -- (solo con @Tutte = 0) ODP con ultima modifica PRIMA di questa data (AAAAMMGG)
DECLARE @SoloConclusi BIT           = 1;           -- (solo con @Tutte = 0) 1 = solo ODP conclusi; 0 = anche ODP con fasi da fare
DECLARE @Esegui       BIT           = 1;           -- 1 = backup + archivio + cancellazione; 0 = PROVA (solo conteggi)
DECLARE @FileBackup   NVARCHAR(400) = NULL;        -- NULL = cartella di backup predefinita dell'istanza

IF OBJECT_ID('dbo.Brighetti_Attività', 'U') IS NULL
BEGIN
    RAISERROR('Tabella Brighetti_Attività non trovata: selezionare in SSMS il database di EssentiaMES (es. Brighetti) e rieseguire.', 16, 1);
    RETURN;
END

/* ------------------------------------------------------------ selezione ODP */
IF OBJECT_ID('tempdb..#odp') IS NOT NULL DROP TABLE #odp;

SELECT ISNULL(a.OrdineDiProduzione, N'(senza ODP)') AS Odp,
       MIN(a.CodiceArticolo)                        AS CodiceArticolo,
       COUNT(*)                                     AS Fasi,
       SUM(CASE WHEN a.[StatoAttività] IN (4, 5) THEN 1 ELSE 0 END) AS FasiChiuse,
       MAX(a.UltimaModifica_Data)                   AS UltimaModifica
  INTO #odp
  FROM dbo.[Brighetti_Attività] a
 GROUP BY ISNULL(a.OrdineDiProduzione, N'(senza ODP)')
HAVING @Tutte = 1
    OR (ISNULL(MAX(a.UltimaModifica_Data), '19000101') < @DataLimite
        AND SUM(CASE WHEN a.[StatoAttività] IN (1, 2) THEN 1 ELSE 0 END) = 0      -- mai ODP in lavorazione
        AND (@SoloConclusi = 0 OR SUM(CASE WHEN a.[StatoAttività] IN (4, 5) THEN 1 ELSE 0 END) = COUNT(*)));

DECLARE @nOdp INT, @nAttivita INT, @nAperti INT, @nTempi INT, @nTotale INT;
SELECT @nOdp = COUNT(*), @nAttivita = ISNULL(SUM(Fasi), 0), @nAperti = ISNULL(SUM(CASE WHEN FasiChiuse < Fasi THEN 1 ELSE 0 END), 0) FROM #odp;
SELECT @nTempi = COUNT(*)
  FROM dbo.Brighetti_Tempi t
 WHERE @Tutte = 1
    OR EXISTS (SELECT 1 FROM dbo.[Brighetti_Attività] a JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)')
                WHERE a.[IdAttività] = t.[IdAttività]);
SELECT @nTotale = COUNT(*) FROM dbo.[Brighetti_Attività];

IF @Tutte = 1
    PRINT CONCAT('Database: ', DB_NAME(), ' - TUTTE le attivita''');
ELSE
    PRINT CONCAT('Database: ', DB_NAME(), ' - limite: ', CONVERT(NVARCHAR(10), @DataLimite, 103),
                 ' - solo conclusi: ', CASE WHEN @SoloConclusi = 1 THEN 'si' ELSE 'no' END);
PRINT CONCAT('ODP da togliere: ', @nOdp, ' (di cui con fasi ancora da fare: ', @nAperti, ')');
PRINT CONCAT('Attivita'' da togliere: ', @nAttivita, ' su ', @nTotale, ' - tempi registrati: ', @nTempi);
DECLARE @nInCorso INT = (SELECT COUNT(*) FROM dbo.[Brighetti_Attività] a JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)')
                          WHERE a.[StatoAttività] IN (1, 2));
IF @nInCorso > 0 PRINT CONCAT('ATTENZIONE: ', @nInCorso, ' attivita'' risultano in attrezzaggio/lavorazione in questo momento e verranno tolte.');

SELECT TOP (200) Odp, CodiceArticolo, Fasi, FasiChiuse, UltimaModifica FROM #odp ORDER BY UltimaModifica, Odp;

IF @Esegui = 0
BEGIN
    PRINT 'PROVA: nessuna modifica. Per procedere impostare @Esegui = 1 ed eseguire di nuovo.';
    RETURN;
END

IF @nOdp = 0 AND @nTempi = 0
BEGIN
    PRINT 'Nessun ODP da togliere con questi parametri.';
    RETURN;
END

/* ---------------------------------------------------------------- backup */
IF @FileBackup IS NULL
BEGIN
    DECLARE @cartella NVARCHAR(400) = CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(400));
    IF @cartella IS NULL OR @cartella = N''
    BEGIN
        RAISERROR('Cartella di backup predefinita non trovata: indicare il percorso completo in @FileBackup. Nessuna modifica.', 16, 1);
        RETURN;
    END
    SET @FileBackup = @cartella + CASE WHEN RIGHT(@cartella, 1) IN (N'\', N'/') THEN N'' ELSE N'\' END
                    + DB_NAME() + N'_prima_della_pulizia_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss') + N'.bak';
END

BEGIN TRY
    DECLARE @sqlBackup NVARCHAR(MAX) = N'BACKUP DATABASE ' + QUOTENAME(DB_NAME())
        + N' TO DISK = @f WITH COPY_ONLY, INIT, CHECKSUM, NAME = N''EssentiaMES - prima della pulizia''';
    EXEC sys.sp_executesql @sqlBackup, N'@f NVARCHAR(400)', @f = @FileBackup;
    RESTORE VERIFYONLY FROM DISK = @FileBackup WITH CHECKSUM;
    PRINT CONCAT('Backup completo creato e verificato: ', @FileBackup);
END TRY
BEGIN CATCH
    PRINT CONCAT('Backup NON riuscito (', ERROR_MESSAGE(), '). Controllare il percorso e i permessi del servizio SQL Server sulla cartella. Nessuna modifica.');
    RETURN;
END CATCH

/* ------------------------------------------------- archivio e cancellazione */
IF OBJECT_ID('dbo.Archivio_Brighetti_Attivita', 'U') IS NULL
    CREATE TABLE dbo.Archivio_Brighetti_Attivita(
        [IdAttività]                 INT NOT NULL,
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
        [QuantitàdaProdurre]         DECIMAL(18, 2) NOT NULL,
        [TipoAttivitaProcedura]      INT NOT NULL,
        [idMacchinaMagazzino]        INT NOT NULL,
        [DataArchiviazione]          DATETIME NOT NULL
    );

IF OBJECT_ID('dbo.Archivio_Brighetti_Tempi', 'U') IS NULL
    CREATE TABLE dbo.Archivio_Brighetti_Tempi(
        [IdTempo]           INT NOT NULL,
        [IdAttività]        INT NOT NULL,
        [TipoAttività]      INT NOT NULL,
        [DataInizio]        DATETIME NOT NULL,
        [DataFine]          DATETIME NOT NULL,
        [Note]              NVARCHAR(MAX) NULL,
        [DataArchiviazione] DATETIME NOT NULL
    );

DECLARE @ora DATETIME = GETDATE();

BEGIN TRANSACTION;

INSERT INTO dbo.Archivio_Brighetti_Tempi ([IdTempo], [IdAttività], [TipoAttività], DataInizio, DataFine, Note, DataArchiviazione)
SELECT t.[IdTempo], t.[IdAttività], t.[TipoAttività], t.DataInizio, t.DataFine, t.Note, @ora
  FROM dbo.Brighetti_Tempi t
 WHERE @Tutte = 1
    OR EXISTS (SELECT 1 FROM dbo.[Brighetti_Attività] a JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)')
                WHERE a.[IdAttività] = t.[IdAttività]);

INSERT INTO dbo.Archivio_Brighetti_Attivita ([IdAttività], IncrementaleProcedura, CodiceArticolo, [NomeAttività], idReparto,
       [QuantitàProdotta], [QuantitàScartata], [StatoAttività], UltimaModifica_OperatoreID, UltimaModifica_Operatore,
       UltimaModifica_Data, OrdineDiProduzione, [QuantitàdaProdurre], TipoAttivitaProcedura, idMacchinaMagazzino, DataArchiviazione)
SELECT a.[IdAttività], a.IncrementaleProcedura, a.CodiceArticolo, a.[NomeAttività], a.idReparto,
       a.[QuantitàProdotta], a.[QuantitàScartata], a.[StatoAttività], a.UltimaModifica_OperatoreID, a.UltimaModifica_Operatore,
       a.UltimaModifica_Data, a.OrdineDiProduzione, a.[QuantitàdaProdurre], a.TipoAttivitaProcedura, a.idMacchinaMagazzino, @ora
  FROM dbo.[Brighetti_Attività] a
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');

DELETE t
  FROM dbo.Brighetti_Tempi t
 WHERE @Tutte = 1
    OR EXISTS (SELECT 1 FROM dbo.[Brighetti_Attività] a JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)')
                WHERE a.[IdAttività] = t.[IdAttività]);
DECLARE @tolteTempi INT = @@ROWCOUNT;

DELETE a
  FROM dbo.[Brighetti_Attività] a
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');
DECLARE @tolteAttivita INT = @@ROWCOUNT;

COMMIT TRANSACTION;

PRINT CONCAT('FATTO: tolti ', @nOdp, ' ODP, ', @tolteAttivita, ' attivita'' e ', @tolteTempi, ' tempi (copiati in dbo.Archivio_Brighetti_Attivita / dbo.Archivio_Brighetti_Tempi).');
PRINT CONCAT('Backup completo precedente alla pulizia: ', @FileBackup);
