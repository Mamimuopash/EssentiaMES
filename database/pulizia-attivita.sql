/* ============================================================================
   EssentiaMES - Backup e pulizia delle attivita' (ODP) precedenti
   ----------------------------------------------------------------------------
   Da eseguire in SSMS, CONNESSI AL DATABASE DI ESSENTIAMES (es. Brighetti), con
   un account amministratore (serve il permesso di BACKUP).

   COME SI USA
     1. Impostare i parametri qui sotto e lasciare @Esegui = 0: lo script fa
        solo una PROVA e mostra quanti ODP / attivita' / tempi verrebbero tolti
        (con l'elenco dei primi 200 ODP). Non modifica nulla.
     2. Controllati i numeri, impostare @Esegui = 1 ed eseguire di nuovo:
          a) backup COMPLETO del database (COPY_ONLY: non disturba i backup
             gia' pianificati) verificato con RESTORE VERIFYONLY;
          b) copia delle attivita' e dei loro tempi nelle tabelle di archivio
             dbo.Archivio_Brighetti_Attivita e dbo.Archivio_Brighetti_Tempi;
          c) cancellazione da Brighetti_Attività e Brighetti_Tempi.
        Se il backup non riesce lo script si ferma senza cancellare nulla.

   COSA VIENE TOLTO
     ODP interi (tutte le fasi), mai fasi singole: la produzione passa da una
     fase alla successiva dello stesso ODP. Un ODP viene tolto se la sua ultima
     modifica e' precedente a @DataLimite e:
       - con @SoloConclusi = 1 (consigliato) se tutte le fasi sono completate o annullate;
       - con @SoloConclusi = 0 anche se ha fasi ancora da fare (ripartenza pulita).
     Gli ODP con una fase IN ATTREZZAGGIO o IN LAVORAZIONE non vengono MAI tolti.
     Restano invariati: articoli, cicli (procedure), giacenze, lotti, macchine,
     magazzini, note e documenti.

   RIPRISTINO
     Tutto: ripristinare il file .bak indicato nel messaggio finale.
     Solo le attivita': reinserirle da dbo.Archivio_Brighetti_Attivita con
     SET IDENTITY_INSERT dbo.[Brighetti_Attività] ON (stessi IdAttività).
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @DataLimite   DATETIME      = '20261101';  -- ODP con ultima modifica PRIMA di questa data (formato AAAAMMGG)
DECLARE @SoloConclusi BIT           = 1;           -- 1 = solo ODP conclusi; 0 = anche ODP con fasi ancora da fare
DECLARE @Esegui       BIT           = 0;           -- 0 = PROVA (solo conteggi); 1 = backup + archivio + cancellazione
DECLARE @FileBackup   NVARCHAR(400) = NULL;        -- NULL = cartella di backup predefinita dell'istanza

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
HAVING ISNULL(MAX(a.UltimaModifica_Data), '19000101') < @DataLimite
   AND SUM(CASE WHEN a.[StatoAttività] IN (1, 2) THEN 1 ELSE 0 END) = 0          -- mai ODP in lavorazione
   AND (@SoloConclusi = 0 OR SUM(CASE WHEN a.[StatoAttività] IN (4, 5) THEN 1 ELSE 0 END) = COUNT(*));

DECLARE @nOdp INT, @nAttivita INT, @nAperti INT, @nTempi INT, @nTotale INT;
SELECT @nOdp = COUNT(*), @nAttivita = ISNULL(SUM(Fasi), 0), @nAperti = ISNULL(SUM(CASE WHEN FasiChiuse < Fasi THEN 1 ELSE 0 END), 0) FROM #odp;
SELECT @nTempi = COUNT(*)
  FROM dbo.Brighetti_Tempi t
  JOIN dbo.[Brighetti_Attività] a ON a.[IdAttività] = t.[IdAttività]
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');
SELECT @nTotale = COUNT(*) FROM dbo.[Brighetti_Attività];

PRINT CONCAT('Database: ', DB_NAME(), ' - limite: ', CONVERT(NVARCHAR(10), @DataLimite, 103),
             ' - solo conclusi: ', CASE WHEN @SoloConclusi = 1 THEN 'si' ELSE 'no' END);
PRINT CONCAT('ODP da togliere: ', @nOdp, ' (di cui con fasi ancora da fare: ', @nAperti, ')');
PRINT CONCAT('Attivita'' da togliere: ', @nAttivita, ' su ', @nTotale, ' - tempi registrati: ', @nTempi);

SELECT TOP (200) Odp, CodiceArticolo, Fasi, FasiChiuse, UltimaModifica FROM #odp ORDER BY UltimaModifica, Odp;

IF @Esegui = 0
BEGIN
    PRINT 'PROVA: nessuna modifica. Per procedere impostare @Esegui = 1 ed eseguire di nuovo.';
    RETURN;
END

IF @nOdp = 0
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
  JOIN dbo.[Brighetti_Attività] a ON a.[IdAttività] = t.[IdAttività]
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');

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
  JOIN dbo.[Brighetti_Attività] a ON a.[IdAttività] = t.[IdAttività]
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');
DECLARE @tolteTempi INT = @@ROWCOUNT;

DELETE a
  FROM dbo.[Brighetti_Attività] a
  JOIN #odp o ON o.Odp = ISNULL(a.OrdineDiProduzione, N'(senza ODP)');
DECLARE @tolteAttivita INT = @@ROWCOUNT;

COMMIT TRANSACTION;

PRINT CONCAT('FATTO: tolti ', @nOdp, ' ODP, ', @tolteAttivita, ' attivita'' e ', @tolteTempi, ' tempi (copiati in dbo.Archivio_Brighetti_Attivita / dbo.Archivio_Brighetti_Tempi).');
PRINT CONCAT('Backup completo precedente alla pulizia: ', @FileBackup);
