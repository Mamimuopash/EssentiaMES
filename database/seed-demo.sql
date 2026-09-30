/* ============================================================================
   EssentiaMES - Dati DEMO per ambienti di sviluppo/test
   ----------------------------------------------------------------------------
   NON eseguire in produzione. Crea reparti, magazzini e macchine con gli stessi
   nomi usati dalla generazione automatica dei cicli di lavoro (vedi
   src/lib/services/cicli.ts), qualche lettura macchina e i pin in planimetria.
   Idempotente: inserisce solo cio' che manca (confronto per nome).
   Gli utenti demo vengono creati da `npm run db:init -- --seed` (le password
   vanno cifrate in formato ASP.NET Identity, quindi non stanno in SQL).
   ============================================================================ */
SET NOCOUNT ON;
GO

DECLARE @now DATETIME = GETDATE();

IF NOT EXISTS (SELECT 1 FROM dbo.Brighetti_FamiglieProdotto)
    INSERT dbo.Brighetti_FamiglieProdotto(NomeFamiglia, DescrizioneFamiglia) VALUES (N'-', N'-'), (N'Brocce', N'Brocce standard e speciali'), (N'Punte', N'Punte e utensili');

/* Reparti */
DECLARE @reparti TABLE (Nome NVARCHAR(100), Descr NVARCHAR(200));
INSERT @reparti VALUES (N'Tornitura', N'Reparto torni'), (N'Fresatura', N'Reparto frese'),
    (N'Trattamento Termico', N'Conto lavoro esterno'), (N'Brunitura', N'Conto lavoro esterno'),
    (N'Rettifica', N'Reparto rettifiche'), (N'Affilatura', N'Reparto affilatrici');
INSERT dbo.Brighetti_Reparti(NomeReparto, DescrizioneReparto, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
SELECT r.Nome, r.Descr, N'', N'Sistema', @now FROM @reparti r
WHERE NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Reparti x WHERE x.NomeReparto = r.Nome);

/* Magazzini (TipologiaMagazzino: 0 interno, 1 conto lavoro) */
DECLARE @mag TABLE (Codice NVARCHAR(100), Descr NVARCHAR(200), Tipo TINYINT);
INSERT @mag VALUES (N'Magazzino Fresatura', N'Semilavorati da fresare', 0),
    (N'Magazzino Tratt. Termico', N'Semilavorati per trattamento termico', 1),
    (N'Magazzino Brunitura', N'Semilavorati per brunitura', 1),
    (N'Magazzino Rettifica', N'Semilavorati da rettificare', 0),
    (N'Magazzino Affilatura', N'Semilavorati da affilare', 0),
    (N'Magazzino Finito', N'Prodotti finiti', 0);
INSERT dbo.Brighetti_Magazzini(CodiceMagazzino, DescrizioneMagazzino, TipologiaMagazzino, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
SELECT m.Codice, m.Descr, m.Tipo, N'', N'Sistema', @now FROM @mag m
WHERE NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Magazzini x WHERE x.CodiceMagazzino = m.Codice);

/* Macchine (TipologiaMacchina: 0 non collegabile, 1 mtconnect, 2 opcua, 3 Schneeberger/CSV) */
DECLARE @mac TABLE (Nome NVARCHAR(100), Descr NVARCHAR(200), Reparto NVARCHAR(100), Tipo TINYINT);
INSERT @mac VALUES
    (N'Mazak 200MSY L', N'Tornio Mazak (brocce G)', N'Tornitura', 1),
    (N'Mazak 250 MSY', N'Tornio Mazak (brocce B)', N'Tornitura', 1),
    (N'Mazak VCN-530C', N'Centro di lavoro verticale', N'Fresatura', 0),
    (N'Macchina_Trattamento', N'Trattamento termico (C/L)', N'Trattamento Termico', 0),
    (N'Macchina_Brunitura', N'Brunitura (C/L)', N'Brunitura', 0),
    (N'Studer S33', N'Rettificatrice cilindrica', N'Rettifica', 0),
    (N'Macchina_Rettifica', N'Rettifica generica', N'Rettifica', 0),
    (N'Schneberger NGM/81', N'Affilatrice CNC', N'Affilatura', 3),
    (N'Macchina_Tornitura', N'Tornio generico', N'Tornitura', 0),
    (N'Macchina_Affilatura', N'Affilatrice generica', N'Affilatura', 0);
