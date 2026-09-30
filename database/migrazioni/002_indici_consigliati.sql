/* ============================================================================
   Indici consigliati (opzionali, idempotenti)
   ----------------------------------------------------------------------------
   Accelerano le query piu' frequenti (attivita' per macchina, note/documenti,
   letture macchina). Non modificano dati ne' colonne. Su tabelle molto grandi
   (Brighetti_Dati_Macchina) la creazione puo' richiedere qualche minuto:
   eseguire in un momento di basso carico.
   ============================================================================ */
SET NOCOUNT ON;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attivita_Macchina_Stato' AND object_id = OBJECT_ID('dbo.Brighetti_Attività'))
    CREATE NONCLUSTERED INDEX [IX_Attivita_Macchina_Stato] ON dbo.[Brighetti_Attività]([idMacchinaMagazzino], [StatoAttività]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Note_Elemento' AND object_id = OBJECT_ID('dbo.Brighetti_Note'))
    CREATE NONCLUSTERED INDEX [IX_Note_Elemento] ON dbo.Brighetti_Note([TypeElem], [IdEsterno]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documenti_Elemento' AND object_id = OBJECT_ID('dbo.Brighetti_Documenti'))
    CREATE NONCLUSTERED INDEX [IX_Documenti_Elemento] ON dbo.Brighetti_Documenti([TypeElem], [IdEsterno]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Tempi_Attivita' AND object_id = OBJECT_ID('dbo.Brighetti_Tempi'))
    CREATE NONCLUSTERED INDEX [IX_Tempi_Attivita] ON dbo.Brighetti_Tempi([IdAttività]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DatiMacchina_Macchina_Data' AND object_id = OBJECT_ID('dbo.Brighetti_Dati_Macchina'))
    CREATE NONCLUSTERED INDEX [IX_DatiMacchina_Macchina_Data] ON dbo.Brighetti_Dati_Macchina([idMacchina], [DataRilevazione]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DatiMacchinaCsv_Macchina_Data' AND object_id = OBJECT_ID('dbo.Brighetti_Dati_Macchina_Csv'))
    CREATE NONCLUSTERED INDEX [IX_DatiMacchinaCsv_Macchina_Data] ON dbo.Brighetti_Dati_Macchina_Csv([idMacchina], [DataRilevazione]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Planimetria_Macchina' AND object_id = OBJECT_ID('dbo.Brighetti_Planimetria'))
    CREATE NONCLUSTERED INDEX [IX_Planimetria_Macchina] ON dbo.Brighetti_Planimetria([IdEsternoMacchina]);
GO
PRINT 'Indici consigliati verificati.';
GO