INSERT dbo.Brighetti_Macchine(NomeMacchina, DescrizioneMacchina, IdReparto, IdUtente, TipologiaMacchina, CollegamentoMacchina, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
SELECT m.Nome, m.Descr, r.IdReparto, N'0', m.Tipo, N'', N'', N'Sistema', @now
FROM @mac m JOIN dbo.Brighetti_Reparti r ON r.NomeReparto = m.Reparto
WHERE NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Macchine x WHERE x.NomeMacchina = m.Nome);

/* Pin in planimetria (percentuali) */
DECLARE @pin TABLE (Nome NVARCHAR(100), X NVARCHAR(20), Y NVARCHAR(20));
INSERT @pin VALUES (N'Mazak 200MSY L', N'79.7', N'41.4'), (N'Mazak VCN-530C', N'48.2', N'41.5'), (N'Schneberger NGM/81', N'43.9', N'15.7');
INSERT dbo.Brighetti_Planimetria(IdEsternoMacchina, posX, posY, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
SELECT m.IdMacchina, p.X, p.Y, N'', N'Sistema', @now
FROM @pin p JOIN dbo.Brighetti_Macchine m ON m.NomeMacchina = p.Nome
WHERE NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Planimetria x WHERE x.IdEsternoMacchina = m.IdMacchina);

/* Letture MTConnect di ieri per la Mazak 200MSY L (efficienza e stato macchina) */
DECLARE @mazak INT = (SELECT TOP 1 IdMacchina FROM dbo.Brighetti_Macchine WHERE NomeMacchina = N'Mazak 200MSY L');
IF @mazak IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Dati_Macchina WHERE idMacchina = @mazak)
BEGIN
    DECLARE @ieri DATETIME = DATEADD(DAY, -1, CAST(CAST(GETDATE() AS DATE) AS DATETIME));
    DECLARE @i INT = 0;
    WHILE @i < 48
    BEGIN
        INSERT dbo.Brighetti_Dati_Macchina(idMacchina, DatiValidi, DataRilevazione, Programma, ProgrammaDescrizione, PezziProdotti, StatoOperativoMacchina, EsecuzioneMacchina)
        VALUES (@mazak, 1, DATEADD(MINUTE, 360 + @i * 10, @ieri), N'O1234', N'BROCCIA G8 - SGROSSATURA', @i,
                CASE WHEN @i % 6 = 5 THEN N'MANUAL_DATA_INPUT' ELSE N'AUTOMATIC' END,
                CASE WHEN @i % 6 = 5 THEN N'STOPPED' WHEN @i % 7 = 3 THEN N'INTERRUPTED' ELSE N'ACTIVE' END);
        SET @i = @i + 1;
    END
END

/* Lavorazioni CSV di ieri per la Schneberger */
DECLARE @schn INT = (SELECT TOP 1 IdMacchina FROM dbo.Brighetti_Macchine WHERE NomeMacchina = N'Schneberger NGM/81');
IF @schn IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Dati_Macchina_Csv WHERE idMacchina = @schn)
BEGIN
    DECLARE @d DATETIME = DATEADD(HOUR, 8, DATEADD(DAY, -1, CAST(CAST(GETDATE() AS DATE) AS DATETIME)));
    INSERT dbo.Brighetti_Dati_Macchina_Csv(idMacchina, DatiValidi, DataRilevazione, DataLog, Programma, ProgrammaDescrizione, DataInizioLavorazione, DataFineLavorazione, PezziProdotti, TempoInManuale, [TempoInAttività], TempoInAutomatico, TempoInLavorazione)
    VALUES (@schn, 1, @d, @d, N'AFF-01', N'AFFILATURA BROCCIA G8', @d, DATEADD(MINUTE, 95, @d), 12, 5, 95, 85, 90),
           (@schn, 1, DATEADD(HOUR, 3, @d), DATEADD(HOUR, 3, @d), N'AFF-02', N'AFFILATURA BROCCIA B12', DATEADD(HOUR, 3, @d), DATEADD(MINUTE, 250, @d), 8, 3, 70, 60, 65);
END
GO
PRINT 'Dati demo inseriti.';
GO
